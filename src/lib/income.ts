import { describeSchedule } from "@/lib/paycheck/schedule"
import type { JobSetup } from "@/lib/paycheck/paycheck"
import { formatMoney } from "@/lib/money"

/** "Salary of $120,000 a year" or "$25.00 an hour, 80 hours a paycheck". */
export function describePay(pay: JobSetup["pay"]): string {
  if (pay.type === "salary")
    return `Salary of ${formatMoney(pay.annual, { whole: true })} a year`
  const overtime =
    pay.overtimeHours > 0 ? ` plus ${pay.overtimeHours} overtime` : ""
  return `${formatMoney(pay.rate)} an hour, ${pay.hoursPerPeriod} hours a paycheck${overtime}`
}

export function describeBonus(job: JobSetup): string | undefined {
  if (!job.bonus) return undefined
  const amount =
    job.bonus.mode === "amount"
      ? formatMoney(job.bonus.value)
      : `${job.bonus.value}% of salary`
  const when = describeSchedule(job.bonus.schedule)
  return `Bonus of ${amount}, ${when[0].toLowerCase()}${when.slice(1)}${
    job.bonus.withPaycheck ? ", with that paycheck" : ""
  }`
}

/** The year from a `?year=` parameter, defaulting to this one. */
export function parseYear(value: string | null, fallback: number): number {
  const year = Number(value)
  return Number.isInteger(year) && year >= 2000 && year <= 2100
    ? year
    : fallback
}
