import { rmSync } from "node:fs"
import type { DatabaseSync } from "node:sqlite"

import { operations } from "@/actions"
import { today } from "@/lib/dates"
import type { Frequency } from "@/lib/recurring"

import { listAccounts } from "./accounts"
import { listRewardCategories } from "./cards"
import { listCategories } from "./categories"
import { closeDatabase, databasePath, getDatabase } from "./database"
import { listMembers } from "./household"
import { importTransactions, previewImport } from "./imports"
import {
  confirmRecurring,
  listRecurring,
  setTransactionRecurring,
} from "./recurring"

/**
 * A household to load into an empty database, for development and demos.
 * People, accounts, and categories are named rather than numbered; amounts
 * are dollars and rates percents, as the app's operations take them.
 */
export interface Seed {
  members?: { name: string; birthYear?: number | null }[]
  accounts?: {
    owner?: string | null
    balance?: { amount: number; asOf: string } | null
    [key: string]: unknown
  }[]
  loans?: {
    owner?: string | null
    terms: Record<string, unknown>
    balance?: { amount: number; asOf: string } | null
    [key: string]: unknown
  }[]
  rewardCategories?: string[]
  cards?: {
    owner?: string | null
    terms: Record<string, unknown> & {
      bonuses?: ({ category: string } & Record<string, unknown>)[]
    }
    balance?: { amount: number; asOf: string } | null
    [key: string]: unknown
  }[]
  jobs?: ({
    member: string
    depositAccount?: string | null
    splits?: ({ account: string } & Record<string, unknown>)[]
  } & Record<string, unknown>)[]
  otherIncome?: ({ member: string; account?: string | null } & Record<
    string,
    unknown
  >)[]
  /** CSV text in the import format. */
  transactions?: string
  recurring?: {
    /** Suggestions found after importing to confirm: all of them, or these merchants. */
    confirmSuggestions?: boolean | string[]
    /** Merchants with too few charges to be found, flagged from their latest charge. */
    flag?: { merchant: string; frequency: Frequency }[]
    manual?: ({ category?: string | null; account?: string | null } & Record<
      string,
      unknown
    >)[]
  }
}

type Handler = (input: never) => unknown
const run = (name: keyof typeof operations, input: unknown) =>
  (operations[name].handler as Handler)(input as never)

