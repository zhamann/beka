import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { DatabaseSync } from "node:sqlite"

// Each file is applied once, in filename order; the count applied is stored in
// SQLite's `user_version`. Never edit a migration after it has shipped.
const migrations = Object.entries(
  import.meta.glob<string>("./migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  })
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, sql]) => sql)

export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true })

  const db = new DatabaseSync(path)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA foreign_keys = ON")
  migrate(db)
  return db
}

function migrate(db: DatabaseSync) {
  const { user_version: applied } = db.prepare("PRAGMA user_version").get() as {
    user_version: number
  }

  for (const [index, sql] of migrations.entries()) {
    if (index < applied) continue
    transaction(db, () => {
      db.exec(sql)
      db.exec(`PRAGMA user_version = ${index + 1}`)
    })
  }
}

let savepoints = 0

/** Runs `run` atomically. Nested calls use savepoints inside the outer one. */
export function transaction<T>(db: DatabaseSync, run: () => T): T {
  const nested = db.isTransaction
  const savepoint = `nested_${++savepoints}`
  db.exec(nested ? `SAVEPOINT ${savepoint}` : "BEGIN")
  try {
    const result = run()
    db.exec(nested ? `RELEASE ${savepoint}` : "COMMIT")
    return result
  } catch (error) {
    db.exec(
      nested ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : "ROLLBACK"
    )
    throw error
  }
}

let shared: DatabaseSync | undefined

/** The folder the app keeps its data in: `DATA_DIR`, or `./data`. */
export function dataDir(): string {
  return process.env.DATA_DIR ?? "data"
}

export function databasePath(): string {
  return join(dataDir(), "beka.db")
}

/** The app's database, stored in `DATA_DIR` (default `./data`). */
export function getDatabase(): DatabaseSync {
  if (!shared) {
    shared = openDatabase(databasePath())
    onOpen.forEach((listener) => listener(shared!))
  }
  return shared
}

const onOpen: ((db: DatabaseSync) => void)[] = []

/** Runs `listener` whenever the app's database opens, like after a restore. */
export function whenDatabaseOpens(listener: (db: DatabaseSync) => void) {
  onOpen.push(listener)
  if (shared) listener(shared)
}

/** Closes the app's database so its file can be replaced; the next `getDatabase` reopens it. */
export function closeDatabase() {
  shared?.close()
  shared = undefined
}

/** How many migrations this version has, which is the newest `user_version` it can open. */
export const SCHEMA_VERSION = migrations.length
