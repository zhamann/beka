import type { DatabaseSync } from "node:sqlite"

import {
  LOAN_TYPE_LABELS,
  monthlyInterest,
  type DebtOrder,
  type LoanType,
} from "@/lib/loans"

import {
  createAccount,
  getAccountOfKind,
  listAccounts,
  updateAccount,
  type Account,
  type AccountInput,
} from "./accounts"
import { logChange } from "./activity"
import { cardDebts } from "./cards"
import { transaction } from "./database"

export interface LoanTerms {
  loanType: LoanType
  /** A yearly rate as a fraction, like 0.0924. */
  interestRate: number
  /** Cents. */
  minimumPayment: number
  dueDay: number | null
  originalAmount: number | null
  escrow: number | null
}

export interface Loan extends Account, LoanTerms {}

function loanTerms(db: DatabaseSync, accountId: number): LoanTerms {
  return db
    .prepare(
      `SELECT loan_type AS loanType, interest_rate AS interestRate,
       minimum_payment AS minimumPayment, due_day AS dueDay,
       original_amount AS originalAmount, escrow FROM loans WHERE account_id = ?`
    )
    .get(accountId) as unknown as LoanTerms
}

export function getLoan(db: DatabaseSync, id: number): Loan {
  const account = getAccountOfKind(db, id, ["loan"], "loan")
  return { ...account, ...loanTerms(db, id) }
}

/** Open loans (or archived ones), sorted by name. */
export function listLoans(
  db: DatabaseSync,
  { archived = false }: { archived?: boolean } = {}
): Loan[] {
  return listAccounts(db, { kinds: ["loan"], archived }).map((account) => ({
    ...account,
    ...loanTerms(db, account.id),
  }))
}

function writeTerms(db: DatabaseSync, id: number, terms: LoanTerms) {
  db.prepare(
    `INSERT INTO loans (account_id, loan_type, interest_rate, minimum_payment, due_day, original_amount, escrow)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (account_id) DO UPDATE SET loan_type = excluded.loan_type,
       interest_rate = excluded.interest_rate, minimum_payment = excluded.minimum_payment,
       due_day = excluded.due_day, original_amount = excluded.original_amount,
       escrow = excluded.escrow`
  ).run(
    id,
    terms.loanType,
    terms.interestRate,
    terms.minimumPayment,
    terms.dueDay,
    terms.originalAmount,
    terms.loanType === "mortgage" ? terms.escrow : null
  )
}

type LoanAccountInput = Omit<AccountInput, "kind">

export function createLoan(
  db: DatabaseSync,
  input: LoanAccountInput,
  terms: LoanTerms,
  balance?: { amount: number; asOf: string }
): Loan {
  return transaction(db, () => {
    const account = createAccount(db, { ...input, kind: "loan" }, balance)
    writeTerms(db, account.id, terms)
    const loan = getLoan(db, account.id)
    logChange(db, {
      action: "create",
      entity: "loan",
      entityId: loan.id,
      summary: `Set the terms of ${loan.name}`,
      after: terms,
    })
    return loan
  })
}

export function updateLoan(
  db: DatabaseSync,
  id: number,
  input: LoanAccountInput,
  terms: LoanTerms
): Loan {
  return transaction(db, () => {
    const before = getLoan(db, id)
    updateAccount(db, id, { ...input, kind: "loan" })
    writeTerms(db, id, terms)
    const after = getLoan(db, id)
    logChange(db, {
      action: "update",
      entity: "loan",
      entityId: id,
      summary: `Updated the terms of ${after.name}`,
      before: pickTerms(before),
      after: pickTerms(after),
    })
    return after
  })
}

function pickTerms(loan: Loan): LoanTerms {
  const {
    loanType,
    interestRate,
    minimumPayment,
    dueDay,
    originalAmount,
    escrow,
  } = loan
  return {
    loanType,
    interestRate,
    minimumPayment,
    dueDay,
    originalAmount,
    escrow,
  }
}

/** A debt in the payoff ranking: a loan, or a card carrying a balance. */
export interface Debt {
  id: number
  name: string
  kind: "loan" | "credit_card"
  /** "Student loan", "Credit card", … */
  label: string
  ownerName: string | null
  rate: number
  /** Cents owed, or `null` before a balance is entered. */
  balance: number | null
  balanceAsOf: string | null
  minimumPayment: number | null
  /** Cents of interest a month at the current balance. */
  monthlyInterest: number
}

/**
 * Open debts ranked for extra payments: highest rate first (the avalanche
 * method), or smallest balance first (the snowball method). Ties go to the
 * higher rate, then the name.
 */
export function rankDebts(db: DatabaseSync, order: DebtOrder = "rate"): Debt[] {
  const debts: Debt[] = [
    ...listLoans(db).map((loan) => ({
      id: loan.id,
      name: loan.name,
      kind: "loan" as const,
      label: LOAN_TYPE_LABELS[loan.loanType],
      ownerName: loan.ownerName,
      rate: loan.interestRate,
      balance: loan.balance?.amount ?? null,
      balanceAsOf: loan.balance?.asOf ?? null,
      minimumPayment: loan.minimumPayment,
      monthlyInterest: monthlyInterest(
        loan.balance?.amount ?? 0,
        loan.interestRate
      ),
    })),
    ...cardDebts(db),
  ]
  const byRate = (a: Debt, b: Debt) =>
    b.rate - a.rate || a.name.localeCompare(b.name)
  return debts.sort(
    order === "rate"
      ? byRate
      : (a, b) =>
          (a.balance ?? Infinity) - (b.balance ?? Infinity) || byRate(a, b)
  )
}
