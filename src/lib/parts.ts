/** How dark a part of a whole is drawn, darkest (`chart-1`) first. */
export type Tone = 1 | 2 | 3 | 4

/** One part of a whole, drawn by `Strip`. */
export interface Part {
  label: string
  /** Cents; parts at or under zero are left out. */
  amount: number
  tone: Tone
}

/** The swatch class for each tone. */
export const TONES: Record<Tone, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
}
