import type { DatabaseSync } from "node:sqlite"

import {
  daysBetween,
  formatDate,
  parseIsoDate,
  toIsoDate,
  today,
} from "@/lib/dates"
import {
  FREQUENCIES,
  INTERVALS,
  monthlyEquivalent,
  NEAR_AMOUNT,
  type Frequency,
} from "@/lib/recurring"

import { logChange } from "./activity"
import { transaction } from "./database"
import { BekaError, notFound } from "./errors"

export type RecurringStatus = "suggested" | "active" | "ended" | "dismissed"

export interface RecurringRow {
  id: number
  merchant: string
  name: string
  frequency: Frequency
  matchMode: "any" | "near"
  referenceAmount: number | null
  amountMode: "latest" | "average"
  manualAmount: number | null
  anchorDate: string | null
  categoryId: number | null
  accountId: number | null
  cardId: number | null
  status: RecurringStatus
  checkedAt: string | null
  createdAt: string
}

export interface Charge {
  id: number
  date: string
  /** Cents charged, as a positive number. */
  amount: number
  accountId: number
  accountName: string
  categoryName: string
}

export interface RecurringPayment extends RecurringRow {
  /** Linked charges, newest first. */
  charges: Charge[]
  /** Cents counted per charge. */
  amount: number
  /** Cents a month. */
  monthly: number
  lastCharge: string | null
  nextCharge: string | null
  /** The category and account from its latest charge, or as entered. */
  categoryName: string | null
  accountName: string | null
  /** Expected charges haven't shown up, so it may have ended. */
  overdue: boolean
}

const select = `SELECT id, merchant, name, frequency, match_mode AS matchMode,
  reference_amount AS referenceAmount, amount_mode AS amountMode,
  manual_amount AS manualAmount, anchor_date AS anchorDate, category_id AS categoryId,
  account_id AS accountId, card_id AS cardId, status, checked_at AS checkedAt,
  created_at AS createdAt FROM recurring`

/** Steps a date by one charge of `frequency`. */
export function stepDate(iso: string, frequency: Frequency, times = 1): string {
  const date = parseIsoDate(iso)
  if (frequency === "weekly" || frequency === "biweekly") {
    date.setDate(date.getDate() + times * (frequency === "weekly" ? 7 : 14))
    return toIsoDate(date)
  }
  const months =
    { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 }[frequency] * times
  const day = date.getDate()
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const last = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0
  ).getDate()
  target.setDate(Math.min(day, last))
  return toIsoDate(target)
}

