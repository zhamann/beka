/**
 * Which `chart-N` color a part of a whole takes. Number parts in the order
 * they're drawn; a strip shouldn't put 1 beside 4, the one pair color-blind
 * readers can't tell apart.
 */
export type Tone = 1 | 2 | 3 | 4

/** One part of a whole, drawn by `Strip`. */
export interface Part {
  label: string
  /** Cents; parts at or under zero are left out. */
  amount: number
  tone: Tone
  /** A fill class that names what the part is, like a category's `categoryFill`, in place of its tone. */
  fill?: string
}

/** The swatch class for each tone. */
export const TONES: Record<Tone, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
}
