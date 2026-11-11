import type { DatabaseSync } from "node:sqlite"

import { today } from "@/lib/dates"

/** `YYYY-MM` for the month `offset` months from `month`. */
export function shiftMonth(month: string, offset: number): string {
  const [y, m] = month.split("-").map(Number)
  const date = new Date(y, m - 1 + offset, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

/** The months from `from` to `to`, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = []
  for (let month = from; month <= to; month = shiftMonth(month, 1))
    months.push(month)
  return months
}

export interface SpendingTable {
  /** Complete months in the range, oldest first. */
  months: string[]
  /** The month in progress, shown apart and left out of averages. */
  current: string | null
  categories: {
    id: number
    name: string
    /** Cents spent each month, by `YYYY-MM`. Refunds count against it. */
    byMonth: Record<string, number>
    /** Cents a month across `months`. */
    average: number
  }[]
  /** Cents spent each month across categories. */
  totals: Record<string, number>
  average: number
}

/**
 * Spending-type transactions by category and month. Recurring charges are
 * left out unless asked for, so the totals match the Dashboard's Spend.
 */
export function spendingTable(
  db: DatabaseSync,
  {
    from,
    to,
    includeRecurring = false,
    on = today(),
  }: { from: string; to: string; includeRecurring?: boolean; on?: string }
): SpendingTable {
  const thisMonth = on.slice(0, 7)
  const lastComplete = shiftMonth(thisMonth, -1)
  const months = monthsBetween(from, to < thisMonth ? to : lastComplete)
  const current = to >= thisMonth && from <= thisMonth ? thisMonth : null
  const shown = current ? [...months, current] : months
  const rows = shown.length
    ? (db
        .prepare(
          `SELECT c.id, c.name, substr(t.date, 1, 7) AS month, -sum(t.amount) AS spent
           FROM transactions t JOIN categories c ON c.id = t.category_id
           WHERE c.type = 'spending' AND t.date >= ? AND t.date < ?
           ${includeRecurring ? "" : "AND t.recurring_id IS NULL"}
           GROUP BY c.id, month`
        )
        .all(`${shown[0]}-01`, `${shiftMonth(shown.at(-1)!, 1)}-01`) as {
        id: number
        name: string
        month: string
        spent: number
      }[])
    : []

  const byCategory = new Map<number, SpendingTable["categories"][number]>()
  const totals: Record<string, number> = Object.fromEntries(
    shown.map((m) => [m, 0])
  )
  for (const row of rows) {
    if (!byCategory.has(row.id))
      byCategory.set(row.id, {
        id: row.id,
        name: row.name,
        byMonth: {},
        average: 0,
      })
    byCategory.get(row.id)!.byMonth[row.month] = row.spent
    totals[row.month] += row.spent
  }
  const averageOf = (byMonth: Record<string, number>) =>
    months.length
      ? Math.round(
          months.reduce((sum, m) => sum + (byMonth[m] ?? 0), 0) / months.length
        )
      : 0
  const categories = [...byCategory.values()]
    .map((category) => ({ ...category, average: averageOf(category.byMonth) }))
    .filter((category) => shown.some((m) => category.byMonth[m]))
    .sort((a, b) => b.average - a.average || a.name.localeCompare(b.name))
  return { months, current, categories, totals, average: averageOf(totals) }
}

/** The first month with a transaction, as `YYYY-MM`. */
export function firstTransactionMonth(db: DatabaseSync): string | null {
  const row = db
    .prepare("SELECT min(date) AS first FROM transactions")
    .get() as { first: string | null }
  return row.first?.slice(0, 7) ?? null
}

/**
 * The Dashboard's Spend: non-recurring spending a month, averaged over the
 * last 12 complete months (or fewer, when transactions start later).
 */
export function averageSpend(
  db: DatabaseSync,
  on = today()
): { average: number; months: number } {
  const first = firstTransactionMonth(db)
  const lastComplete = shiftMonth(on.slice(0, 7), -1)
  if (!first || first > lastComplete) return { average: 0, months: 0 }
  const start = shiftMonth(lastComplete, -11)
  const table = spendingTable(db, {
    from: first > start ? first : start,
    to: lastComplete,
    on,
  })
  return { average: table.average, months: table.months.length }
}