function nearAmount(amount: number, reference: number) {
  return Math.abs(amount - reference) <= reference * NEAR_AMOUNT
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

function charges(db: DatabaseSync, recurringId: number): Charge[] {
  return db
    .prepare(
      `SELECT t.id, t.date, -t.amount AS amount, t.account_id AS accountId, a.name AS accountName,
       c.name AS categoryName FROM transactions t
       JOIN accounts a ON a.id = t.account_id JOIN categories c ON c.id = t.category_id
       WHERE t.recurring_id = ? ORDER BY t.date DESC, t.id DESC`
    )
    .all(recurringId) as unknown as Charge[]
}

function describe(
  db: DatabaseSync,
  row: RecurringRow,
  on: string
): RecurringPayment {
  const linked = charges(db, row.id)
  const lastCharge = linked[0]?.date ?? null
  const yearAgo = stepDate(on, "yearly", -1)
  const recent = linked.filter((c) => c.date > yearAgo)
  let amount = row.manualAmount ?? 0
  if (row.cardId === null && linked.length > 0) {
    amount =
      row.amountMode === "average" && recent.length > 0
        ? Math.round(
            recent.reduce((sum, c) => sum + c.amount, 0) / recent.length
          )
        : linked[0].amount
  }
  const names = (table: "categories" | "accounts", id: number | null) =>
    id === null
      ? null
      : ((
          db.prepare(`SELECT name FROM ${table} WHERE id = ?`).get(id) as
            { name: string } | undefined
        )?.name ?? null)

  // The next charge follows the last one, or the anchor date for manual entries.
  let nextCharge: string | null = null
  const from = lastCharge ?? row.anchorDate
  if (from) {
    nextCharge = lastCharge ? stepDate(from, row.frequency) : from
    for (let i = 0; nextCharge < on && i < 1000; i++)
      nextCharge = stepDate(nextCharge, row.frequency)
  }
  const { days, tolerance } = INTERVALS[row.frequency]
  const quietSince = [lastCharge, row.checkedAt]
    .filter((date): date is string => date !== null)
    .sort()
    .at(-1)
  const overdue =
    row.status === "active" &&
    lastCharge !== null &&
    quietSince !== undefined &&
    daysBetween(quietSince, on) > 2 * days + tolerance

  return {
    ...row,
    charges: linked,
    amount,
    monthly: monthlyEquivalent(amount, row.frequency),
    lastCharge,
    nextCharge,
    categoryName:
      linked[0]?.categoryName ?? names("categories", row.categoryId),
    accountName: linked[0]?.accountName ?? names("accounts", row.accountId),
    overdue,
  }
}

/** Recurring payments with their charges, amounts, and next dates. Archived cards' fees are left out. */
export function listRecurring(
  db: DatabaseSync,
  { statuses = ["active"] as RecurringStatus[], on = today() } = {}
): RecurringPayment[] {
  const rows = db
    .prepare(
      `${select} WHERE status IN (${statuses.map(() => "?").join(", ")})
       AND (card_id IS NULL OR card_id IN (SELECT id FROM accounts WHERE archived_at IS NULL))
       ORDER BY name COLLATE NOCASE`
    )
    .all(...statuses) as unknown as RecurringRow[]
  return rows.map((row) => describe(db, row, on))
}

export function getRecurring(
  db: DatabaseSync,
  id: number,
  on = today()
): RecurringPayment {
  const row = db.prepare(`${select} WHERE id = ?`).get(id) as
    RecurringRow | undefined
  if (!row) throw notFound("recurring payment")
  return describe(db, row, on)
}

/** The Dashboard's Recurring: what active payments add up to a month, in cents. */
export function recurringMonthly(db: DatabaseSync, on = today()): number {
  return listRecurring(db, { on }).reduce(
    (sum, payment) => sum + payment.monthly,
    0
  )
}

/**
 * Flags transactions as recurring: each active payment takes its merchant's
 * outgoing charges (near its usual amount, unless it takes any amount) that
 * aren't income, excluded, unflagged by hand, or already linked.
 */
export function linkRecurring(db: DatabaseSync): number {
  const payments = db
    .prepare(`${select} WHERE status = 'active'`)
    .all() as unknown as RecurringRow[]
  const update = db.prepare(
    "UPDATE transactions SET recurring_id = ? WHERE id = ?"
  )
  let linked = 0
  for (const payment of payments) {
    const candidates = (
      payment.cardId !== null
        ? db
            .prepare(
              `SELECT t.id, -t.amount AS amount, t.merchant, t.description FROM transactions t
               WHERE t.account_id = ? AND t.amount < 0 AND t.recurring_id IS NULL AND t.not_recurring = 0`
            )
            .all(payment.cardId)
            // The card's own fee, not coffee or a gym's club fees.
            .filter((t) =>
              /\b(annual|membership|member)\b.*\bfee\b/i.test(
                `${t.merchant} ${t.description}`
              )
            )
        : db
            .prepare(
              `SELECT t.id, -t.amount AS amount FROM transactions t JOIN categories c ON c.id = t.category_id
               WHERE lower(t.merchant) = lower(?) AND t.amount < 0 AND c.type = 'spending'
               AND t.recurring_id IS NULL AND t.not_recurring = 0`
            )
            .all(payment.merchant)
    ) as { id: number; amount: number }[]
    const reference = payment.referenceAmount
    for (const candidate of candidates) {
      if (
        payment.cardId === null &&
        payment.matchMode === "near" &&
        reference &&
        !nearAmount(candidate.amount, reference)
      ) {
        continue
      }
      update.run(payment.id, candidate.id)
      linked++
    }
  }
  return linked
}

/** The active payment (not a card fee) a new charge from `merchant` would join. */
export function matchRecurring(
  payments: RecurringPayment[],
  merchant: string,
  amount: number
): { id: number; name: string } | null {
  const match = payments.find(
    (p) =>
      p.cardId === null &&
      p.merchant.toLowerCase() === merchant.toLowerCase() &&
      (p.matchMode === "any" ||
        (p.referenceAmount !== null && nearAmount(amount, p.referenceAmount)))
  )
  return match ? { id: match.id, name: match.name } : null
}

/** The frequency that fits gaps between charges, if they're regular. */
export function detectFrequency(dates: string[]): Frequency | null {
  const sorted = [...dates].sort()
  if (sorted.length < 2) return null
  const gaps = sorted.slice(1).map((date, i) => daysBetween(sorted[i], date))
  for (const frequency of FREQUENCIES) {
    const { days, tolerance } = INTERVALS[frequency]
    const minimum = frequency === "semiannual" || frequency === "yearly" ? 2 : 3
    if (sorted.length < minimum) continue
    const fitting = gaps.filter(
      (gap) => Math.abs(gap - days) <= tolerance
    ).length
    if (fitting / gaps.length >= 0.75) return frequency
  }
  return null
}

interface Candidate {
  merchant: string
  frequency: Frequency
  matchMode: "any" | "near"
  referenceAmount: number
  lastDate: string
  count: number
}

/** Groups amounts into clusters within `NEAR_AMOUNT` of each other. */
function clusterByAmount<T extends { amount: number }>(items: T[]): T[][] {
  const sorted = [...items].sort((a, b) => a.amount - b.amount)
  const clusters: T[][] = []
  for (const item of sorted) {
    const cluster = clusters.at(-1)
    if (
      cluster &&
      nearAmount(item.amount, median(cluster.map((c) => c.amount)))
    )
      cluster.push(item)
    else clusters.push([item])
  }
  return clusters
}

/** Merchants charging on a steady schedule that no recurring payment covers yet. */
export function findCandidates(db: DatabaseSync, on = today()): Candidate[] {
  const rows = db
    .prepare(
      `SELECT t.merchant, t.date, -t.amount AS amount FROM transactions t
       JOIN categories c ON c.id = t.category_id
       WHERE t.amount < 0 AND c.type = 'spending' AND t.recurring_id IS NULL AND t.not_recurring = 0
       ORDER BY t.date`
    )
    .all() as { merchant: string; date: string; amount: number }[]
  const known = db
    .prepare(`${select} WHERE card_id IS NULL`)
    .all() as unknown as RecurringRow[]
  const byMerchant = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = row.merchant.toLowerCase()
    if (!byMerchant.has(key)) byMerchant.set(key, [])
    byMerchant.get(key)!.push(row)
  }

  const candidates: Candidate[] = []
  for (const [key, merchantRows] of byMerchant) {
    const covered = (amount: number) =>
      known.some(
        (k) =>
          k.merchant.toLowerCase() === key &&
          (k.matchMode === "any" ||
            (k.referenceAmount !== null &&
              nearAmount(amount, k.referenceAmount)))
      )
    // A bill that swings in amount: every charge on a schedule, never two in one period.
    const dates = merchantRows.map((r) => r.date)
    const any = detectFrequency(dates)
    // Never two charges within half a period of each other.
    const onePerPeriod =
      any !== null &&
      dates
        .slice(1)
        .every(
          (date, i) => daysBetween(dates[i], date) >= INTERVALS[any].days / 2
        )
    const groups: {
      items: typeof rows
      matchMode: "any" | "near"
      frequency: Frequency | null
    }[] =
      any && onePerPeriod
        ? [{ items: merchantRows, matchMode: "any", frequency: any }]
        : clusterByAmount(merchantRows).map((items) => ({
            items,
            matchMode: "near" as const,
            frequency: detectFrequency(items.map((i) => i.date)),
          }))
    for (const group of groups) {
      if (!group.frequency) continue
      // Two charges a year apart at a store you shop at often is chance, not a subscription.
      const rare =
        group.frequency === "yearly" || group.frequency === "semiannual"
      if (
        rare &&
        group.matchMode === "near" &&
        group.items.length < merchantRows.length * 0.6
      )
        continue
      const reference = median(group.items.map((i) => i.amount))
      if (covered(reference)) continue
      const lastDate = group.items.at(-1)!.date
      const { days, tolerance } = INTERVALS[group.frequency]
      // Skip payments that stopped long ago.
      if (daysBetween(lastDate, on) > 2 * days + tolerance) continue
      candidates.push({
        merchant: group.items[0].merchant,
        frequency: group.frequency,
        matchMode: group.matchMode,
        referenceAmount: reference,
        lastDate,
        count: group.items.length,
      })
    }
  }
  return candidates
}

