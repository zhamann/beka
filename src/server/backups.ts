import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { today } from "@/lib/dates"

import { logChange } from "./activity"
import {
  closeDatabase,
  databasePath,
  dataDir,
  getDatabase,
  openDatabase,
  SCHEMA_VERSION,
  whenDatabaseOpens,
} from "./database"
import { BekaError } from "./errors"

/** Backups older than this many days are deleted. */
export const KEEP_DAYS = 30

export const backupDir = () => join(dataDir(), "backups")

/** Backup file names: a date, then an optional kind and time. */
export const BACKUP_NAME = /^beka-(\d{4}-\d{2}-\d{2})(-[a-z]+-\d{9})?\.db$/

export interface Backup {
  name: string
  date: string
  kind: "daily" | "manual" | "before-restore"
  bytes: number
  createdAt: string
}

export function listBackups(): Backup[] {
  if (!existsSync(backupDir())) return []
  return readdirSync(backupDir())
    .filter((name) => BACKUP_NAME.test(name))
    .map((name) => {
      const [, date, suffix] = name.match(BACKUP_NAME)!
      const stat = statSync(join(backupDir(), name))
      const kind = suffix?.startsWith("-manual")
        ? "manual"
        : suffix?.startsWith("-before")
          ? "before-restore"
          : "daily"
      return {
        name,
        date,
        kind: kind as Backup["kind"],
        bytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** The time to the millisecond, so backups made in the same second don't collide. */
const stamp = () => {
  const now = new Date()
  return `${now.toTimeString().slice(0, 8).replace(/:/g, "")}${String(now.getMilliseconds()).padStart(3, "0")}`
}

/** Copies the database, consistently, into the backups folder. */
export function createBackup(
  kind: Backup["kind"] = "manual",
  on = today()
): Backup {
  mkdirSync(backupDir(), { recursive: true })
  const name =
    kind === "daily"
      ? `beka-${on}.db`
      : `beka-${on}-${kind === "manual" ? "manual" : "before"}-${stamp()}.db`
  const path = join(backupDir(), name)
  if (existsSync(path)) rmSync(path)
  getDatabase().exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`)
  return listBackups().find((b) => b.name === name)!
}

/** Deletes backups older than `KEEP_DAYS`. */
export function pruneBackups(on = today()) {
  const cutoff = new Date(`${on}T00:00:00`)
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS)
  const oldest = cutoff.toISOString().slice(0, 10)
  for (const backup of listBackups()) {
    if (backup.date < oldest) rmSync(join(backupDir(), backup.name))
  }
}

/** Makes today's backup if it doesn't exist yet, and prunes old ones. */
export function ensureDailyBackup(on = today()) {
  if (!existsSync(join(backupDir(), `beka-${on}.db`))) createBackup("daily", on)
  pruneBackups(on)
}

/** Each table's columns, to compare a database's shape with this version's. */
function schemaShape(db: DatabaseSync): string {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all() as { name: string }[]
  return tables
    .map(({ name }) => {
      const columns = db
        .prepare("SELECT name FROM pragma_table_info(?) ORDER BY name")
        .all(name) as { name: string }[]
      return `${name}(${columns.map((c) => c.name).join(",")})`
    })
    .join("\n")
}

/** Checks that a file is a Beka database this version can open. */
function checkBackupFile(path: string) {
  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(path, { readOnly: true })
    const { user_version: version } = db
      .prepare("PRAGMA user_version")
      .get() as { user_version: number }
    const tables = db
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
      .all() as { name: string }[]
    if (!tables.some((t) => t.name === "members") || version < 1) {
      throw new BekaError("invalid", "That file isn't a Beka backup.")
    }
    if (version > SCHEMA_VERSION) {
      throw new BekaError(
        "invalid",
        "That backup is from a newer version of Beka. Update Beka first."
      )
    }
  } catch (error) {
    if (error instanceof BekaError) throw error
    throw new BekaError("invalid", "That file isn't a Beka backup.")
  } finally {
    db?.close()
  }
}

/**
 * Brings a copy of a backup up to date in `staged` and checks that it has
 * every table and column this version expects, so a broken file never
 * replaces the database.
 */
function stageBackup(path: string, staged: string) {
  checkBackupFile(path)
  copyFileSync(path, staged)
  let db: DatabaseSync | undefined
  const fresh = openDatabase(":memory:")
  try {
    db = openDatabase(staged)
    const [{ integrity_check: integrity }] = db
      .prepare("PRAGMA integrity_check")
      .all() as { integrity_check: string }[]
    if (integrity !== "ok" || schemaShape(db) !== schemaShape(fresh)) {
      throw new BekaError("invalid", "That backup is damaged or incomplete.")
    }
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  } catch (error) {
    if (error instanceof BekaError) throw error
    throw new BekaError("invalid", "That backup is damaged or incomplete.")
  } finally {
    db?.close()
    fresh.close()
  }
}

/** Puts the file at `path` in place of the database. */
function replaceDatabase(path: string) {
  closeDatabase()
  for (const suffix of ["-wal", "-shm"])
    rmSync(`${databasePath()}${suffix}`, { force: true })
  copyFileSync(path, databasePath())
}

/**
 * Replaces the database with a backup. The current data is backed up first,
 * so a restore can itself be undone, and is put back if the restore fails.
 */
export function restoreBackup(
  source: { name: string } | { bytes: Uint8Array; fileName: string }
) {
  mkdirSync(backupDir(), { recursive: true })
  let path: string
  if ("name" in source) {
    if (!BACKUP_NAME.test(source.name))
      throw new BekaError("not-found", "That backup no longer exists.")
    path = join(backupDir(), source.name)
    if (!existsSync(path))
      throw new BekaError("not-found", "That backup no longer exists.")
  } else {
    path = join(backupDir(), `upload-${Date.now()}.db`)
    writeFileSync(path, source.bytes)
  }
  const staged = join(backupDir(), `staged-${Date.now()}.db`)
  try {
    stageBackup(path, staged)
    const safety = createBackup("before-restore")
    try {
      replaceDatabase(staged)
      logChange(getDatabase(), {
        action: "restore",
        entity: "backup",
        summary: `Restored a backup (${"name" in source ? source.name : source.fileName}); the data before it is in ${safety.name}`,
      })
    } catch (error) {
      replaceDatabase(join(backupDir(), safety.name))
      getDatabase()
      throw error
    }
  } finally {
    for (const file of [staged, `${staged}-wal`, `${staged}-shm`])
      rmSync(file, { force: true })
    if (!("name" in source)) rmSync(path, { force: true })
  }
}

let scheduled = false

/** Starts daily backups for the running app: once at startup, then hourly checks. */
export function scheduleBackups() {
  if (scheduled) return
  scheduled = true
  whenDatabaseOpens(() => {
    try {
      ensureDailyBackup()
    } catch (error) {
      console.error("Daily backup failed:", error)
    }
  })
  setInterval(
    () => {
      try {
        ensureDailyBackup()
      } catch (error) {
        console.error("Daily backup failed:", error)
      }
    },
    60 * 60 * 1000
  ).unref()
}
