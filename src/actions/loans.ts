import { z } from "astro/zod"

import { LOAN_TYPES } from "@/lib/loans"
import { toCents } from "@/lib/money"
import { createLoan, updateLoan } from "@/server/loans"

import { accountFields } from "./accounts"
import { op } from "./operation"
import { run } from "./run"
import { dollars, id, isoDate, percent } from "./schemas"

const loanAccount = accountFields.omit({ kind: true })

const nonNegative = dollars.min(0, "Enter 0 or more.")

export const loanTerms = z.object({
  loanType: z.enum(LOAN_TYPES),
  interestRate: percent.max(99.99, "Enter a rate under 100%."),
  minimumPayment: nonNegative,
  dueDay: z
    .number()
    .int()
    .min(1, "Enter a day from 1 to 31.")
    .max(31, "Enter a day from 1 to 31.")
    .nullable(),
  originalAmount: nonNegative.nullable(),
  escrow: nonNegative.nullable(),
})

type TermsInput = z.infer<typeof loanTerms>

/** Converts typed percentages and dollars to the stored fraction and cents. */
export function toTerms(input: TermsInput) {
  return {
    loanType: input.loanType,
    interestRate: input.interestRate / 100,
    minimumPayment: toCents(input.minimumPayment),
    dueDay: input.dueDay,
    originalAmount:
      input.originalAmount === null ? null : toCents(input.originalAmount),
    escrow: input.escrow === null ? null : toCents(input.escrow),
  }
}

export const loans = {
  createLoan: op({
    description:
      "Add a loan with its terms (interest rate as a percent, payments in dollars) and optionally the amount owed.",
    input: loanAccount.extend({
      terms: loanTerms,
      balance: z.object({ amount: nonNegative, asOf: isoDate }).nullable(),
    }),
    handler: ({ terms, balance, ...input }) =>
      run((db) =>
        createLoan(
          db,
          input,
          toTerms(terms),
          balance
            ? { amount: toCents(balance.amount), asOf: balance.asOf }
            : undefined
        )
      ),
  }),
  updateLoan: op({
    description: "Change a loan's details and terms.",
    input: loanAccount.extend({ id, terms: loanTerms }),
    handler: ({ id, terms, ...input }) =>
      run((db) => updateLoan(db, id, input, toTerms(terms))),
  }),
}
