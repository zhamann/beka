export const REWARDS_CURRENCIES = ["cash", "points", "miles"] as const

export type RewardsCurrency = (typeof REWARDS_CURRENCIES)[number]

export const REWARDS_CURRENCY_LABELS: Record<RewardsCurrency, string> = {
  cash: "Cash back",
  points: "Points",
  miles: "Miles",
}

export const CAP_PERIODS = ["month", "quarter", "year"] as const

export type CapPeriod = (typeof CAP_PERIODS)[number]

/** What a rate means on this card: "3%" for cash back, "3x" for points. */
export function formatRate(rate: number, currency: RewardsCurrency): string {
  const value = +rate.toFixed(2)
  return currency === "cash" ? `${value}%` : `${value}x`
}

/** Cents back per dollar spent, as a percentage. */
export function effectiveReturn(rate: number, pointValue: number): number {
  return rate * pointValue
}

export function quarterOf(iso: string): { year: number; quarter: number } {
  const [year, month] = iso.split("-").map(Number)
  return { year, quarter: Math.ceil(month / 3) }
}
