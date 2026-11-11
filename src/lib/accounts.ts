/** Account kinds, in the order they're listed. */
export const ACCOUNT_KINDS = [
  "checking",
  "savings",
  "brokerage",
  "retirement",
  "hsa",
  "asset",
  "loan",
  "credit_card",
] as const

export type AccountKind = (typeof ACCOUNT_KINDS)[number]

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  checking: "Checking",
  savings: "Savings",
  brokerage: "Brokerage",
  retirement: "Retirement",
  hsa: "HSA",
  asset: "Asset",
  loan: "Loan",
  credit_card: "Credit card",
}

/** Kinds whose balance is money owed rather than money held. */
export const DEBT_KINDS: readonly AccountKind[] = ["loan", "credit_card"]

export const isDebt = (kind: AccountKind) => DEBT_KINDS.includes(kind)

/**
 * Days before an account's balance counts as out of date. Property (a home, a
 * car) is valued now and then, so it gets at least a year.
 */
export const staleAfterDays = (kind: AccountKind, days: number) =>
  kind === "asset" ? Math.max(days, 365) : days

/** Groups on the Accounts page; loans and cards have their own pages. */
export const ACCOUNT_GROUPS: {
  title: string
  description: string
  /** What the group says before it has accounts. */
  empty: string
  /** Its add button's label. */
  add: string
  kinds: AccountKind[]
}[] = [
  {
    title: "Cash",
    description: "Checking and savings.",
    empty: "No cash accounts yet.",
    add: "Add cash account",
    kinds: ["checking", "savings"],
  },
  {
    title: "Investments",
    description: "Brokerage, retirement, and HSA accounts.",
    empty: "No investment accounts yet.",
    add: "Add investment account",
    kinds: ["brokerage", "retirement", "hsa"],
  },
  {
    title: "Property",
    description:
      "Your home, vehicles, and other things of value, at what you'd sell them for.",
    empty: "No property yet.",
    add: "Add property",
    kinds: ["asset"],
  },
]

export const SUBTYPE_SUGGESTIONS: Partial<Record<AccountKind, string[]>> = {
  retirement: [
    "401(k)",
    "403(b)",
    "457(b)",
    "Traditional IRA",
    "Roth IRA",
    "SEP IRA",
    "Pension",
  ],
  asset: ["Home", "Vehicle", "Land", "Other"],
  savings: ["High-yield savings", "Money market", "CD"],
}
