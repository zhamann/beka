import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { listActivity } from "./activity"
import {
  createBackup,
  ensureDailyBackup,
  listBackups,
  pruneBackups,
  restoreBackup,
} from "./backups"
import { closeDatabase, getDatabase, SCHEMA_VERSION } from "./database"
import { createMember, listMembers } from "./household"

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "beka-backups-"))
  process.env.DATA_DIR = dir
})
afterEach(() => {
  closeDatabase()
  rmSync(dir, { recursive: true, force: true })
})

describe("backups", () => {
  it("restores a backup, keeping a copy of the data it replaced", () => {
    createMember(getDatabase(), { name: "Robin", birthYear: null })
    const backup = createBackup("manual")
    createMember(getDatabase(), { name: "Casey", birthYear: null })

    restoreBackup({ name: backup.name })
    expect(listMembers(getDatabase()).map((m) => m.name)).toEqual(["Robin"])
    expect(listActivity(getDatabase())[0]).toMatchObject({ action: "restore" })

    const safety = listBackups().find((b) => b.kind === "before-restore")!
    restoreBackup({ name: safety.name })
    expect(listMembers(getDatabase()).map((m) => m.name)).toEqual([
      "Casey",
      "Robin",
    ])
  })

  it("makes one daily backup and deletes ones older than 30 days", () => {
    ensureDailyBackup("2026-10-01")
    ensureDailyBackup("2026-10-01")
    expect(listBackups().filter((b) => b.date === "2026-10-01")).toHaveLength(1)
    ensureDailyBackup("2026-11-06")
    pruneBackups("2026-11-06")
    expect(listBackups().some((b) => b.date === "2026-10-01")).toBe(false)
    expect(listBackups().some((b) => b.date === "2026-11-06")).toBe(true)
  })

  it("refuses files that aren't Beka backups", () => {
    createMember(getDatabase(), { name: "Robin", birthYear: null })
    expect(() =>
      restoreBackup({
        bytes: new TextEncoder().encode("not a database"),
        fileName: "x.db",
      })
    ).toThrow("isn't a Beka backup")
    const other = join(dir, "other.db")
    writeFileSync(other, "")
    expect(() => restoreBackup({ name: "../other.db" })).toThrow(
      "no longer exists"
    )
    expect(listMembers(getDatabase())).toHaveLength(1)
  })

  it("leaves the data alone when a backup is incomplete", () => {
    createMember(getDatabase(), { name: "Robin", birthYear: null })
    const partial = join(dir, "partial.db")
    const db = new DatabaseSync(partial)
    db.exec(`CREATE TABLE members (id INTEGER PRIMARY KEY, name TEXT);
      PRAGMA user_version = ${SCHEMA_VERSION}`)
    db.close()
    const before = listBackups().length
    expect(() =>
      restoreBackup({ bytes: readFileSync(partial), fileName: "partial.db" })
    ).toThrow("damaged or incomplete")
    expect(listMembers(getDatabase())).toHaveLength(1)
    expect(listBackups()).toHaveLength(before)
  })
})
