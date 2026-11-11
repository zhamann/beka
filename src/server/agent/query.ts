import { spawn } from "node:child_process"

import { databasePath } from "../database"
import { BekaError } from "../errors"

/** The most rows `query_database` returns. */
export const QUERY_ROW_LIMIT = 500
/** How long a query may run before it's stopped. */
export const QUERY_TIME_LIMIT = 5000
/** The most JSON a query may send back. */
const OUTPUT_LIMIT = 8 * 1024 * 1024

/**
 * Runs in its own Node process, so a slow query can't hold up the server
 * and can be stopped. It opens the database read-only and lets SQLite
 * compile only reads: no ATTACH, VACUUM, writing PRAGMAs, or extensions.
 */
const RUNNER = `
import { DatabaseSync, constants as c } from "node:sqlite"

const SCHEMA_PRAGMAS = new Set([
  "table_info", "table_xinfo", "table_list", "index_list", "index_info",
  "index_xinfo", "foreign_key_list",
])
const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const { path, sql, limit } = JSON.parse(Buffer.concat(chunks).toString())
let reply
try {
  const db = new DatabaseSync(path, {
    readOnly: true,
    limits: { length: 1_000_000 },
  })
  db.exec("PRAGMA query_only = ON")
  db.setAuthorizer((action, first, second) => {
    switch (action) {
      case c.SQLITE_SELECT:
      case c.SQLITE_READ:
      case c.SQLITE_RECURSIVE:
        return c.SQLITE_OK
      case c.SQLITE_FUNCTION:
        return second === "load_extension" ? c.SQLITE_DENY : c.SQLITE_OK
      case c.SQLITE_PRAGMA:
        return SCHEMA_PRAGMAS.has(String(first).toLowerCase())
          ? c.SQLITE_OK
          : c.SQLITE_DENY
      default:
        return c.SQLITE_DENY
    }
  })
  const rows = []
  let truncated = false
  for (const row of db.prepare(sql).iterate()) {
    if (rows.length === limit) {
      truncated = true
      break
    }
    rows.push(row)
  }
  reply = { rows, truncated }
} catch (error) {
  const message = String(error?.message ?? error)
  reply = {
    error: /not authorized|authorization denied/.test(message)
      ? "Only reads are allowed. Use the other tools to change data."
      : message,
  }
}
process.stdout.write(
  JSON.stringify(reply, (_, value) =>
    value instanceof Uint8Array ? \`(\${value.length} bytes)\` : value
  )
)
`

/** Runs one read-only SQL query in its own process and returns its rows. */
export function queryDatabase(
  sql: string,
  path = databasePath(),
  timeLimit = QUERY_TIME_LIMIT
): Promise<{ rows: unknown[]; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--input-type=module", "--eval", RUNNER],
      { stdio: ["pipe", "pipe", "ignore"] }
    )
    let output = ""
    let failure: BekaError | undefined
    const stop = (error: BekaError) => {
      failure ??= error
      child.kill("SIGKILL")
    }
    const timer = setTimeout(
      () =>
        stop(
          new BekaError(
            "invalid",
            `That query took longer than ${timeLimit / 1000} seconds. Narrow it down or add a LIMIT.`
          )
        ),
      timeLimit
    )
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      output += chunk
      if (output.length > OUTPUT_LIMIT)
        stop(
          new BekaError(
            "invalid",
            "That query returns too much. Select fewer columns or rows."
          )
        )
    })
    child.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on("close", () => {
      clearTimeout(timer)
      if (failure) return reject(failure)
      try {
        const reply = JSON.parse(output)
        if (reply.error) reject(new BekaError("invalid", reply.error))
        else resolve(reply)
      } catch {
        reject(new BekaError("invalid", "That query couldn't be run."))
      }
    })
    child.stdin.end(JSON.stringify({ path, sql, limit: QUERY_ROW_LIMIT }))
  })
}
