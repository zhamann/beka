import { z } from "astro/zod"

import { ISO_DATE } from "@/lib/dates"

export const id = z.number().int().positive()

export const isoDate = z.string().regex(ISO_DATE, "Enter a date.")

/** A dollar amount as typed, which the server stores as cents. */
export const dollars = z
  .number({ error: "Enter an amount." })
  .min(-1e11)
  .max(1e11)

export const optionalText = (max: number) => z.string().trim().max(max)

/** A percentage as typed, like 9.24 for 9.24%. */
export const percent = z
  .number({ error: "Enter a percentage." })
  .min(0, "Enter 0 or more.")
  .max(100, "Enter 100 or less.")