/** Saves new candidates as suggestions for someone to confirm or dismiss. */
export function suggestRecurring(db: DatabaseSync, on = today()): number {
  return transaction(db, () => {
    const candidates = findCandidates(db, on)
    const insert = db.prepare(
      `INSERT INTO recurring (merchant, name, frequency, match_mode, reference_amount, amount_mode, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'suggested', ?)`
    )
    for (const candidate of candidates) {
      insert.run(
        candidate.merchant,
        candidate.merchant,
        candidate.frequency,
        candidate.matchMode,
        candidate.referenceAmount,
        candidate.matchMode === "any" ? "average" : "latest",
        new Date().toISOString()
      )
    }
    return candidates.length
  })
}

/** Charges a suggestion would take if confirmed, so people can see what it found. */
export function suggestionCharges(
  db: DatabaseSync,
  payment: RecurringRow
): Charge[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.date, -t.amount AS amount, t.account_id AS accountId, a.name AS accountName,
       c.name AS categoryName FROM transactions t
       JOIN accounts a ON a.id = t.account_id JOIN categories c ON c.id = t.category_id
       WHERE lower(t.merchant) = lower(?) AND t.amount < 0 AND c.type = 'spending'
       AND t.recurring_id IS NULL AND t.not_recurring = 0 ORDER BY t.date DESC`
    )
    .all(payment.merchant) as unknown as Charge[]
  return payment.matchMode === "near" && payment.referenceAmount
    ? rows.filter((r) => nearAmount(r.amount, payment.referenceAmount!))
    : rows
}

function setStatus(
  db: DatabaseSync,
  id: number,
  status: RecurringStatus,
  summary: (name: string) => string
) {
  return transaction(db, () => {
    const before = getRecurring(db, id)
    db.prepare("UPDATE recurring SET status = ? WHERE id = ?").run(status, id)
    if (status === "dismissed")
      db.prepare(
        "UPDATE transactions SET recurring_id = NULL WHERE recurring_id = ?"
      ).run(id)
    if (status === "active") linkRecurring(db)
    const after = getRecurring(db, id)
    logChange(db, {
      action: "update",
      entity: "recurring",
      entityId: id,
      summary: summary(after.name),
      before: { status: before.status },
      after: { status: after.status },
    })
    return after
  })
}

/** Confirms a suggestion, flagging its past and future charges. */
export function confirmRecurring(db: DatabaseSync, id: number) {
  const payment = getRecurring(db, id)
  if (payment.status !== "suggested")
    throw new BekaError("invalid", "That isn't a suggestion.")
  // Choose the amount to count from how much the charges vary.
  const found = suggestionCharges(db, payment).map((c) => c.amount)
  const amountMode =
    found.length &&
    (Math.max(...found) - Math.min(...found)) / median(found) > 0.1
      ? "average"
      : "latest"
  db.prepare("UPDATE recurring SET amount_mode = ? WHERE id = ?").run(
    amountMode,
    id
  )
  return setStatus(db, id, "active", (name) => `Confirmed ${name} as recurring`)
}

export function dismissRecurring(db: DatabaseSync, id: number) {
  return setStatus(
    db,
    id,
    "dismissed",
    (name) => `Marked ${name} as not recurring`
  )
}

/** Puts a dismissed suggestion back up for a decision, to undo "Not recurring". */
export function restoreSuggestion(db: DatabaseSync, id: number) {
  return setStatus(
    db,
    id,
    "suggested",
    (name) => `Put ${name} back as a suggestion`
  )
}

/** Ends a payment that stopped. Its past charges stay flagged. */
export function endRecurring(db: DatabaseSync, id: number) {
  return setStatus(db, id, "ended", (name) => `Ended ${name}`)
}

export function restartRecurring(db: DatabaseSync, id: number) {
  return setStatus(db, id, "active", (name) => `Restarted ${name}`)
}

/** Records that an overdue payment is still going. */
export function keepRecurring(db: DatabaseSync, id: number, on = today()) {
  return transaction(db, () => {
    db.prepare("UPDATE recurring SET checked_at = ? WHERE id = ?").run(on, id)
    const payment = getRecurring(db, id, on)
    logChange(db, {
      action: "update",
      entity: "recurring",
      entityId: id,
      summary: `Confirmed ${payment.name} is still recurring`,
      after: { checkedAt: on },
    })
    return payment
  })
}

export interface RecurringInput {
  name: string
  merchant: string
  frequency: Frequency
  amountMode: "latest" | "average"
  matchMode: "any" | "near"
  /** Cents, for payments without transactions. */
  manualAmount: number | null
  anchorDate: string | null
  categoryId: number | null
  accountId: number | null
}

/** Adds a recurring payment by hand, for things your uploads won't show. */
export function createRecurring(
  db: DatabaseSync,
  input: RecurringInput
): RecurringPayment {
  return transaction(db, () => {
    const id = Number(
      db
        .prepare(
          `INSERT INTO recurring (merchant, name, frequency, match_mode, reference_amount, amount_mode,
           manual_amount, anchor_date, category_id, account_id, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
        )
        .run(
          input.merchant.trim() || input.name.trim(),
          input.name.trim(),
          input.frequency,
          input.matchMode,
          input.manualAmount,
          input.amountMode,
          input.manualAmount,
          input.anchorDate,
          input.categoryId,
          input.accountId,
          new Date().toISOString()
        ).lastInsertRowid
    )
    linkRecurring(db)
    const payment = getRecurring(db, id)
    logChange(db, {
      action: "create",
      entity: "recurring",
      entityId: id,
      summary: `Added the recurring payment ${payment.name}`,
      after: input,
    })
    return payment
  })
}

