export const LOAN_TYPES = [
  "mortgage",
  "auto",
  "student",
  "personal",
  "other",
] as const

export type LoanType = (typeof LOAN_TYPES)[number]

export const LOAN_TYPE_LABELS: Record<LoanType, string> = {
  mortgage: "Mortgage",
  auto: "Auto loan",
  student: "Student loan",
  personal: "Personal loan",
  other: "Other loan",
}

/** A month's interest on `balance` cents at a yearly `rate`, in cents. */
export function monthlyInterest(balance: number, rate: number): number {
  return Math.round((balance * rate) / 12)
}

export type DebtOrder = "rate" | "balance"
