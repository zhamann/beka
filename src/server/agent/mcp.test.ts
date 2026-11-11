import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { listActivity } from "../activity"
import { getDatabase } from "../database"
import { createAgentKey, revokeAgentKey, verifyAgentKey } from "./keys"
import { handleMessage } from "./mcp"
import { QUERY_ROW_LIMIT, queryDatabase } from "./query"
import { tools } from "./tools"

let dir: string
let db: DatabaseSync

// The agent's tools run the app's own actions, which use the app's database.
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "beka-mcp-"))
  process.env.DATA_DIR = dir
  db = getDatabase()
})
afterAll(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const call = async (name: string, args: unknown = {}) => {
  const reply = (await handleMessage(db, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  })) as { result: { content: { text: string }[]; isError?: boolean } }
  const text = reply.result.content[0].text
  let value: unknown = text
  try {
    value = JSON.parse(text)
  } catch {
    // Plain text, like the import instructions or an error.
  }
  return { value, isError: reply.result.isError ?? false, text }
}

describe("MCP", () => {
  it("initializes with instructions and a supported protocol version", async () => {
    const reply = (await handleMessage(db, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test" },
      },
    })) as { result: { protocolVersion: string; instructions: string } }
    expect(reply.result.protocolVersion).toBe("2025-06-18")
    expect(reply.result.instructions).toContain("get_overview")
    expect(
      await handleMessage(db, {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      })
    ).toBeNull()
  })

  it("lists every tool with an input schema", async () => {
    const reply = (await handleMessage(db, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    })) as {
      result: { tools: { name: string; inputSchema: { type: string } }[] }
    }
    const names = reply.result.tools.map((t) => t.name)
    expect(names).toContain("get_overview")
    expect(names).toContain("record_balance")
    expect(names).toContain("import_transactions_csv")
    expect(names).not.toContain("import_transactions")
    expect(
      reply.result.tools.every((t) => t.inputSchema.type === "object")
    ).toBe(true)
    expect(names).toHaveLength(tools.length)
  })

  it("makes changes as the agent and reports problems as tool errors", async () => {
    const { value } = await call("create_member", {
      name: "Robin",
      birthYear: 1988,
    })
    expect(value).toMatchObject({ name: "Robin" })
    expect(listActivity(db)[0]).toMatchObject({
      actor: "agent",
      summary: "Added Robin to the household",
    })

    expect(
      await call("create_member", { name: "robin", birthYear: null })
    ).toMatchObject({
      isError: true,
      text: "Someone in the household already has that name.",
    })
    expect((await call("create_member", { name: "" })).isError).toBe(true)
    expect((await call("no_such_tool")).isError).toBe(true)
  })

  it("imports a CSV, stopping on any problem", async () => {
    await call("create_account", {
      name: "Checking",
      kind: "checking",
      subtype: "",
      institution: "",
      last4: "",
      ownerId: null,
      notes: "",
      balance: { amount: 100, asOf: "2026-11-01" },
    })
    const csv = (category: string) =>
      `date,merchant,description,amount,category,account,notes\n2026-11-02,Walmart,WALMART,-42.10,${category},Checking,`
    expect(
      (await call("import_transactions_csv", { csv: csv("Nope") })).value
    ).toMatchObject({
      saved: false,
      unknownCategories: ["Nope"],
    })
    expect(
      (await call("import_transactions_csv", { csv: csv("Groceries") })).value
    ).toMatchObject({ saved: true, added: 1 })
    expect(
      (await call("import_transactions_csv", { csv: csv("Groceries") })).value
    ).toMatchObject({ saved: true, added: 0, skipped: 1 })
  })

  it("answers read-only queries and refuses writes", async () => {
    expect(
      (
        await call("query_database", {
          sql: "SELECT merchant, amount FROM transactions",
        })
      ).value
    ).toEqual({
      rows: [{ merchant: "Walmart", amount: -4210 }],
      truncated: false,
    })
    const write = await call("query_database", {
      sql: "DELETE FROM transactions",
    })
    expect(write.isError).toBe(true)
    expect(
      (
        await call("query_database", {
          sql: "SELECT count(*) AS n FROM transactions",
        })
      ).value
    ).toMatchObject({
      rows: [{ n: 1 }],
    })
  })

  it("stops at reading the database", async () => {
    for (const sql of [
      "VACUUM INTO 'copy.db'",
      "ATTACH DATABASE 'other.db' AS other",
      "PRAGMA user_version = 1",
      "SELECT load_extension('x')",
    ]) {
      expect(await call("query_database", { sql })).toMatchObject({
        isError: true,
        text: "Only reads are allowed. Use the other tools to change data.",
      })
    }
    expect(existsSync(join(dir, "copy.db"))).toBe(false)
    expect(
      (await call("query_database", { sql: "PRAGMA table_info(members)" }))
        .isError
    ).toBe(false)
  })

  it("reports a bad query as a tool error", async () => {
    expect(
      await call("query_database", { sql: "SELECT * FROM nope" })
    ).toMatchObject({ isError: true, text: "no such table: nope" })
  })

  it("stops a query that runs too long or returns too much", async () => {
    const forever =
      "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n) SELECT count(*) FROM n"
    await expect(queryDatabase(forever, undefined, 500)).rejects.toThrow(
      "took longer than 0.5 seconds"
    )
    const { rows, truncated } = await queryDatabase(
      "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n) SELECT i FROM n"
    )
    expect(rows).toHaveLength(QUERY_ROW_LIMIT)
    expect(truncated).toBe(true)
  })

  it("gives an overview with reminders and definitions", async () => {
    const { value } = await call("get_overview")
    expect(value).toMatchObject({
      amountsAre: "integer cents",
      accounts: [{ name: "Checking", balance: 100_00 }],
    })
    expect((await call("get_import_instructions")).text).toContain(
      "- Walmart: Groceries 1×"
    )
  })
})

describe("agent keys", () => {
  it("accepts only live keys", async () => {
    const { key, agentKey } = createAgentKey(db, "Claude")
    expect(key).toMatch(/^beka_/)
    expect(verifyAgentKey(db, key)).toBe(true)
    expect(verifyAgentKey(db, "beka_wrong")).toBe(false)
    expect(verifyAgentKey(db, undefined)).toBe(false)
    revokeAgentKey(db, agentKey.id)
    expect(verifyAgentKey(db, key)).toBe(false)
  })
})
