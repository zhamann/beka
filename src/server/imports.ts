import type { DatabaseSync } from "node:sqlite"

import { CATEGORY_TYPE_DESCRIPTIONS, UNCATEGORIZED } from "@/lib/categories"
import { parseCsv } from "@/lib/csv"
import { ISO_DATE, today } from "@/lib/dates"

import { listAccounts } from "./accounts"
import { currentActor, logChange } from "./activity"
import { listCategories } from "./categories"
import { transaction } from "./database"
import { BekaError, notFound } from "./errors"
import {
  linkRecurring,
  listRecurring,
  matchRecurring,
  suggestRecurring,
} from "./recurring"
import { categorizationGuide, latestCategory } from "./transactions"

export const IMPORT_COLUMNS = [
  "date",
  "merchant",
  "description",
  "amount",
  "category",
  "account",
  "notes",
] as const

const REQUIRED_COLUMNS = IMPORT_COLUMNS.filter((c) => c !== "notes")

/** The most rows one upload accepts. */
export const IMPORT_ROW_LIMIT = 20_000

export interface ImportRow {
  date: string
  merchant: string
  description: string
  /** Cents: negative is money out. */
  amount: number
  categoryId: number
  accountId: number
  notes: string
  /** Set to keep a charge from being linked to a recurring payment. */
  notRecurring?: boolean
}

export interface PreviewRow {
  /** The line in the file, counting the header as line 1. */
  line: number
  date: string
  merchant: string
  description: string
  amount: number
  category: string
  account: string
  notes: string
  categoryId: number | null
  accountId: number | null
  errors: string[]
  /** Already imported, so it will be skipped. */
  duplicate: boolean
  /**
   * Not an exact duplicate, but a stored transaction has the same account,
   * date, amount, and merchant, so it may be the same one with a different
   * bank description. Worth a look before importing.
   */
  possibleDuplicate: boolean
  /** The merchant's usual category, when this row differs from it. */
  usualCategory: string | null
  /** The recurring payment this charge will be linked to, if any. */
  recurring: { id: number; name: string } | null
}

export interface Preview {
  rows: PreviewRow[]
  /** A problem with the whole file, like a missing column. */
  fileError: string | null
  unknownCategories: string[]
  unknownAccounts: string[]
}

/** "$1,234.56", "-12.34", or "(12.34)" in dollars to cents. */
export function parseAmount(text: string): number | null {
  let value = text.trim().replace(/[$,\s]/g, "")
  let negative = false
  if (/^\(.*\)$/.test(value)) {
    negative = true
    value = value.slice(1, -1)
  }
  if (!/^[-+]?\d+(\.\d+)?$/.test(value)) return null
  const cents = Math.round(Number(value) * 100)
  return negative ? -cents : cents
}

