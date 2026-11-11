import type { DatabaseSync } from "node:sqlite"

import type { CategoryType } from "@/lib/categories"
import { formatDate } from "@/lib/dates"

import { logChange } from "./activity"
import { transaction } from "./database"
import {
  notFound,
  SQLITE_CONSTRAINT_FOREIGNKEY,
  translate,
  BekaError,
} from "./errors"
import { linkRecurring } from "./recurring"

export interface TransactionInput {
  date: string
  accountId: number
  merchant: string
  description: string
  /** Cents: negative is money out. */
  amount: number
  categoryId: number
  notes: string
}

export interface Transaction extends TransactionInput {
  id: number
  accountName: string
  categoryName: string
  categoryType: CategoryType
  importId: number | null
  recurringId: number | null
  recurringName: string | null
}

const select = `SELECT t.id, t.date, t.account_id AS accountId, a.name AS accountName,
  t.merchant, t.description, t.amount, t.category_id AS categoryId,
  c.name AS categoryName, c.type AS categoryType, t.notes, t.import_id AS importId,
  t.recurring_id AS recurringId, r.name AS recurringName
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  JOIN categories c ON c.id = t.category_id
  LEFT JOIN recurring r ON r.id = t.recurring_id`

export function getTransaction(db: DatabaseSync, id: number): Transaction {
  const row = db.prepare(`${select} WHERE t.id = ?`).get(id) as
    Transaction | undefined
  if (!row) throw notFound("transaction")
  return row
}

export interface TransactionFilter {
  /** Matches merchant, description, or notes. */
  search?: string
  accountId?: number
  categoryId?: number
  /** Any of these categories, like the ones a Dashboard row adds up. */
  categoryIds?: number[]
  /** `YYYY-MM`. */
  month?: string
  /** A range of months, `YYYY-MM`, both ends included. */
  from?: string
  to?: string
  /** Leave out charges linked to a recurring payment, like Spending does. */
  excludeRecurring?: boolean
  /** Only the charges linked to this recurring payment. */
  recurringId?: number
}

export const TRANSACTION_PAGE_SIZE = 50

function where(filter: TransactionFilter) {
  const clauses: string[] = []
  const params: (string | number)[] = []
  if (filter.search?.trim()) {
    clauses.push(
      "(t.merchant LIKE ? OR t.description LIKE ? OR t.notes LIKE ?)"
    )
    const like = `%${filter.search.trim().replace(/[%_]/g, "")}%`
    params.push(like, like, like)
  }
  if (filter.accountId !== undefined) {
    clauses.push("t.account_id = ?")
    params.push(filter.accountId)
  }
  if (filter.categoryId !== undefined) {
    clauses.push("t.category_id = ?")
    params.push(filter.categoryId)
  }
  if (filter.categoryIds?.length) {
    clauses.push(
      `t.category_id IN (${filter.categoryIds.map(() => "?").join(", ")})`
    )
    params.push(...filter.categoryIds)
  }
  if (filter.month) {
    clauses.push("t.date LIKE ?")
    params.push(`${filter.month}-%`)
  }
  if (filter.from) {
    clauses.push("t.date >= ?")
    params.push(`${filter.from}-01`)
  }
  if (filter.to) {
    clauses.push("t.date <= ?")
    params.push(`${filter.to}-31`)
  }
  if (filter.excludeRecurring) clauses.push("t.recurring_id IS NULL")
  if (filter.recurringId !== undefined) {
    clauses.push("t.recurring_id = ?")
    params.push(filter.recurringId)
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params }
}

/** Transactions matching `filter`, newest first, a page at a time. */
export function listTransactions(
  db: DatabaseSync,
  filter: TransactionFilter = {},
  page = 1
): { transactions: Transaction[]; total: number; sum: number } {
  const { sql, params } = where(filter)
  const { n: total, sum } = db
    .prepare(
      `SELECT count(*) AS n, coalesce(sum(t.amount), 0) AS sum FROM transactions t ${sql}`
    )
    .get(...params) as { n: number; sum: number }
  const transactions = db
    .prepare(
      `${select} ${sql} ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?`
    )
    .all(
      ...params,
      TRANSACTION_PAGE_SIZE,
      (page - 1) * TRANSACTION_PAGE_SIZE
    ) as unknown as Transaction[]
  return { transactions, total, sum }
}

const missing = new BekaError(
  "not-found",
  "That account or category no longer exists."
)

/**
 * Adds one transaction by hand, for something no upload will carry, like a
 * cash purchase. It's linked to a recurring payment if its merchant has one.
 */