export function updateRecurring(
  db: DatabaseSync,
  id: number,
  input: RecurringInput
): RecurringPayment {
  return transaction(db, () => {
    const before = getRecurring(db, id)
    if (before.cardId !== null) {
      throw new BekaError("invalid", "Change a card's annual fee on the card.")
    }
    db.prepare(
      `UPDATE recurring SET name = ?, merchant = ?, frequency = ?, amount_mode = ?, match_mode = ?,
       manual_amount = ?, anchor_date = ?, category_id = ?, account_id = ?,
       reference_amount = coalesce(reference_amount, ?) WHERE id = ?`
    ).run(
      input.name.trim(),
      input.merchant.trim() || input.name.trim(),
      input.frequency,
      input.amountMode,
      input.matchMode,
      input.manualAmount,
      input.anchorDate,
      input.categoryId,
      input.accountId,
      input.manualAmount,
      id
    )
    // A new merchant or amount rule takes a fresh look at which charges belong.
    db.prepare(
      "UPDATE transactions SET recurring_id = NULL WHERE recurring_id = ?"
    ).run(id)
    linkRecurring(db)
    const after = getRecurring(db, id)
    logChange(db, {
      action: "update",
      entity: "recurring",
      entityId: id,
      summary: `Updated the recurring payment ${after.name}`,
      before: { ...before, charges: undefined },
      after: input,
    })
    return after
  })
}

