const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const wholeDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

/**
 * Formats cents as dollars, like "$1,234.56" or "−$12.00". Negative amounts
 * take a true minus sign, which is as wide as a digit and easier to spot than
 * a hyphen.
 */
export function formatMoney(
  cents: number,
  { whole = false }: { whole?: boolean } = {}
): string {
  const dollarAmount = whole ? Math.round(cents / 100) : cents / 100
  // `|| 0` turns -0 into 0 so nothing reads "−$0.00".
  return (whole ? wholeDollars : dollars)
    .format(dollarAmount || 0)
    .replace("-", "\u2212")
}

/** Dollars, as typed or sent by the agent, to whole cents. */
export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

/** Cents to dollars for a form field, without a currency sign. */
export function centsToInput(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? "" : (cents / 100).toFixed(2)
}

/** Formats a rate stored as a fraction, like 0.0924 → "9.24%". */
export function formatPercent(rate: number, digits = 2): string {
  return `${(rate * 100).toFixed(digits)}%`
}
