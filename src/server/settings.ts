import type { DatabaseSync } from "node:sqlite"

import { logChange } from "./activity"
import { transaction } from "./database"

/** Which out-of-date checks run, and how old a balance can get. */
export interface FreshnessRules {
  balances: boolean
  balanceDays: number
  transactions: boolean
  rotatingCategories: boolean
  taxTables: boolean
}

export const DEFAULT_RULES: FreshnessRules = {
  balances: true,
  balanceDays: 30,
  transactions: true,
  rotatingCategories: true,
  taxTables: true,
}

function readSetting<T>(db: DatabaseSync, key: string, fallback: T): T {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined
  return row ? { ...fallback, ...JSON.parse(row.value) } : fallback
}

export function freshnessRules(db: DatabaseSync): FreshnessRules {
  return readSetting(db, "freshness", DEFAULT_RULES)
}

export function updateFreshnessRules(
  db: DatabaseSync,
  rules: FreshnessRules
): FreshnessRules {
  return transaction(db, () => {
    const before = freshnessRules(db)
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('freshness', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value"
    ).run(JSON.stringify(rules))
    logChange(db, {
      action: "update",
      entity: "settings",
      summary: "Updated the out-of-date rules",
      before,
      after: rules,
    })
    return rules
  })
}
