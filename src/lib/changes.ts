import { formatDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"

/** One field of a logged change, as a person reads it. */
export interface FieldChange {
  label: string
  before?: string
  after?: string
}

/** Field names that hold cents. */
const MONEY =
  /amount|balance|payment|fee|limit|cap|escrow|annual|monthly|value|rate_cents/i

const HIDDEN = new Set(["id", "createdAt", "recordedAt", "importId"])

/** "minimumPayment" as "Minimum payment". */
function label(key: string): string {
  const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
  return words[0].toUpperCase() + words.slice(1)
}

function show(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "number" && MONEY.test(key)) return formatMoney(value)
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return formatDate(value)
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

/**
 * The fields a logged change touched, labeled and formatted: what changed for
 * an edit, what was there for an add or delete. Ids are left out; the names
 * logged beside them, like `categoryName`, say the same thing readably.
 */
export function describeChange(before: unknown, after: unknown): FieldChange[] {
  const flat = (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined
  const b = flat(before)
  const a = flat(after)
  if (!b && !a) return []
  const keys = [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])]
  return (
    keys
      .filter((key) => !HIDDEN.has(key))
      // Ids mean nothing to a person; the names logged beside them do.
      .filter((key) => !key.endsWith("Id"))
      .filter((key) => !(b && a) || show(key, b[key]) !== show(key, a[key]))
      .map((key) => ({
        label: label(key),
        before: b ? show(key, b[key]) : undefined,
        after: a ? show(key, a[key]) : undefined,
      }))
  )
}
