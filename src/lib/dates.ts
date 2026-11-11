/** A timestamp like "Nov 6, 9:41 AM", with the year when it isn't this one. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  // The year only when it isn't this one: "Nov 10, 5:02 PM".
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** Today as `YYYY-MM-DD` in local time. */
export function today(now = new Date()): string {
  return toIsoDate(now)
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** A `YYYY-MM-DD` date at local midnight. */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** A date like "Nov 6, 2026". */
export function formatDate(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString("en-US", { dateStyle: "medium" })
}

/** A date like "Nov 6". */
export function formatShortDate(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

/** A date with its weekday, like "Fri, Nov 6", for headings over a day. */
export function formatDayHeading(iso: string): string {
  const date = parseIsoDate(iso)
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    // The year only when it isn't this one: "Fri, Nov 28, 2025".
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  })
}

/** Whole days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / 86_400_000
  )
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** "12 days" or "5 months", for how long ago something was true. */
export function age(days: number): string {
  if (days < 60) return `${days} day${days === 1 ? "" : "s"}`
  const months = Math.floor(days / 30.44)
  return `${months} month${months === 1 ? "" : "s"}`
}
