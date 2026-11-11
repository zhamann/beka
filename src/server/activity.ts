import { AsyncLocalStorage } from "node:async_hooks"
import type { DatabaseSync } from "node:sqlite"

/** Who made a change: someone using the app, or the AI agent. */
export type Actor = "app" | "agent"

const actorStore = new AsyncLocalStorage<Actor>()

/** Runs `work` with every change inside it recorded as made by `actor`. */
export function runAs<T>(actor: Actor, work: () => T): T {
  return actorStore.run(actor, work)
}

export function currentActor(): Actor {
  return actorStore.getStore() ?? "app"
}

export interface Change {
  action: "create" | "update" | "delete" | "import" | "undo" | "restore"
  entity: string
  entityId?: number
  /** One line a person can read, like "Added Casey". */
  summary: string
  before?: unknown
  after?: unknown
}

/** Records a change in the activity log. Call it inside the change's transaction. */
export function logChange(db: DatabaseSync, change: Change) {
  db.prepare(
    `INSERT INTO activity (at, actor, action, entity, entity_id, summary, before, after)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    new Date().toISOString(),
    currentActor(),
    change.action,
    change.entity,
    change.entityId ?? null,
    change.summary,
    change.before === undefined ? null : JSON.stringify(change.before),
    change.after === undefined ? null : JSON.stringify(change.after)
  )
}

export interface ActivityEntry {
  id: number
  at: string
  actor: Actor
  action: string
  entity: string
  entityId: number | null
  summary: string
  before: unknown
  after: unknown
}

export const ACTIVITY_PAGE_SIZE = 50

/** The newest changes first, a page at a time; pass the last id seen to page. */
export function listActivity(
  db: DatabaseSync,
  { beforeId, actor }: { beforeId?: number; actor?: Actor } = {}
): ActivityEntry[] {
  const rows = db
    .prepare(
      `SELECT id, at, actor, action, entity, entity_id, summary, before, after
       FROM activity WHERE id < ? AND (? IS NULL OR actor = ?)
       ORDER BY id DESC LIMIT ?`
    )
    .all(
      beforeId ?? Number.MAX_SAFE_INTEGER,
      actor ?? null,
      actor ?? null,
      ACTIVITY_PAGE_SIZE
    ) as {
    id: number
    at: string
    actor: Actor
    action: string
    entity: string
    entity_id: number | null
    summary: string
    before: string | null
    after: string | null
  }[]
  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    actor: row.actor,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    summary: row.summary,
    before: row.before === null ? null : JSON.parse(row.before),
    after: row.after === null ? null : JSON.parse(row.after),
  }))
}
