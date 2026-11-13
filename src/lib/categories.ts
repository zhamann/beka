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

/**
 * The colors a category can wear, by number: `category-1` to `category-8` in
 * the theme. The order keeps neighbors apart for color-blind readers.
 */
export const CATEGORY_COLORS = [
  { color: 1, name: "Blue", fill: "bg-category-1" },
  { color: 2, name: "Orange", fill: "bg-category-2" },
  { color: 3, name: "Teal", fill: "bg-category-3" },
  { color: 4, name: "Yellow", fill: "bg-category-4" },
  { color: 5, name: "Pink", fill: "bg-category-5" },
  { color: 6, name: "Green", fill: "bg-category-6" },
  { color: 7, name: "Purple", fill: "bg-category-7" },
  { color: 8, name: "Red", fill: "bg-category-8" },
] as const

/** The background class for a category's color. */
export function categoryFill(color: number): string {
  return CATEGORY_COLORS[color - 1]?.fill ?? "bg-muted-foreground"
}
