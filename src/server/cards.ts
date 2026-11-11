import type { DatabaseSync } from "node:sqlite"

import {
  effectiveReturn,
  formatRate,
  quarterOf,
  type CapPeriod,
  type RewardsCurrency,
} from "@/lib/cards"
import { today } from "@/lib/dates"
import { monthlyInterest } from "@/lib/loans"

import {
  createAccount,
  getAccountOfKind,
  listAccounts,
  updateAccount,
  type Account,
  type AccountInput,
} from "./accounts"
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
import type { Debt } from "./loans"

// Reward categories

export interface RewardCategory {
  id: number
  name: string
}

export function listRewardCategories(db: DatabaseSync): RewardCategory[] {
  return db
    .prepare(
      "SELECT id, name FROM reward_categories ORDER BY name COLLATE NOCASE"
    )
    .all() as unknown as RewardCategory[]
}

function getRewardCategory(db: DatabaseSync, id: number): RewardCategory {
  const category = db
    .prepare("SELECT id, name FROM reward_categories WHERE id = ?")
    .get(id) as RewardCategory | undefined
  if (!category) throw notFound("reward category")
  return category
}

const duplicateCategory = new BekaError(
  "duplicate-name",
  "A reward category with that name already exists."
)

export function createRewardCategory(
  db: DatabaseSync,
  name: string
): RewardCategory {
  return transaction(db, () => {
    let id: number
    try {
      id = Number(
        db
          .prepare("INSERT INTO reward_categories (name) VALUES (?)")
          .run(name.trim()).lastInsertRowid
      )
    } catch (error) {
      translate(error, { [SQLITE_CONSTRAINT_UNIQUE]: duplicateCategory })
    }
    const category = getRewardCategory(db, id)
    logChange(db, {
      action: "create",
      entity: "reward_category",
      entityId: id,
      summary: `Added the reward category ${category.name}`,
      after: category,
    })
    return category
  })
}

export function renameRewardCategory(
  db: DatabaseSync,
  id: number,
  name: string
): RewardCategory {
  return transaction(db, () => {
    const before = getRewardCategory(db, id)
    try {
      db.prepare("UPDATE reward_categories SET name = ? WHERE id = ?").run(
        name.trim(),
        id
      )
    } catch (error) {
      translate(error, { [SQLITE_CONSTRAINT_UNIQUE]: duplicateCategory })
    }
    const after = getRewardCategory(db, id)
    logChange(db, {
      action: "update",
      entity: "reward_category",
      entityId: id,
      summary: `Renamed the reward category ${before.name} to ${after.name}`,
      before,
      after,
    })
    return after
  })
}

export function deleteRewardCategory(db: DatabaseSync, id: number) {
  transaction(db, () => {
    const before = getRewardCategory(db, id)
    try {
      db.prepare("DELETE FROM reward_categories WHERE id = ?").run(id)
    } catch (error) {
      const inUse = new BekaError(
        "in-use",
        `Remove ${before.name} from your cards' bonuses first.`
      )
      translate(error, {
        [SQLITE_CONSTRAINT_FOREIGNKEY]: inUse,
        [SQLITE_CONSTRAINT_TRIGGER]: inUse,
      })
    }
    logChange(db, {
      action: "delete",
      entity: "reward_category",
      entityId: id,
      summary: `Deleted the reward category ${before.name}`,
      before,
    })
  })
}

// Cards

export interface CardBonus {
  rewardCategoryId: number
  rate: number
  /** Cents of spending per period the bonus covers, or `null` for no cap. */
  cap: number | null
  capPeriod: CapPeriod | null
  condition: string
  /** A rotating category's year and quarter; `null` means always. */
  year: number | null
  quarter: number | null
}

export interface CardCredit {
  name: string
  /** Cents a year. */
  annualValue: number
}

export interface CardTerms {
  rewardsCurrency: RewardsCurrency
  /** Cents per point or mile; 1 for cash back. */
  pointValue: number
  baseRate: number
  /** Cents a year. */
  annualFee: number
  annualFeeMonth: number | null
  foreignTransactionFee: boolean
  creditLimit: number | null
  /** A yearly rate as a fraction. */
  apr: number | null
  statementDueDay: number | null
  carriesBalance: boolean
  bonuses: CardBonus[]
  credits: CardCredit[]
}

export interface Card extends Account, CardTerms {
  bonuses: (CardBonus & { rewardCategoryName: string })[]
}

