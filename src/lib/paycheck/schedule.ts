import { parseIsoDate, toIsoDate } from "@/lib/dates"

/** Day 31 means the last day of the month in schedules. */
export const LAST_DAY = 31

/** How often money arrives, and on which days. */
export type Schedule =
  | { kind: "weekly" | "biweekly"; /** Any one payday. */ anchor: string }
  | { kind: "semimonthly"; days: [number, number] }
  | { kind: "monthly"; day: number }
  | {
      kind: "quarterly"
      /** The first month, 1–3; payouts follow every 3 months. */ month: number
      day: number
    }
  | { kind: "yearly"; month: number; day: number }

export type ScheduleKind = Schedule["kind"]

/** What happens when a payday lands on a weekend or bank holiday. */
export type BusinessDayRule = "previous" | "next" | "none"

/** Regular pay periods per year, for annualizing wages. */
export const PERIODS_PER_YEAR: Record<ScheduleKind, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
}

const daysInMonth = (year: number, month: number) =>
  new Date(year, month, 0).getDate()

/** The `day` of a month, clamped to its last day. */
function dayOf(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, Math.min(day, daysInMonth(year, month)))
}

function nthWeekday(
  year: number,
  month: number,
  weekday: number,
  n: number
): Date {
  const first = new Date(year, month - 1, 1)
  const offset = (weekday - first.getDay() + 7) % 7
  return new Date(year, month - 1, 1 + offset + (n - 1) * 7)
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month, 0)
  return new Date(
    year,
    month - 1,
    last.getDate() - ((last.getDay() - weekday + 7) % 7)
  )
}

/**
 * Days the Federal Reserve (and so most banks) is closed. Holidays on a
 * Sunday are observed Monday; ones on a Saturday aren't moved.
 */
export function bankHolidays(year: number): Set<string> {
  const fixed = [
    [1, 1],
    [6, 19],
    [7, 4],
    [11, 11],
    [12, 25],
  ].map(([month, day]) => {
    const date = new Date(year, month - 1, day)
    if (date.getDay() === 0) date.setDate(date.getDate() + 1)
    return date
  })
  const floating = [
    nthWeekday(year, 1, 1, 3), // Martin Luther King Jr. Day
    nthWeekday(year, 2, 1, 3), // Washington's Birthday
    lastWeekday(year, 5, 1), // Memorial Day
    nthWeekday(year, 9, 1, 1), // Labor Day
    nthWeekday(year, 10, 1, 2), // Columbus Day
    nthWeekday(year, 11, 4, 4), // Thanksgiving
  ]
  return new Set([...fixed, ...floating].map(toIsoDate))
}

const holidayCache = new Map<number, Set<string>>()

export function isBusinessDay(date: Date): boolean {
  const weekday = date.getDay()
  if (weekday === 0 || weekday === 6) return false
  const year = date.getFullYear()
  if (!holidayCache.has(year)) holidayCache.set(year, bankHolidays(year))
  return !holidayCache.get(year)!.has(toIsoDate(date))
}

/** Moves a payday off weekends and bank holidays. */
export function adjustForBusinessDay(date: Date, rule: BusinessDayRule): Date {
  if (rule === "none") return date
  const step = rule === "previous" ? -1 : 1
  const adjusted = new Date(date)
  while (!isBusinessDay(adjusted)) adjusted.setDate(adjusted.getDate() + step)
  return adjusted
}

/** Scheduled days (before business-day adjustment) from `start` to `end`, inclusive. */
function scheduledDays(schedule: Schedule, start: Date, end: Date): Date[] {
  const days: Date[] = []
  if (schedule.kind === "weekly" || schedule.kind === "biweekly") {
    const step = schedule.kind === "weekly" ? 7 : 14
    const anchor = parseIsoDate(schedule.anchor)
    const offset = Math.ceil(
      (start.getTime() - anchor.getTime()) / 86_400_000 / step
    )
    const date = new Date(anchor)
    date.setDate(date.getDate() + offset * step)
    for (; date <= end; date.setDate(date.getDate() + step))
      days.push(new Date(date))
    return days
  }
  for (
    let year = start.getFullYear(), month = start.getMonth() + 1;
    year < end.getFullYear() ||
    (year === end.getFullYear() && month <= end.getMonth() + 1);
    month === 12 ? ((month = 1), year++) : month++
  ) {
    if (schedule.kind === "semimonthly") {
      for (const day of [...schedule.days].sort((a, b) => a - b))
        days.push(dayOf(year, month, day))
    } else if (schedule.kind === "monthly") {
      days.push(dayOf(year, month, schedule.day))
    } else if (schedule.kind === "quarterly") {
      if ((month - schedule.month) % 3 === 0)
        days.push(dayOf(year, month, schedule.day))
    } else if (schedule.kind === "yearly" && month === schedule.month) {
      days.push(dayOf(year, month, schedule.day))
    }
  }
  return days.filter((day) => day >= start && day <= end)
}

/**
 * Deposit dates in `year`, after moving weekend and holiday paydays. A payday
 * moved across New Year's belongs to the year it lands in.
 */
export function payDates(
  schedule: Schedule,
  rule: BusinessDayRule,
  year: number
): string[] {
  const start = new Date(year - 1, 11, 1)
  const end = new Date(year + 1, 0, 31)
  const dates = scheduledDays(schedule, start, end)
    .map((day) => adjustForBusinessDay(day, rule))
    .filter((day) => day.getFullYear() === year)
    .map(toIsoDate)
  return [...new Set(dates)].sort()
}

/** The first deposit on or after `from`, looking a year ahead. */
export function nextPayDate(
  schedule: Schedule,
  rule: BusinessDayRule,
  from: string
): string | undefined {
  const year = Number(from.slice(0, 4))
  return [
    ...payDates(schedule, rule, year),
    ...payDates(schedule, rule, year + 1),
  ].find((date) => date >= from)
}

const ordinal = (day: number) =>
  day === LAST_DAY
    ? "last day"
    : `${day}${day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th"}`

const monthName = (month: number) =>
  new Date(2000, month - 1, 1).toLocaleString("en-US", { month: "long" })

/** "Every two weeks", "The 15th and last day", "Quarterly on the last day of Jan, Apr, Jul, Oct". */
export function describeSchedule(schedule: Schedule): string {
  switch (schedule.kind) {
    case "weekly":
      return "Every week"
    case "biweekly":
      return "Every two weeks"
    case "semimonthly":
      return `The ${ordinal(schedule.days[0])} and ${ordinal(schedule.days[1])}`
    case "monthly":
      return `Monthly on the ${ordinal(schedule.day)}`
    case "quarterly": {
      const months = [0, 3, 6, 9].map((add) =>
        monthName(((schedule.month - 1 + add) % 12) + 1).slice(0, 3)
      )
      return `Quarterly on the ${ordinal(schedule.day)} of ${months.join(", ")}`
    }
    case "yearly":
      return `Yearly on ${monthName(schedule.month)} ${schedule.day === LAST_DAY ? "(last day)" : schedule.day}`
  }
}
