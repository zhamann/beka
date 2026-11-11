import { defineAction } from "astro:actions"

import { agentKeys } from "./agent-keys"
import { backups } from "./backups"
import { household } from "./household"
import { accounts } from "./accounts"
import { loans } from "./loans"
import { cards } from "./cards"
import { income } from "./income"
import { transactions } from "./transactions"
import { recurring } from "./recurring"
import { settings } from "./settings"

/** Every operation, shared by the app's actions and the agent's tools. */
export const operations = {
  ...household,
  ...accounts,
  ...loans,
  ...cards,
  ...income,
  ...transactions,
  ...recurring,
  ...settings,
}

// Each operation becomes an Astro Action, keeping its input and output types.
export const server = {
  ...agentKeys,
  ...backups,
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
  createCategory: defineAction(transactions.createCategory),
  updateCategory: defineAction(transactions.updateCategory),
  deleteCategory: defineAction(transactions.deleteCategory),
  createTransaction: defineAction(transactions.createTransaction),
  updateTransaction: defineAction(transactions.updateTransaction),
  recategorize: defineAction(transactions.recategorize),
  deleteTransactions: defineAction(transactions.deleteTransactions),
  previewImport: defineAction(transactions.previewImport),
  importTransactions: defineAction(transactions.importTransactions),
  undoImport: defineAction(transactions.undoImport),
  confirmRecurring: defineAction(recurring.confirmRecurring),
  dismissRecurring: defineAction(recurring.dismissRecurring),
  endRecurring: defineAction(recurring.endRecurring),
  restartRecurring: defineAction(recurring.restartRecurring),
  restoreSuggestion: defineAction(recurring.restoreSuggestion),
  keepRecurring: defineAction(recurring.keepRecurring),
  deleteRecurring: defineAction(recurring.deleteRecurring),
  createRecurring: defineAction(recurring.createRecurring),
  updateRecurring: defineAction(recurring.updateRecurring),
  setTransactionRecurring: defineAction(recurring.setTransactionRecurring),
  updateFreshnessRules: defineAction(settings.updateFreshnessRules),
}
