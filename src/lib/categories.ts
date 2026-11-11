export const CATEGORY_TYPES = ["spending", "income", "excluded"] as const

export type CategoryType = (typeof CATEGORY_TYPES)[number]

export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  spending: "Spending",
  income: "Income",
  excluded: "Excluded",
}

export const CATEGORY_TYPE_DESCRIPTIONS: Record<CategoryType, string> = {
  spending: "Counted in Spending.",
  income: "Money coming in, like paychecks and interest.",
  excluded: "Left out of everything: transfers, card payments, investing.",
}

export const UNCATEGORIZED = "Uncategorized"