export function deleteRecurring(db: DatabaseSync, id: number) {
  transaction(db, () => {
    const before = getRecurring(db, id)
    if (before.cardId !== null)
      throw new BekaError(
        "invalid",
        "Remove the annual fee on the card instead."
      )
    db.prepare("DELETE FROM recurring WHERE id = ?").run(id)
    logChange(db, {
      action: "delete",
      entity: "recurring",
      entityId: id,
      summary: `Deleted the recurring payment ${before.name}`,
      before: { ...before, charges: undefined },
    })
  })
}

/**
 * Flags or unflags one transaction. `target` is an existing payment's id, a
 * frequency to start a new payment from this charge, or `null` to unflag it.
 */
export function setTransactionRecurring(
  db: DatabaseSync,
  transactionId: number,
  target: number | Frequency | null
) {
  return transaction(db, () => {
    const t = db
      .prepare(
        "SELECT id, merchant, amount, date, recurring_id AS recurringId FROM transactions WHERE id = ?"
      )
      .get(transactionId) as
      | {
          id: number
          merchant: string
          amount: number
          date: string
          recurringId: number | null
        }
      | undefined
    if (!t) throw notFound("transaction")
    let recurringId: number | null = null
    if (typeof target === "number") {
      recurringId = getRecurring(db, target).id
    } else if (target !== null) {
      recurringId = Number(
        db
          .prepare(
            `INSERT INTO recurring (merchant, name, frequency, match_mode, reference_amount, amount_mode, status, created_at)
             VALUES (?, ?, ?, 'near', ?, 'latest', 'active', ?)`
          )
          .run(
            t.merchant,
            t.merchant,
            target,
            Math.abs(t.amount),
            new Date().toISOString()
          ).lastInsertRowid
      )
    }
    db.prepare(
      "UPDATE transactions SET recurring_id = ?, not_recurring = ? WHERE id = ?"
    ).run(recurringId, recurringId === null ? 1 : 0, transactionId)
    if (typeof target === "string") linkRecurring(db)
    logChange(db, {
      action: "update",
      entity: "transaction",
      entityId: transactionId,
      summary:
        recurringId === null
          ? `Marked ${t.merchant} on ${formatDate(t.date)} as not recurring`
          : `Marked ${t.merchant} on ${formatDate(t.date)} as recurring`,
      before: { recurringId: t.recurringId },
      after: { recurringId },
    })
  })
}

