import { createHash, randomBytes } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { logChange } from "../activity"
import { transaction } from "../database"
import { notFound } from "../errors"

export interface AgentKey {
  id: number
  name: string
  createdAt: string
  lastUsedAt: string | null
}

const hash = (key: string) => createHash("sha256").update(key).digest("hex")

export function listAgentKeys(db: DatabaseSync): AgentKey[] {
  return db
    .prepare(
      "SELECT id, name, created_at AS createdAt, last_used_at AS lastUsedAt FROM agent_keys ORDER BY id"
    )
    .all() as unknown as AgentKey[]
}

/** Creates a key and returns it. It's shown once; only its hash is kept. */
export function createAgentKey(
  db: DatabaseSync,
  name: string
): { key: string; agentKey: AgentKey } {
  return transaction(db, () => {
    const key = `beka_${randomBytes(32).toString("base64url")}`
    const id = Number(
      db
        .prepare(
          "INSERT INTO agent_keys (name, hash, created_at) VALUES (?, ?, ?)"
        )
        .run(name.trim(), hash(key), new Date().toISOString()).lastInsertRowid
    )
    const agentKey = listAgentKeys(db).find((k) => k.id === id)!
    logChange(db, {
      action: "create",
      entity: "agent_key",
      entityId: id,
      summary: `Created the agent key ${agentKey.name}`,
      after: agentKey,
    })
    return { key, agentKey }
  })
}

export function revokeAgentKey(db: DatabaseSync, id: number) {
  transaction(db, () => {
    const before = listAgentKeys(db).find((k) => k.id === id)
    if (!before) throw notFound("agent key")
    db.prepare("DELETE FROM agent_keys WHERE id = ?").run(id)
    logChange(db, {
      action: "delete",
      entity: "agent_key",
      entityId: id,
      summary: `Revoked the agent key ${before.name}`,
      before,
    })
  })
}

/** Checks a key from an `Authorization: Bearer` header, noting when it was used. */
export function verifyAgentKey(
  db: DatabaseSync,
  key: string | undefined
): boolean {
  if (!key) return false
  const row = db
    .prepare("SELECT id FROM agent_keys WHERE hash = ?")
    .get(hash(key)) as { id: number } | undefined
  if (!row) return false
  db.prepare("UPDATE agent_keys SET last_used_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    row.id
  )
  return true
}