/** `YYYY-MM-DD` or `M/D/YYYY` to `YYYY-MM-DD`. */
export function parseDate(text: string): string | null {
  const value = text.trim()
  let iso = value
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (us) iso = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`
  if (!ISO_DATE.test(iso)) return null
  const [y, m, d] = iso.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
    ? iso
    : null
}

const duplicateKey = (row: {
  accountId: number
  date: string
  amount: number
  description: string
}) =>
  `${row.accountId}|${row.date}|${row.amount}|${row.description.trim().toLowerCase()}`

/**
 * How many of each transaction are already stored. A file can hold real
 * repeats (four $2 charges on one day), so only that many copies are skipped.
 */
function existingCounts(
  db: DatabaseSync,
  rows: { accountId: number; date: string }[]
) {
  const counts = new Map<string, number>()
  if (rows.length === 0) return counts
  const dates = rows.map((r) => r.date).sort()
  const stored = db
    .prepare(
      `SELECT account_id AS accountId, date, amount, description FROM transactions
       WHERE date BETWEEN ? AND ?`
    )
    .all(dates[0], dates.at(-1)!) as {
    accountId: number
    date: string
    amount: number
    description: string
  }[]
  for (const row of stored) {
    const key = duplicateKey(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/** Marks rows already stored, leaving later copies in the same file alone. */
function markDuplicates<
  T extends {
    accountId: number | null
    date: string
    amount: number
    description: string
  },
>(db: DatabaseSync, rows: T[]): boolean[] {
  const valid = rows.filter(
    (r): r is T & { accountId: number } => r.accountId !== null
  )
  const remaining = existingCounts(db, valid)
  return rows.map((row) => {
    if (row.accountId === null) return false
    const key = duplicateKey(row as T & { accountId: number })
    const left = remaining.get(key) ?? 0
    if (left === 0) return false
    remaining.set(key, left - 1)
    return true
  })
}

/** The category each merchant usually gets, from its last ten transactions. */
function usualCategories(db: DatabaseSync): Map<string, string> {
  const rows = db
    .prepare(
      `SELECT merchant, name, count(*) AS count, max(date) AS last FROM (
         SELECT t.merchant, c.name, t.date,
           row_number() OVER (PARTITION BY lower(t.merchant) ORDER BY t.date DESC, t.id DESC) AS n
         FROM transactions t JOIN categories c ON c.id = t.category_id
       ) WHERE n <= 10
       GROUP BY lower(merchant), name ORDER BY lower(merchant), count DESC, last DESC`
    )
    .all() as { merchant: string; name: string }[]
  const usual = new Map<string, string>()
  for (const row of rows) {
    const key = row.merchant.toLowerCase()
    if (!usual.has(key)) usual.set(key, row.name)
  }
  return usual
}

/** Checks an uploaded CSV and shows what importing it would do. Nothing is saved. */
export function previewImport(db: DatabaseSync, csv: string): Preview {
  const [header, ...lines] = parseCsv(csv)
  const empty = { rows: [], unknownCategories: [], unknownAccounts: [] }
  if (!header) return { ...empty, fileError: "The file is empty." }
  const columns = header.map((name) => name.trim().toLowerCase())
  const missing = REQUIRED_COLUMNS.filter((name) => !columns.includes(name))
  if (missing.length) {
    return {
      ...empty,
      fileError: `The file needs ${missing.length === 1 ? "a column" : "columns"} named ${missing.join(", ")}. Its first row should name these columns, in order: ${IMPORT_COLUMNS.join(", ")}`,
    }
  }
  if (lines.length > IMPORT_ROW_LIMIT) {
    return {
      ...empty,
      fileError: `Upload at most ${IMPORT_ROW_LIMIT.toLocaleString()} rows at a time.`,
    }
  }
  const column = (row: string[], name: string) =>
    (row[columns.indexOf(name)] ?? "").trim()

  const categories = new Map(
    listCategories(db).map((c) => [c.name.toLowerCase(), c])
  )
  const accounts = new Map(
    [...listAccounts(db), ...listAccounts(db, { archived: true })].map((a) => [
      a.name.toLowerCase(),
      a,
    ])
  )
  const usual = usualCategories(db)
  const payments = listRecurring(db)
  const unknownCategories = new Set<string>()
  const unknownAccounts = new Set<string>()

  const rows: PreviewRow[] = lines.map((line, index) => {
    const errors: string[] = []
    const rawDate = column(line, "date")
    const date = parseDate(rawDate)
    if (!date) errors.push(`“${rawDate}” isn't a date like 2026-11-06.`)
    const rawAmount = column(line, "amount")
    const amount = parseAmount(rawAmount)
    if (amount === null)
      errors.push(`“${rawAmount}” isn't an amount like -12.34.`)
    const merchant = column(line, "merchant")
    if (!merchant) errors.push("The merchant is blank.")
    const categoryName = column(line, "category")
    const category = categories.get(categoryName.toLowerCase())
    if (!category) {
      errors.push(
        categoryName
          ? `There's no category named “${categoryName}”.`
          : "The category is blank."
      )
      if (categoryName) unknownCategories.add(categoryName)
    }
    const accountName = column(line, "account")
    const account = accounts.get(accountName.toLowerCase())
    if (!account) {
      errors.push(
        accountName
          ? `There's no account named “${accountName}”.`
          : "The account is blank."
      )
      if (accountName) unknownAccounts.add(accountName)
    }
    const usualName = usual.get(merchant.toLowerCase())
    return {
      line: index + 2,
      date: date ?? rawDate,
      merchant,
      description: column(line, "description"),
      amount: amount ?? 0,
      category: category?.name ?? categoryName,
      account: account?.name ?? accountName,
      notes: column(line, "notes"),
      categoryId: category?.id ?? null,
      accountId: account?.id ?? null,
      errors,
      duplicate: false,
      possibleDuplicate: false,
      usualCategory:
        usualName && category && usualName !== category.name ? usualName : null,
      recurring:
        amount !== null && amount < 0 && category?.type === "spending"
          ? matchRecurring(payments, merchant, -amount)
          : null,
    }
  })
  markDuplicates(
    db,
    rows.map((row) => ({
      ...row,
      accountId: row.errors.length ? null : row.accountId,
    }))
  ).forEach((duplicate, index) => {
    rows[index].duplicate = duplicate
  })
  const sameCharge = db.prepare(
    `SELECT 1 FROM transactions WHERE account_id = ? AND date = ? AND amount = ?
     AND lower(merchant) = lower(?) LIMIT 1`
  )
  for (const row of rows) {
    if (row.duplicate || row.errors.length || row.accountId === null) continue
    row.possibleDuplicate =
      sameCharge.get(row.accountId, row.date, row.amount, row.merchant) !==
      undefined
  }
  return {
    rows,
    fileError: null,
    unknownCategories: [...unknownCategories].sort(),
    unknownAccounts: [...unknownAccounts].sort(),
  }
}

