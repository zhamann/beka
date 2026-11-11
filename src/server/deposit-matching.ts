import type { DatabaseSync } from "node:sqlite"

import { daysBetween, today } from "@/lib/dates"

import type { Deposit } from "./income"

/** How far an actual deposit can land from its expected date. */
export const MATCH_DAYS = 3

export type DepositCheck =
  | {
      status: "matched"
      transactionId: number
      date: string
      amount: number
      difference: number
    }
  | { status: "missing" }
  /** Imported transactions for that account don't reach that date. */
  | { status: "unknown" }
  | { status: "upcoming" }

/** Words in a payer's name long enough to recognize in a bank description. */
function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4)
}

const payer = (deposit: Deposit) =>
  deposit.source.kind === "job" ? deposit.source.employer : deposit.source.name

/**
 * Compares expected deposits with income transactions uploaded to the main
 * account. Every possible pairing within three days is ranked (a transaction
 * naming the payer first, then the closest amount, then the closest date) and
 * taken best first, so each deposit and each transaction is used once and one
 * job's paycheck can't take another's.
 */
export function checkDeposits(
  db: DatabaseSync,
  deposits: Deposit[],
  on = today()
): DepositCheck[] {
  const coverage = db.prepare(
    "SELECT count(*) AS n FROM transactions WHERE account_id = ? AND (SELECT min(date) FROM transactions WHERE account_id = ?) <= ? AND (SELECT max(date) FROM transactions WHERE account_id = ?) >= ?"
  )
  const candidates = db.prepare(
    `SELECT t.id, t.date, t.amount, t.merchant, t.description FROM transactions t
     JOIN categories c ON c.id = t.category_id
     WHERE t.account_id = ? AND c.type = 'income' AND t.amount > 0
     AND t.date BETWEEN date(?, '-${MATCH_DAYS} days') AND date(?, '+${MATCH_DAYS} days')`
  )

  const checks: DepositCheck[] = []
  const pairs: {
    index: number
    row: { id: number; date: string; amount: number }
    named: boolean
    off: number
    days: number
  }[] = []
  const payerWords = new Map(
    deposits.map((d) => [payer(d), nameWords(payer(d))])
  )
  deposits.forEach((deposit, index) => {
    if (deposit.date > on) return (checks[index] = { status: "upcoming" })
    const main = deposit.parts[0]
    if (!main?.accountId) return (checks[index] = { status: "unknown" })
    const { n } = coverage.get(
      main.accountId,
      main.accountId,
      deposit.date,
      main.accountId,
      deposit.date
    ) as { n: number }
    if (n === 0) return (checks[index] = { status: "unknown" })
    checks[index] = { status: "missing" }
    const words = payerWords.get(payer(deposit))!
    const others = [...payerWords]
      .filter(([name]) => name !== payer(deposit))
      .flatMap(([, w]) => w)
      .filter((word) => !words.includes(word))
    const rows = candidates.all(main.accountId, deposit.date, deposit.date) as {
      id: number
      date: string
      amount: number
      merchant: string
      description: string
    }[]
    for (const row of rows) {
      const off = Math.abs(row.amount - main.amount)
      const text = `${row.merchant} ${row.description}`.toLowerCase()
      const named = words.some((word) => text.includes(word))
      // A transaction naming someone else's payer isn't this one, and neither
      // is one off by more than half unless it names this payer.
      if (!named && others.some((word) => text.includes(word))) continue
      if (!named && off > main.amount / 2) continue
      pairs.push({
        index,
        row,
        named,
        off,
        days: Math.abs(daysBetween(row.date, deposit.date)),
      })
    }
  })

  pairs.sort(
    (a, b) =>
      Number(b.named) - Number(a.named) || a.off - b.off || a.days - b.days
  )
  const used = new Set<number>()
  for (const { index, row } of pairs) {
    if (checks[index].status !== "missing" || used.has(row.id)) continue
    used.add(row.id)
    checks[index] = {
      status: "matched",
      transactionId: row.id,
      date: row.date,
      amount: row.amount,
      difference: row.amount - deposits[index].parts[0].amount,
    }
  }
  return checks
}
