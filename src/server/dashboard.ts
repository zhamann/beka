import type { DatabaseSync } from "node:sqlite"

import { daysBetween, today } from "@/lib/dates"

import { netWorth, type NetWorth } from "./accounts"
import { needsUpdating, type Reminder } from "./freshness"
import { incomeYear } from "./income"
import { listRecurring, recurringMonthly } from "./recurring"
import { averageSpend } from "./spending"

export interface ComingUp {
  date: string
  kind: "deposit" | "charge"
  name: string
  /** Cents: positive for deposits, negative for charges. */
  amount: number
}

export interface Dashboard {
  /** Cents a month: household deposits for the year ÷ 12. */
  income: number
  /** Cents a month of active recurring payments. */
  recurring: number
  /** Cents a month of non-recurring spending, averaged. */
  spend: number
  spendMonths: number
  /** What's left: income − recurring − spend. */
  net: number
  netWorth: NetWorth
  comingUp: ComingUp[]
  reminders: Reminder[]
}

/** The numbers on the Dashboard, also what the agent's overview reports. */
export function dashboard(
  db: DatabaseSync,
  on = today(),
  days = 14
): Dashboard {
  const year = Number(on.slice(0, 4))
  const incomeNow = incomeYear(db, year)
  const income = incomeNow.monthly
  const recurring = recurringMonthly(db, on)
  const { average: spend, months: spendMonths } = averageSpend(db, on)
  const within = (date: string) => date >= on && daysBetween(on, date) <= days

  // Deposits can roll into next year near December.
  const deposits = [
    ...incomeNow.deposits,
    ...(Number(on.slice(5, 7)) === 12 ? incomeYear(db, year + 1).deposits : []),
  ]
  const comingUp: ComingUp[] = [
    ...deposits
      .filter((d) => within(d.date))
      .map((d) => ({
        date: d.date,
        kind: "deposit" as const,
        name:
          d.source.kind === "job"
            ? `${d.memberName}'s ${d.source.employer} paycheck`
            : `${d.memberName}'s ${d.source.name}`,
        amount: d.amount,
      })),
    ...listRecurring(db, { on })
      .filter((p) => p.nextCharge && within(p.nextCharge))
      .map((p) => ({
        date: p.nextCharge!,
        kind: "charge" as const,
        name: p.name,
        amount: -p.amount,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount)

  return {
    income,
    recurring,
    spend,
    spendMonths,
    net: income - recurring - spend,
    netWorth: netWorth(db),
    comingUp,
    reminders: needsUpdating(db, on),
  }
}