function cardTerms(db: DatabaseSync, id: number): Omit<Card, keyof Account> {
  const row = db
    .prepare(
      `SELECT rewards_currency AS rewardsCurrency, point_value AS pointValue,
       base_rate AS baseRate, annual_fee AS annualFee, annual_fee_month AS annualFeeMonth,
       foreign_transaction_fee AS foreignTransactionFee, credit_limit AS creditLimit,
       apr, statement_due_day AS statementDueDay, carries_balance AS carriesBalance
       FROM cards WHERE account_id = ?`
    )
    .get(id) as Record<string, unknown>
  const bonuses = db
    .prepare(
      `SELECT b.reward_category_id AS rewardCategoryId, c.name AS rewardCategoryName,
       b.rate, b.cap, b.cap_period AS capPeriod, b.condition, b.year, b.quarter
       FROM card_bonuses b JOIN reward_categories c ON c.id = b.reward_category_id
       WHERE b.card_id = ? ORDER BY b.year IS NOT NULL, b.year, b.quarter, b.rate DESC, c.name`
    )
    .all(id) as unknown as Card["bonuses"]
  const credits = db
    .prepare(
      "SELECT name, annual_value AS annualValue FROM card_credits WHERE card_id = ? ORDER BY id"
    )
    .all(id) as unknown as CardCredit[]
  return {
    ...(row as unknown as Omit<CardTerms, "bonuses" | "credits">),
    foreignTransactionFee: row.foreignTransactionFee === 1,
    carriesBalance: row.carriesBalance === 1,
    bonuses,
    credits,
  }
}

export function getCard(db: DatabaseSync, id: number): Card {
  const account = getAccountOfKind(db, id, ["credit_card"], "card")
  return { ...account, ...cardTerms(db, id) }
}

export function listCards(
  db: DatabaseSync,
  { archived = false }: { archived?: boolean } = {}
): Card[] {
  return listAccounts(db, { kinds: ["credit_card"], archived }).map(
    (account) => ({
      ...account,
      ...cardTerms(db, account.id),
    })
  )
}