export function createTransaction(
  db: DatabaseSync,
  input: TransactionInput
): Transaction {
  return transaction(db, () => {
    let id: number
    try {
      id = Number(
        db
          .prepare(
            `INSERT INTO transactions (date, account_id, merchant, description, amount, category_id, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            input.date,
            input.accountId,
            input.merchant.trim(),
            input.description.trim(),
            input.amount,
            input.categoryId,
            input.notes.trim()
          ).lastInsertRowid
      )
    } catch (error) {
      translate(error, { [SQLITE_CONSTRAINT_FOREIGNKEY]: missing })
    }
    linkRecurring(db)
    const after = getTransaction(db, id!)
    logChange(db, {
      action: "create",
      entity: "transaction",
      entityId: after.id,
      summary: `Added ${after.merchant} on ${formatDate(after.date)}`,
      after,
    })
    return after
  })
}

/** Edits one transaction. */
export function updateTransaction(
  db: DatabaseSync,
  id: number,
  input: TransactionInput
): Transaction {
  return transaction(db, () => {
    const before = getTransaction(db, id)
    try {
      db.prepare(
        `UPDATE transactions SET date = ?, account_id = ?, merchant = ?, description = ?,
         amount = ?, category_id = ?, notes = ? WHERE id = ?`
      ).run(
        input.date,
        input.accountId,
        input.merchant.trim(),
        input.description.trim(),
        input.amount,
        input.categoryId,
        input.notes.trim(),
        id
      )
    } catch (error) {
      translate(error, { [SQLITE_CONSTRAINT_FOREIGNKEY]: missing })
    }
    const after = getTransaction(db, id)
    logChange(db, {
      action: "update",
      entity: "transaction",
      entityId: id,
      summary: `Updated ${after.merchant} on ${formatDate(after.date)}`,
      before,
      after,
    })
    return after
  })
}

/** Moves several transactions to one category. */
export function recategorize(
  db: DatabaseSync,
  ids: number[],
  categoryId: number
): number {
  return transaction(db, () => {
    const before = ids.map((id) => getTransaction(db, id))
    try {
      const update = db.prepare(
        "UPDATE transactions SET category_id = ? WHERE id = ?"
      )
      for (const id of ids) update.run(categoryId, id)
    } catch (error) {
      translate(error, { [SQLITE_CONSTRAINT_FOREIGNKEY]: missing })
    }
    const category = db
      .prepare("SELECT name FROM categories WHERE id = ?")
      .get(categoryId) as {
      name: string
    }
    logChange(db, {
      action: "update",
      entity: "transaction",
      summary:
        ids.length === 1
          ? `Moved ${before[0].merchant} on ${formatDate(before[0].date)} to ${category.name}`
          : `Moved ${ids.length} transactions to ${category.name}`,
      before: before.map((t) => ({
        id: t.id,
        categoryId: t.categoryId,
        categoryName: t.categoryName,
      })),
      after: { categoryId, categoryName: category.name },
    })
    return ids.length
  })
}

export function deleteTransactions(db: DatabaseSync, ids: number[]): number {
  return transaction(db, () => {
    const before = ids.map((id) => getTransaction(db, id))
    const remove = db.prepare("DELETE FROM transactions WHERE id = ?")
    for (const id of ids) remove.run(id)
    logChange(db, {
      action: "delete",
      entity: "transaction",
      summary:
        ids.length === 1
          ? `Deleted ${before[0].merchant} on ${formatDate(before[0].date)}`
          : `Deleted ${ids.length} transactions`,
      before,
    })
    return ids.length
  })
}

export interface MerchantHistory {
  merchant: string
  /** Categories used, most-used first, with when each was last used. */
  categories: { name: string; count: number; lastUsed: string }[]
}

/**
 * How each merchant's transactions have been categorized, so an AI can
 * follow the household's choices. The latest dates show when a choice changed.
 */
export function categorizationGuide(db: DatabaseSync): MerchantHistory[] {
  const rows = db
    .prepare(
      `SELECT t.merchant AS merchant, c.name AS name, count(*) AS count, max(t.date) AS lastUsed
       FROM transactions t JOIN categories c ON c.id = t.category_id
       GROUP BY t.merchant COLLATE NOCASE, c.id
       ORDER BY t.merchant COLLATE NOCASE, count DESC, lastUsed DESC`
    )
    .all() as {
    merchant: string
    name: string
    count: number
    lastUsed: string
  }[]
  const byMerchant = new Map<string, MerchantHistory>()
  for (const row of rows) {
    const key = row.merchant.toLowerCase()
    if (!byMerchant.has(key))
      byMerchant.set(key, { merchant: row.merchant, categories: [] })
    byMerchant.get(key)!.categories.push({
      name: row.name,
      count: row.count,
      lastUsed: row.lastUsed,
    })
  }
  return [...byMerchant.values()]
}

/** The category a merchant was given most recently, if it has history. */
export function latestCategory(history: MerchantHistory): string {
  return [...history.categories].sort((a, b) =>
    b.lastUsed.localeCompare(a.lastUsed)
  )[0].name
}

/** The months with transactions, newest first, as `YYYY-MM`. */
export function transactionMonths(db: DatabaseSync): string[] {
  return (
    db
      .prepare(
        "SELECT DISTINCT substr(date, 1, 7) AS month FROM transactions ORDER BY month DESC"
      )
      .all() as { month: string }[]
  ).map((row) => row.month)
}
