import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { listAccounts } from "./accounts"
import { closeDatabase, getDatabase } from "./database"
import { listMembers } from "./household"
import { listJobs } from "./income"
import { listTransactions } from "./transactions"
import { loadSeed, type Seed } from "./seed"

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "beka-seed-"))
  process.env.DATA_DIR = dir
})
afterAll(() => {
  closeDatabase()
  rmSync(dir, { recursive: true, force: true })
})

const sample = (): Seed => ({
  ...JSON.parse(readFileSync("sample/seed.json", "utf8")),
  transactions: readFileSync("sample/transactions.csv", "utf8"),
})

describe("the sample household", () => {
  it("loads through the app's own operations", () => {
    loadSeed(sample(), { on: "2026-11-06" })
    const db = getDatabase()
    expect(listMembers(db).map((m) => m.name)).toEqual(["Alex", "Sam"])
    expect(listAccounts(db)).toHaveLength(13)
    expect(listJobs(db)).toHaveLength(2)
    expect(listTransactions(db).total).toBeGreaterThan(400)
  })

  it("only loads into an empty database, unless replacing", () => {
    expect(() => loadSeed(sample(), { on: "2026-11-06" })).toThrow(
      "already has data"
    )
    loadSeed(sample(), { replace: true, on: "2026-11-06" })
    expect(listMembers(getDatabase())).toHaveLength(2)
  })
})
