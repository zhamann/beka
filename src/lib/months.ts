/** "Oct 2026" or "October 2026" for a `YYYY-MM` month. */
export function formatMonth(
  month: string,
  style: "short" | "long" = "short"
): string {
  const [year, m] = month.split("-").map(Number)
  return new Date(year, m - 1, 1).toLocaleString("en-US", {
    month: style,
    year: "numeric",
  })
}

/** "Oct" for a `YYYY-MM` month. */
export function monthAbbreviation(month: string): string {
  const [year, m] = month.split("-").map(Number)
  return new Date(year, m - 1, 1).toLocaleString("en-US", { month: "short" })
}
