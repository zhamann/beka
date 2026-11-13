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
    /** Which `category-N` color it wears, 1 to 8. */
    color: number
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
          `SELECT c.id, c.name, c.color, substr(t.date, 1, 7) AS month, -sum(t.amount) AS spent
           FROM transactions t JOIN categories c ON c.id = t.category_id
           WHERE c.type = 'spending' AND t.date >= ? AND t.date < ?
           ${includeRecurring ? "" : "AND t.recurring_id IS NULL"}
           GROUP BY c.id, month`
        )
        .all(`${shown[0]}-01`, `${shiftMonth(shown.at(-1)!, 1)}-01`) as {
        id: number
        name: string
        color: number
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
        color: row.color,
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

export interface SpendingPace {
  /** The month in progress, as `YYYY-MM`. */
  month: string
  /** Today's day of the month. */
  day: number
  /** How many days the month has. */
  days: number
  /** Cents spent by the end of each day so far, one entry a day up to today. */
  spent: number[]
  /**
   * Cents usually spent by the end of each day of a month, one entry a day:
   * the average of `months` complete months. Empty when there are none.
   */
  usual: number[]
  /** How many complete months `usual` averages. */
  months: number
}

const daysIn = (month: string) => {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m, 0).getDate()
}

/**
 * How this month's spending is building up, day by day, against a usual
 * month: the same spending and the same months as the Dashboard's Spend, so
 * `usual` ends on that average.
 */
export function spendingPace(db: DatabaseSync, on = today()): SpendingPace {
  const month = on.slice(0, 7)
  const day = Number(on.slice(8, 10))
  const days = daysIn(month)
  const first = firstTransactionMonth(db)
  const lastComplete = shiftMonth(month, -1)
  const start = shiftMonth(lastComplete, -11)
  const complete =
    first && first <= lastComplete
      ? monthsBetween(first > start ? first : start, lastComplete)
      : []
  const byDate = new Map(
    (
      db
        .prepare(
          `SELECT t.date, -sum(t.amount) AS spent
           FROM transactions t JOIN categories c ON c.id = t.category_id
           WHERE c.type = 'spending' AND t.recurring_id IS NULL
             AND t.date >= ? AND t.date <= ?
           GROUP BY t.date`
        )
        .all(`${complete[0] ?? month}-01`, on) as {
        date: string
        spent: number
      }[]
    ).map((row) => [row.date, row.spent])
  )
  /** Cents spent in `of` by the end of each of its first `through` days. */
  const running = (of: string, through: number) => {
    let total = 0
    return Array.from({ length: through }, (_, index) => {
      total += byDate.get(`${of}-${String(index + 1).padStart(2, "0")}`) ?? 0
      return total
    })
  }
  const past = complete.map((m) => running(m, daysIn(m)))
  // A shorter or longer month counts whole by this month's last day.
  const usual = past.length
    ? Array.from({ length: days }, (_, index) =>
        Math.round(
          past.reduce(
            (sum, m) =>
              sum +
              m[
                index === days - 1
                  ? m.length - 1
                  : Math.min(index, m.length - 1)
              ],
            0
          ) / past.length
        )
      )
    : []
  return {
    month,
    day,
    days,
    spent: running(month, day),
    usual,
    months: past.length,
  }
}
