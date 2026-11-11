import { z } from "astro/zod"

import { updateFreshnessRules } from "@/server/settings"

import { op } from "./operation"
import { run } from "./run"

export const settings = {
  updateFreshnessRules: op({
    description:
      "Change which out-of-date checks run and how old a balance can get.",
    input: z.object({
      balances: z.boolean(),
      balanceDays: z
        .number({ error: "Enter a number of days." })
        .int("Enter whole days.")
        .min(1, "Enter at least 1 day.")
        .max(365, "Enter 365 days or fewer."),
      transactions: z.boolean(),
      rotatingCategories: z.boolean(),
      taxTables: z.boolean(),
    }),
    handler: (rules) => run((db) => updateFreshnessRules(db, rules)),
  }),
}
