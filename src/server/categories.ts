import type { DatabaseSync } from "node:sqlite"

import { CATEGORY_COLORS, type CategoryType } from "@/lib/categories"

import { logChange } from "./activity"
import { transaction } from "./database"
import {
  BekaError,
  notFound,
  SQLITE_CONSTRAINT_FOREIGNKEY,
  SQLITE_CONSTRAINT_TRIGGER,
  SQLITE_CONSTRAINT_UNIQUE,
  translate,
} from "./errors"

export interface Category {
  id: number
  name: string
  type: CategoryType
  hidden: boolean
  builtin: boolean
  /** Which of the theme's `category-N` colors it wears, 1 to 8. */
  color: number
  /** How many transactions use it. */
  transactionCount: number
}

interface CategoryRow {
  id: number
  name: string
  type: CategoryType
  hidden: number
  builtin: number
  color: number
  transactionCount: number
}

const toCategory = (row: CategoryRow): Category => ({
  ...row,
  hidden: row.hidden === 1,
  builtin: row.builtin === 1,
})

const select = `SELECT c.id, c.name, c.type, c.hidden, c.builtin, c.color,
  (SELECT count(*) FROM transactions t WHERE t.category_id = c.id) AS transactionCount
  FROM categories c`

/** Every category, sorted by name. */
export function listCategories(db: DatabaseSync): Category[] {
  return (
    db
      .prepare(`${select} ORDER BY c.name COLLATE NOCASE`)
      .all() as unknown as CategoryRow[]
  ).map(toCategory)
}

export function getCategory(db: DatabaseSync, id: number): Category {
  const row = db.prepare(`${select} WHERE c.id = ?`).get(id) as
    CategoryRow | undefined
  if (!row) throw notFound("category")
  return toCategory(row)
}

const duplicate = new BekaError(
  "duplicate-name",
  "A category with that name already exists."
)

export interface CategoryInput {
  name: string
  type: CategoryType
  hidden: boolean
  /** Left out, a new category takes the color the fewest others wear. */
  color?: number
}

/** The color the fewest spending categories wear, the lowest on a tie. */
function quietestColor(db: DatabaseSync): number {
  const used = new Map(
    (
      db
        .prepare(
          "SELECT color, count(*) AS count FROM categories WHERE type = 'spending' GROUP BY color"
        )
        .all() as { color: number; count: number }[]
    ).map((row) => [row.color, row.count])
  )
  return CATEGORY_COLORS.map(({ color }) => color).reduce((best, color) =>
    (used.get(color) ?? 0) < (used.get(best) ?? 0) ? color : best
  )
}

export function createCategory(
  db: DatabaseSync,
  input: CategoryInput
): Category {
  return transaction(db, () => {
    let id: number
    try {
      id = Number(
        db
          .prepare(
            "INSERT INTO categories (name, type, hidden, color) VALUES (?, ?, ?, ?)"
          )
          .run(
            input.name.trim(),
            input.type,
            input.hidden ? 1 : 0,
            input.color ?? quietestColor(db)
          ).lastInsertRowid
      )
    } catch (error) {
      translate(error, { [SQLITE_CONSTRAINT_UNIQUE]: duplicate })
    }
    const category = getCategory(db, id)
    logChange(db, {
      action: "create",
      entity: "category",
      entityId: id,
      summary: `Added the category ${category.name}`,
      after: category,
    })
    return category
  })
}

export function updateCategory(
  db: DatabaseSync,
  id: number,
  input: CategoryInput
): Category {
  return transaction(db, () => {
    const before = getCategory(db, id)
    if (before.builtin && input.name.trim() !== before.name) {
      throw new BekaError("invalid", `${before.name} can't be renamed.`)
    }
    try {
      db.prepare(
        "UPDATE categories SET name = ?, type = ?, hidden = ?, color = ? WHERE id = ?"
      ).run(
        input.name.trim(),
        input.type,
        input.hidden ? 1 : 0,
        input.color ?? before.color,
        id
      )
    } catch (error) {
      translate(error, { [SQLITE_CONSTRAINT_UNIQUE]: duplicate })
    }
    const after = getCategory(db, id)
    logChange(db, {
      action: "update",
      entity: "category",
      entityId: id,
      summary: `Updated the category ${after.name}`,
      before,
      after,
    })
    return after
  })
}

/** Deletes an unused category, or moves its transactions to `moveTo` first. */
export function deleteCategory(
  db: DatabaseSync,
  id: number,
  moveTo: number | null = null
) {
  transaction(db, () => {
    const before = getCategory(db, id)
    if (before.builtin)
      throw new BekaError("invalid", `${before.name} can't be deleted.`)
    if (moveTo !== null) {
      const target = getCategory(db, moveTo)
      const moved = db
        .prepare(
          "UPDATE transactions SET category_id = ? WHERE category_id = ?"
        )
        .run(moveTo, id).changes
      if (moved > 0) {
        logChange(db, {
          action: "update",
          entity: "transaction",
          summary: `Moved ${moved} transactions from ${before.name} to ${target.name}`,
          before: { categoryId: id },
          after: { categoryId: moveTo },
        })
      }
    }
    try {
      db.prepare("DELETE FROM categories WHERE id = ?").run(id)
    } catch (error) {
      const inUse = new BekaError(
        "in-use",
        `Move ${before.name}'s transactions to another category first.`
      )
      translate(error, {
        [SQLITE_CONSTRAINT_FOREIGNKEY]: inUse,
        [SQLITE_CONSTRAINT_TRIGGER]: inUse,
      })
    }
    logChange(db, {
      action: "delete",
      entity: "category",
      entityId: id,
      summary: `Deleted the category ${before.name}`,
      before,
    })
  })
}
