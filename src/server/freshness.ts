import type { DatabaseSync } from "node:sqlite"

import { age, daysBetween, formatDate, today } from "@/lib/dates"
import { staleAfterDays } from "@/lib/accounts"
import { quarterOf } from "@/lib/cards"
import { formatMonth } from "@/lib/months"
import { taxYear } from "@/lib/paycheck/tax-years"

import { listAccounts } from "./accounts"
import { listCards } from "./cards"
import { listJobs } from "./income"
import { listRecurring } from "./recurring"
import { freshnessRules } from "./settings"
import { shiftMonth } from "./spending"

export interface Reminder {
  kind:
    | "balance"
    | "transactions"
    | "uncategorized"
    | "recurring-suggestions"
    | "recurring-overdue"
    | "rotating-categories"
    | "tax-tables"
  /** One line a person can act on. */
  message: string
  href: string
}

/**
 * What needs updating, by the rules in Settings: old balances, a missing
 * month of transactions, rotating card categories, and tax tables. Also lists
 * things waiting on a decision, like recurring suggestions.
 */
export function needsUpdating(db: DatabaseSync, on = today()): Reminder[] {
  const rules = freshnessRules(db)
  const reminders: Reminder[] = []

  if (rules.balances) {
    for (const account of listAccounts(db)) {
      const asOf = account.balance?.asOf
      if (!asOf) {
        reminders.push({
          kind: "balance",
          message: `${account.name} has no balance yet.`,
          href: `/accounts/${account.id}#update`,
        })
      } else if (
        daysBetween(asOf, on) > staleAfterDays(account.kind, rules.balanceDays)
      ) {
        reminders.push({
          kind: "balance",
          message: `${account.name}'s balance is ${age(daysBetween(asOf, on))} old, from ${formatDate(asOf)}.`,
          href: `/accounts/${account.id}#update`,
        })
      }
    }
  }

  if (rules.transactions) {
    const { latest } = db
      .prepare("SELECT max(date) AS latest FROM transactions")
      .get() as { latest: string | null }
    const lastMonth = shiftMonth(on.slice(0, 7), -1)
    if (latest === null) {
      reminders.push({
        kind: "transactions",
        message: "No transactions are imported yet.",
        href: "/import",
      })
    } else if (latest.slice(0, 7) < lastMonth) {
      reminders.push({
        kind: "transactions",
        message: `${formatMonth(lastMonth, "long")}'s transactions aren't imported yet.`,
        href: "/import",
      })
    }
  }

  const { uncategorized } = db
    .prepare(
      "SELECT count(*) AS uncategorized FROM transactions t JOIN categories c ON c.id = t.category_id WHERE c.builtin = 1"
    )
    .get() as { uncategorized: number }
  if (uncategorized > 0) {
    const id = (
      db.prepare("SELECT id FROM categories WHERE builtin = 1").get() as {
        id: number
      }
    ).id
    reminders.push({
      kind: "uncategorized",
      message: `${uncategorized.toLocaleString()} transaction${uncategorized === 1 ? " is" : "s are"} uncategorized.`,
      href: `/transactions?category=${id}`,
    })
  }

  const suggestions = listRecurring(db, { statuses: ["suggested"], on }).length
  if (suggestions > 0) {
    reminders.push({
      kind: "recurring-suggestions",
      message: `${suggestions} possible recurring payment${suggestions === 1 ? "" : "s"} to confirm.`,
      href: "/recurring",
    })
  }
  for (const payment of listRecurring(db, { on }).filter((p) => p.overdue)) {
    reminders.push({
      kind: "recurring-overdue",
      message: `${payment.name} hasn't charged since ${formatDate(payment.lastCharge!)}. Did it end?`,
      href: "/recurring",
    })
  }

  if (rules.rotatingCategories) {
    const { year, quarter } = quarterOf(on)
    for (const card of listCards(db)) {
      const rotating = card.bonuses.filter((b) => b.year !== null)
      if (
        rotating.length > 0 &&
        !rotating.some((b) => b.year === year && b.quarter === quarter)
      ) {
        reminders.push({
          kind: "rotating-categories",
          message: `Enter ${card.name}'s rotating categories for Q${quarter} ${year}.`,
          href: `/accounts/${card.id}`,
        })
      }
    }
  }

  const year = Number(on.slice(0, 4))
  if (rules.taxTables && listJobs(db).length > 0 && !taxYear(year).current) {
    reminders.push({
      kind: "tax-tables",
      message: `This version doesn't have ${year}'s tax tables, so paychecks use ${taxYear(year).figures.year}'s. Update Beka.`,
      href: "/income",
    })
  }
  return reminders
}
