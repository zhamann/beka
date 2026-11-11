import { defineAction } from "astro:actions"

import { household } from "./household"
import { accounts } from "./accounts"
import { loans } from "./loans"
import { cards } from "./cards"
import { income } from "./income"

/** Every operation, shared by the app's actions and the agent's tools. */
export const operations = {
  ...household,
  ...accounts,
  ...loans,
  ...cards,
  ...income,
}

// Each operation becomes an Astro Action, keeping its input and output types.
export const server = {
  createMember: defineAction(household.createMember),
  updateMember: defineAction(household.updateMember),
  deleteMember: defineAction(household.deleteMember),
  createAccount: defineAction(accounts.createAccount),
  updateAccount: defineAction(accounts.updateAccount),
  archiveAccount: defineAction(accounts.archiveAccount),
  deleteAccount: defineAction(accounts.deleteAccount),
  recordBalance: defineAction(accounts.recordBalance),
  updateBalance: defineAction(accounts.updateBalance),
  deleteBalance: defineAction(accounts.deleteBalance),
  createLoan: defineAction(loans.createLoan),
  updateLoan: defineAction(loans.updateLoan),
  createCard: defineAction(cards.createCard),
  updateCard: defineAction(cards.updateCard),
  createRewardCategory: defineAction(cards.createRewardCategory),
  renameRewardCategory: defineAction(cards.renameRewardCategory),
  deleteRewardCategory: defineAction(cards.deleteRewardCategory),
  createJob: defineAction(income.createJob),
  updateJob: defineAction(income.updateJob),
  deleteJob: defineAction(income.deleteJob),
  createOtherIncome: defineAction(income.createOtherIncome),
  updateOtherIncome: defineAction(income.updateOtherIncome),
  deleteOtherIncome: defineAction(income.deleteOtherIncome),
}
