import { z } from "astro/zod"

import { CAP_PERIODS, REWARDS_CURRENCIES } from "@/lib/cards"
import { toCents } from "@/lib/money"
import {
  createCard,
  createRewardCategory,
  deleteRewardCategory,
  renameRewardCategory,
  updateCard,
} from "@/server/cards"

import { accountFields } from "./accounts"
import { op } from "./operation"
import { run } from "./run"
import { dollars, id, isoDate, percent } from "./schemas"

const nonNegative = dollars.min(0, "Enter 0 or more.")
const rate = z
  .number({ error: "Enter a rate." })
  .min(0, "Enter 0 or more.")
  .max(100, "Enter 100 or less.")
const day = z
  .number()
  .int()
  .min(1, "Enter a day from 1 to 31.")
  .max(31, "Enter a day from 1 to 31.")

export const cardTerms = z.object({
  rewardsCurrency: z.enum(REWARDS_CURRENCIES),
  pointValue: z
    .number({ error: "Enter a value in cents." })
    .positive("Enter more than 0.")
    .max(100),
  baseRate: rate,
  annualFee: nonNegative,
  annualFeeMonth: z.number().int().min(1).max(12).nullable(),
  foreignTransactionFee: z.boolean(),
  creditLimit: nonNegative.nullable(),
  apr: percent.max(99.99).nullable(),
  statementDueDay: day.nullable(),
  carriesBalance: z.boolean(),
  bonuses: z
    .array(
      z.object({
        rewardCategoryId: z
          .number({ error: "Choose a bonus category." })
          .int()
          .positive("Choose a bonus category."),
        rate,
        cap: dollars.positive("Enter a cap above 0.").nullable(),
        capPeriod: z.enum(CAP_PERIODS).nullable(),
        condition: z.string().trim().max(200),
        year: z.number().int().min(2000).max(2100).nullable(),
        quarter: z.number().int().min(1).max(4).nullable(),
      })
    )
    .max(50),
  credits: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Name each credit.").max(100),
        annualValue: nonNegative,
      })
    )
    .max(20),
})

type TermsInput = z.infer<typeof cardTerms>

export function toTerms(input: TermsInput) {
  return {
    ...input,
    annualFee: toCents(input.annualFee),
    creditLimit: input.creditLimit === null ? null : toCents(input.creditLimit),
    apr: input.apr === null ? null : input.apr / 100,
    bonuses: input.bonuses.map((bonus) => ({
      ...bonus,
      cap: bonus.cap === null ? null : toCents(bonus.cap),
      capPeriod: bonus.cap === null ? null : (bonus.capPeriod ?? "year"),
      quarter: bonus.year === null ? null : bonus.quarter,
      year: bonus.quarter === null ? null : bonus.year,
    })),
    credits: input.credits.map((credit) => ({
      name: credit.name,
      annualValue: toCents(credit.annualValue),
    })),
  }
}

const cardAccount = accountFields.omit({ kind: true })
const categoryName = z.string().trim().min(1, "Enter a name.").max(60)

export const cards = {
  createCard: op({
    description: "Add a credit card with its rewards, fees, and terms.",
    input: cardAccount.extend({
      terms: cardTerms,
      balance: z.object({ amount: nonNegative, asOf: isoDate }).nullable(),
    }),
    handler: ({ terms, balance, ...input }) =>
      run((db) =>
        createCard(
          db,
          input,
          toTerms(terms),
          balance
            ? { amount: toCents(balance.amount), asOf: balance.asOf }
            : undefined
        )
      ),
  }),
  updateCard: op({
    description:
      "Change a credit card's rewards, fees, or terms. Bonuses and credits are replaced by the lists given.",
    input: cardAccount.extend({ id, terms: cardTerms }),
    handler: ({ id, terms, ...input }) =>
      run((db) => updateCard(db, id, input, toTerms(terms))),
  }),
  createRewardCategory: op({
    description: "Add a reward category card bonuses can be earned on.",
    input: z.object({ name: categoryName }),
    handler: ({ name }) => run((db) => createRewardCategory(db, name)),
  }),
  renameRewardCategory: op({
    description: "Rename a reward category.",
    input: z.object({ id, name: categoryName }),
    handler: ({ id, name }) => run((db) => renameRewardCategory(db, id, name)),
  }),
  deleteRewardCategory: op({
    description: "Delete a reward category no card bonus uses.",
    input: z.object({ id }),
    handler: ({ id }) => run((db) => deleteRewardCategory(db, id)),
  }),
}
