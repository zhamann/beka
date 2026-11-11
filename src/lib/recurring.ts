export const FREQUENCIES = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "semiannual",
  "yearly",
] as const

export type Frequency = (typeof FREQUENCIES)[number]

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Every six months",
  yearly: "Yearly",
}

export const TIMES_PER_YEAR: Record<Frequency, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  yearly: 1,
}

/** Typical days between charges, and how far off a charge can land. */
export const INTERVALS: Record<Frequency, { days: number; tolerance: number }> =
  {
    weekly: { days: 7, tolerance: 2 },
    biweekly: { days: 14, tolerance: 2 },
    monthly: { days: 30.4, tolerance: 5 },
    quarterly: { days: 91.3, tolerance: 12 },
    semiannual: { days: 182.6, tolerance: 20 },
    yearly: { days: 365.25, tolerance: 25 },
  }

/** Charges a monthly amount stands for: yearly ÷ 12, quarterly ÷ 3, … */
export function monthlyEquivalent(
  amount: number,
  frequency: Frequency
): number {
  return Math.round((amount * TIMES_PER_YEAR[frequency]) / 12)
}

/** How close a charge must be to a payment's usual amount to count, as a fraction. */
export const NEAR_AMOUNT = 0.25