function writeTerms(db: DatabaseSync, id: number, terms: CardTerms) {
  db.prepare(
    `INSERT INTO cards (account_id, rewards_currency, point_value, base_rate, annual_fee,
       annual_fee_month, foreign_transaction_fee, credit_limit, apr, statement_due_day, carries_balance)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (account_id) DO UPDATE SET rewards_currency = excluded.rewards_currency,
       point_value = excluded.point_value, base_rate = excluded.base_rate,
       annual_fee = excluded.annual_fee, annual_fee_month = excluded.annual_fee_month,
       foreign_transaction_fee = excluded.foreign_transaction_fee,
       credit_limit = excluded.credit_limit, apr = excluded.apr,
       statement_due_day = excluded.statement_due_day, carries_balance = excluded.carries_balance`
  ).run(
    id,
    terms.rewardsCurrency,
    terms.rewardsCurrency === "cash" ? 1 : terms.pointValue,
    terms.baseRate,
    terms.annualFee,
    terms.annualFee > 0 ? terms.annualFeeMonth : null,
    terms.foreignTransactionFee ? 1 : 0,
    terms.creditLimit,
    terms.apr,
    terms.statementDueDay,
    terms.carriesBalance ? 1 : 0
  )
  db.prepare("DELETE FROM card_bonuses WHERE card_id = ?").run(id)
  const insertBonus = db.prepare(
    `INSERT INTO card_bonuses (card_id, reward_category_id, rate, cap, cap_period, condition, year, quarter)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const bonus of terms.bonuses) {
    try {
      insertBonus.run(
        id,
        bonus.rewardCategoryId,
        bonus.rate,
        bonus.cap,
        bonus.cap === null ? null : bonus.capPeriod,
        bonus.condition.trim(),
        bonus.year,
        bonus.year === null ? null : bonus.quarter
      )
    } catch (error) {
      translate(error, {
        [SQLITE_CONSTRAINT_FOREIGNKEY]: notFound("reward category"),
      })
    }
  }
  db.prepare("DELETE FROM card_credits WHERE card_id = ?").run(id)
  const insertCredit = db.prepare(
    "INSERT INTO card_credits (card_id, name, annual_value) VALUES (?, ?, ?)"
  )
  for (const credit of terms.credits) {
    insertCredit.run(id, credit.name.trim(), credit.annualValue)
  }
}

type CardAccountInput = Omit<AccountInput, "kind">

function termsOf(card: Card): CardTerms {
  return {
    rewardsCurrency: card.rewardsCurrency,
    pointValue: card.pointValue,
    baseRate: card.baseRate,
    annualFee: card.annualFee,
    annualFeeMonth: card.annualFeeMonth,
    foreignTransactionFee: card.foreignTransactionFee,
    creditLimit: card.creditLimit,
    apr: card.apr,
    statementDueDay: card.statementDueDay,
    carriesBalance: card.carriesBalance,
    bonuses: card.bonuses.map((bonus) => ({
      rewardCategoryId: bonus.rewardCategoryId,
      rate: bonus.rate,
      cap: bonus.cap,
      capPeriod: bonus.capPeriod,
      condition: bonus.condition,
      year: bonus.year,
      quarter: bonus.quarter,
    })),
    credits: card.credits,
  }
}

export function createCard(
  db: DatabaseSync,
  input: CardAccountInput,
  terms: CardTerms,
  balance?: { amount: number; asOf: string }
): Card {
  return transaction(db, () => {
    const account = createAccount(
      db,
      { ...input, kind: "credit_card" },
      balance
    )
    writeTerms(db, account.id, terms)
    const card = getCard(db, account.id)
    logChange(db, {
      action: "create",
      entity: "card",
      entityId: card.id,
      summary: `Set the rewards and terms of ${card.name}`,
      after: termsOf(card),
    })
    return card
  })
}

export function updateCard(
  db: DatabaseSync,
  id: number,
  input: CardAccountInput,
  terms: CardTerms
): Card {
  return transaction(db, () => {
    const before = getCard(db, id)
    updateAccount(db, id, { ...input, kind: "credit_card" })
    writeTerms(db, id, terms)
    const after = getCard(db, id)
    logChange(db, {
      action: "update",
      entity: "card",
      entityId: id,
      summary: `Updated the rewards and terms of ${after.name}`,
      before: termsOf(before),
      after: termsOf(after),
    })
    return after
  })
}

// Which card to use

export interface CardPick {
  cardId: number
  cardName: string
  /** Cents back per dollar, as a percentage. */
  effective: number
  /** The card's own rate, like "3x" or "2%". */
  rate: string
  /** Caps, conditions, and rotating quarters worth knowing at the register. */
  notes: string[]
}

export interface CategoryGuide {
  /** `null` is "Everything else". */
  categoryId: number | null
  name: string
  picks: CardPick[]
}

function capNote(
  bonus: CardBonus,
  currency: RewardsCurrency,
  baseRate: number
) {
  if (bonus.cap === null) return undefined
  const dollars = `$${(bonus.cap / 100).toLocaleString("en-US")}`
  return `Up to ${dollars} a ${bonus.capPeriod}, then ${formatRate(baseRate, currency)}`
}

/**
 * Each reward category with the household's open cards ranked by what they
 * return there today, then "Everything else" ranked by base rate. Rotating
 * categories only count in their quarter.
 */
export function whichCard(db: DatabaseSync, on = today()): CategoryGuide[] {
  const cards = listCards(db)
  const { year, quarter } = quarterOf(on)
  const byEffective = (a: CardPick, b: CardPick) =>
    b.effective - a.effective || a.cardName.localeCompare(b.cardName)

  const guides: CategoryGuide[] = listRewardCategories(db).map((category) => {
    const picks = cards.map((card) => {
      const bonuses = card.bonuses.filter(
        (b) =>
          b.rewardCategoryId === category.id &&
          (b.year === null || (b.year === year && b.quarter === quarter))
      )
      const best = bonuses.sort((a, b) => b.rate - a.rate)[0]
      const rate = best && best.rate > card.baseRate ? best.rate : card.baseRate
      const notes =
        best && best.rate > card.baseRate
          ? [
              capNote(best, card.rewardsCurrency, card.baseRate),
              best.condition || undefined,
              best.year !== null ? `This quarter only` : undefined,
            ].filter((note): note is string => note !== undefined)
          : []
      return {
        cardId: card.id,
        cardName: card.name,
        effective: effectiveReturn(rate, card.pointValue),
        rate: formatRate(rate, card.rewardsCurrency),
        notes,
      }
    })
    return {
      categoryId: category.id,
      name: category.name,
      picks: picks.sort(byEffective),
    }
  })

  guides.push({
    categoryId: null,
    name: "Everything else",
    picks: cards
      .map((card) => ({
        cardId: card.id,
        cardName: card.name,
        effective: effectiveReturn(card.baseRate, card.pointValue),
        rate: formatRate(card.baseRate, card.rewardsCurrency),
        notes: card.foreignTransactionFee ? [] : ["No foreign transaction fee"],
      }))
      .sort(byEffective),
  })
  return guides
}

/** Cards carrying a balance, for the loan ranking at their APR. */
export function cardDebts(db: DatabaseSync): Debt[] {
  return listCards(db)
    .filter((card) => card.carriesBalance && card.apr !== null)
    .map((card): Debt => ({
      id: card.id,
      name: card.name,
      kind: "credit_card",
      label: "Credit card",
      ownerName: card.ownerName,
      rate: card.apr!,
      balance: card.balance?.amount ?? null,
      balanceAsOf: card.balance?.asOf ?? null,
      minimumPayment: null,
      monthlyInterest: monthlyInterest(card.balance?.amount ?? 0, card.apr!),
    }))
}