export interface ImportResult {
  importId: number | null
  added: number
  skipped: number
}

/**
 * Saves transactions, skipping ones already stored. Every row must name an
 * existing account and category.
 */
export function importTransactions(
  db: DatabaseSync,
  rows: ImportRow[],
  fileName = "",
  /** Today, for deciding which payments are still recurring. */
  on = today()
): ImportResult {
  return transaction(db, () => {
    const categoryIds = new Set(listCategories(db).map((c) => c.id))
    const accountIds = new Set(
      [...listAccounts(db), ...listAccounts(db, { archived: true })].map(
        (a) => a.id
      )
    )
    rows.forEach((row, index) => {
      if (!categoryIds.has(row.categoryId) || !accountIds.has(row.accountId)) {
        throw new BekaError(
          "not-found",
          `Row ${index + 1} names an account or category that no longer exists.`
        )
      }
      if (!parseDate(row.date))
        throw new BekaError("invalid", `Row ${index + 1} has an invalid date.`)
      if (!row.merchant.trim())
        throw new BekaError("invalid", `Row ${index + 1} has no merchant.`)
    })
    const duplicates = markDuplicates(db, rows)
    const fresh = rows.filter((_, index) => !duplicates[index])
    if (fresh.length === 0)
      return { importId: null, added: 0, skipped: rows.length }

    const importId = Number(
      db
        .prepare(
          "INSERT INTO imports (imported_at, actor, file_name, added, skipped) VALUES (?, ?, ?, ?, ?)"
        )
        .run(
          new Date().toISOString(),
          currentActor(),
          fileName.trim(),
          fresh.length,
          rows.length - fresh.length
        ).lastInsertRowid
    )
    const insert = db.prepare(
      `INSERT INTO transactions (date, account_id, merchant, description, amount, category_id, notes, import_id, not_recurring)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const row of fresh) {
      insert.run(
        row.date,
        row.accountId,
        row.merchant.trim(),
        row.description.trim(),
        row.amount,
        row.categoryId,
        row.notes.trim(),
        importId,
        row.notRecurring ? 1 : 0
      )
    }
    linkRecurring(db)
    suggestRecurring(db, on)
    logChange(db, {
      action: "import",
      entity: "import",
      entityId: importId,
      summary: `Imported ${fresh.length} transactions${fileName ? ` from ${fileName}` : ""}`,
      after: {
        added: fresh.length,
        skipped: rows.length - fresh.length,
        fileName,
      },
    })
    return {
      importId,
      added: fresh.length,
      skipped: rows.length - fresh.length,
    }
  })
}

export interface ImportRecord {
  id: number
  importedAt: string
  actor: "app" | "agent"
  fileName: string
  added: number
  skipped: number
  /** Transactions from it still stored. */
  remaining: number
  firstDate: string | null
  lastDate: string | null
}

export function listImports(db: DatabaseSync): ImportRecord[] {
  return db
    .prepare(
      `SELECT i.id, i.imported_at AS importedAt, i.actor, i.file_name AS fileName, i.added, i.skipped,
       count(t.id) AS remaining, min(t.date) AS firstDate, max(t.date) AS lastDate
       FROM imports i LEFT JOIN transactions t ON t.import_id = i.id
       GROUP BY i.id ORDER BY i.id DESC`
    )
    .all() as unknown as ImportRecord[]
}

/** Deletes an import and every transaction it added. */
export function undoImport(db: DatabaseSync, id: number): number {
  return transaction(db, () => {
    const record = listImports(db).find((i) => i.id === id)
    if (!record) throw notFound("import")
    db.prepare("DELETE FROM imports WHERE id = ?").run(id)
    logChange(db, {
      action: "undo",
      entity: "import",
      entityId: id,
      summary: `Undid an import, deleting ${record.remaining} transactions`,
      before: record,
    })
    return record.remaining
  })
}

/**
 * Instructions for the AI that turns bank exports into an upload: the format,
 * your categories, your accounts, and how you've categorized each merchant.
 */
export function aiInstructions(db: DatabaseSync): string {
  const categories = listCategories(db).filter((c) => !c.hidden)
  const accounts = listAccounts(db)
  const guide = categorizationGuide(db)
  const lines = [
    "# Preparing transactions for Beka",
    "",
    "Convert bank and credit card exports into one CSV file that Beka can import.",
    "",
    "## Format",
    "",
    `The first row must be exactly: ${IMPORT_COLUMNS.join(",")}`,
    "",
    "- **date**: when the transaction posted, as YYYY-MM-DD.",
    "- **merchant**: a short, clean name for who was paid or who paid, like “Walmart” or “Club Fitness”. Use the same spelling every time; reuse the merchant names listed below.",
    "- **description**: the original text from the bank, unchanged.",
    "- **amount**: negative for money out (purchases, payments, transfers out), positive for money in (refunds, paychecks, transfers in). No currency symbol needed. Flip the sign if the bank shows purchases as positive.",
    "- **category**: exactly one of the categories below.",
    "- **account**: exactly one of the account names below, for the account the transaction is on.",
    "- **notes**: optional.",
    "",
    "Quote any value that contains a comma. One purchase can be split across categories as several rows with the same date, merchant, and description.",
    "",
    "## Rules",
    "",
    "- Moving money between the household's own accounts is Internal Transfers (or Savings Transfer, or Investment) on both sides.",
    "- Paying a credit card is Credit Card Payment on both the bank account and the card.",
    "- Payments on a loan are Loan Payment, even when the loan is the household's own account.",
    `- If you can't tell what a transaction was for, use ${UNCATEGORIZED} rather than guessing.`,
    "- Follow the history below: use the category a merchant usually gets. When a merchant's latest category differs from its most common one, the household changed its mind; use the latest.",
    "",
    "## Categories",
    "",
    ...categories.map(
      (c) => `- ${c.name}: ${CATEGORY_TYPE_DESCRIPTIONS[c.type]}`
    ),
    "",
    "## Accounts",
    "",
    ...(accounts.length
      ? accounts.map(
          (a) =>
            `- ${a.name}${[a.institution, a.last4 && `ending in ${a.last4}`].filter(Boolean).length ? ` (${[a.institution, a.last4 && `ending in ${a.last4}`].filter(Boolean).join(", ")})` : ""}`
        )
      : ["- No accounts yet. Add them in Beka first."]),
    "",
    "## How each merchant has been categorized",
    "",
    ...(guide.length
      ? guide.map((history) => {
          const used = history.categories
            .map((c) => `${c.name} ${c.count}× (last ${c.lastUsed})`)
            .join(", ")
          const latest = latestCategory(history)
          return history.categories.length > 1 &&
            latest !== history.categories[0].name
            ? `- ${history.merchant}: ${used}. Latest: ${latest}.`
            : `- ${history.merchant}: ${used}`
        })
      : ["- No history yet."]),
    "",
  ]
  return lines.join("\n")
}