/** Keeps a card's annual fee in step with the card: yearly, at the fee. */
export function syncCardFee(
  db: DatabaseSync,
  card: {
    id: number
    name: string
    annualFee: number
    annualFeeMonth: number | null
  },
  on = today()
) {
  const existing = db.prepare(`${select} WHERE card_id = ?`).get(card.id) as
    RecurringRow | undefined
  if (card.annualFee <= 0) {
    if (existing)
      db.prepare("DELETE FROM recurring WHERE id = ?").run(existing.id)
    return
  }
  const year = Number(on.slice(0, 4))
  const anchor = card.annualFeeMonth
    ? `${year}-${String(card.annualFeeMonth).padStart(2, "0")}-01`
    : null
  if (existing) {
    db.prepare(
      "UPDATE recurring SET name = ?, manual_amount = ?, anchor_date = ? WHERE id = ?"
    ).run(`${card.name} annual fee`, card.annualFee, anchor, existing.id)
  } else {
    db.prepare(
      `INSERT INTO recurring (merchant, name, frequency, match_mode, amount_mode, manual_amount,
       anchor_date, account_id, card_id, status, created_at)
       VALUES (?, ?, 'yearly', 'near', 'latest', ?, ?, ?, ?, 'active', ?)`
    ).run(
      `${card.name} annual fee`,
      `${card.name} annual fee`,
      card.annualFee,
      anchor,
      card.id,
      card.id,
      new Date().toISOString()
    )
  }
  linkRecurring(db)
}