/** Loads `seed` into the app's database. It must be empty unless `replace` is set, which starts over. */
export function loadSeed(
  seed: Seed,
  { replace = false, on = today() } = {}
): { steps: string[] } {
  if (replace) {
    closeDatabase()
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(`${databasePath()}${suffix}`, { force: true })
  }
  const db: DatabaseSync = getDatabase()
  if (listMembers(db).length > 0 || listAccounts(db).length > 0) {
    throw new Error(
      "The database already has data. Seed with replace to start over."
    )
  }
  const steps: string[] = []
  const member = (name: string | null | undefined) => {
    if (!name) return null
    const found = listMembers(db).find((m) => m.name === name)
    if (!found) throw new Error(`No household member named ${name}.`)
    return found.id
  }
  const account = (name: string | null | undefined) => {
    if (!name) return null
    const found = [
      ...listAccounts(db),
      ...listAccounts(db, { archived: true }),
    ].find((a) => a.name === name)
    if (!found) throw new Error(`No account named ${name}.`)
    return found.id
  }
  const category = (name: string | null | undefined) => {
    if (!name) return null
    const found = listCategories(db).find((c) => c.name === name)
    if (!found) throw new Error(`No category named ${name}.`)
    return found.id
  }
  const accountDefaults = { subtype: "", institution: "", last4: "", notes: "" }

  for (const m of seed.members ?? [])
    run("createMember", { birthYear: null, ...m })
  for (const { owner, balance, ...a } of seed.accounts ?? []) {
    run("createAccount", {
      ...accountDefaults,
      ...a,
      ownerId: member(owner),
      balance: balance ?? null,
    })
  }
  for (const { owner, balance, terms, ...l } of seed.loans ?? []) {
    run("createLoan", {
      ...accountDefaults,
      ...l,
      ownerId: member(owner),
      terms: { dueDay: null, originalAmount: null, escrow: null, ...terms },
      balance: balance ?? null,
    })
  }
  for (const name of seed.rewardCategories ?? [])
    run("createRewardCategory", { name })
  for (const { owner, balance, terms, ...c } of seed.cards ?? []) {
    const rewardCategories = listRewardCategories(db)
    run("createCard", {
      ...accountDefaults,
      ...c,
      ownerId: member(owner),
      terms: {
        pointValue: 1,
        annualFee: 0,
        annualFeeMonth: null,
        foreignTransactionFee: false,
        creditLimit: null,
        apr: null,
        statementDueDay: null,
        carriesBalance: false,
        credits: [],
        ...terms,
        bonuses: (terms.bonuses ?? []).map(({ category: name, ...bonus }) => ({
          cap: null,
          capPeriod: null,
          condition: "",
          year: null,
          quarter: null,
          ...bonus,
          rewardCategoryId: rewardCategories.find((r) => r.name === name)?.id,
        })),
      },
      balance: balance ?? null,
    })
  }
  steps.push(
    `${listMembers(db).length} people, ${listAccounts(db).length} accounts`
  )

  for (const { member: name, depositAccount, splits, ...job } of seed.jobs ??
    []) {
    run("createJob", {
      stateTax: null,
      localTax: null,
      deductions: [],
      employerContributions: [],
      bonus: null,
      businessDayRule: "previous",
      ...job,
      memberId: member(name),
      depositAccountId: account(depositAccount),
      splits: (splits ?? []).map(({ account: accountName, ...split }) => ({
        ...split,
        accountId: account(accountName),
      })),
    })
  }
  for (const {
    member: name,
    account: accountName,
    ...income
  } of seed.otherIncome ?? []) {
    run("createOtherIncome", {
      businessDayRule: "previous",
      taxable: false,
      ...income,
      memberId: member(name),
      accountId: account(accountName),
    })
  }

  if (seed.transactions) {
    const preview = previewImport(db, seed.transactions)
    const problems = preview.rows.filter((r) => r.errors.length)
    if (preview.fileError || problems.length) {
      throw new Error(
        preview.fileError ??
          problems
            .slice(0, 10)
            .map((r) => `Line ${r.line}: ${r.errors.join(" ")}`)
            .join("\n")
      )
    }
    const result = importTransactions(
      db,
      preview.rows.map((r) => ({
        date: r.date,
        merchant: r.merchant,
        description: r.description,
        amount: r.amount,
        categoryId: r.categoryId!,
        accountId: r.accountId!,
        notes: r.notes,
      })),
      "seed",
      on
    )
    steps.push(`${result.added} transactions`)
  }

  const confirm = seed.recurring?.confirmSuggestions
  if (confirm) {
    for (const suggestion of listRecurring(db, {
      statuses: ["suggested"],
      on,
    })) {
      if (confirm === true || confirm.includes(suggestion.merchant))
        confirmRecurring(db, suggestion.id)
    }
  }
  for (const { merchant, frequency } of seed.recurring?.flag ?? []) {
    const latest = db
      .prepare(
        "SELECT id FROM transactions WHERE lower(merchant) = lower(?) AND amount < 0 ORDER BY date DESC LIMIT 1"
      )
      .get(merchant) as { id: number } | undefined
    if (latest) setTransactionRecurring(db, latest.id, frequency)
  }
  for (const {
    category: categoryName,
    account: accountName,
    ...payment
  } of seed.recurring?.manual ?? []) {
    run("createRecurring", {
      merchant: "",
      amountMode: "latest",
      matchMode: "any",
      anchorDate: null,
      ...payment,
      categoryId: category(categoryName),
      accountId: account(accountName),
    })
  }
  steps.push(`${listRecurring(db, { on }).length} recurring payments`)
  return { steps }
}
