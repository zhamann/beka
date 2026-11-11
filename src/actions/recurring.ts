import { z } from "astro/zod"

import { toCents } from "@/lib/money"
import { FREQUENCIES } from "@/lib/recurring"
import {
  confirmRecurring,
  createRecurring,
  deleteRecurring,
  dismissRecurring,
  endRecurring,
  keepRecurring,
  restartRecurring,
  restoreSuggestion,
  setTransactionRecurring,
  updateRecurring,
} from "@/server/recurring"

import { op } from "./operation"
import { run } from "./run"
import { dollars, id, isoDate } from "./schemas"

const recurringInput = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(100),
  merchant: z.string().trim().max(200),
  frequency: z.enum(FREQUENCIES),
  amountMode: z.enum(["latest", "average"]),
  matchMode: z.enum(["any", "near"]),
  manualAmount: dollars.positive("Enter an amount above 0.").nullable(),
  anchorDate: isoDate.nullable(),
  categoryId: id.nullable(),
  accountId: id.nullable(),
})

const toInput = (input: z.infer<typeof recurringInput>) => ({
  ...input,
  manualAmount:
    input.manualAmount === null ? null : toCents(input.manualAmount),
})

const byId = z.object({ id })

export const recurring = {
  confirmRecurring: op({
    description:
      "Confirm a suggested recurring payment, flagging its past and future charges.",
    input: byId,
    handler: ({ id }) => run((db) => confirmRecurring(db, id)),
  }),
  dismissRecurring: op({
    description: "Mark a suggested recurring payment as not recurring.",
    input: byId,
    handler: ({ id }) => run((db) => dismissRecurring(db, id)),
  }),
  endRecurring: op({
    description: "End a recurring payment that stopped.",
    input: byId,
    handler: ({ id }) => run((db) => endRecurring(db, id)),
  }),
  restoreSuggestion: op({
    description:
      "Undo dismissing a suggested recurring payment, so it's suggested again.",
    input: byId,
    handler: ({ id }) => run((db) => restoreSuggestion(db, id)),
  }),
  restartRecurring: op({
    description: "Restart an ended recurring payment.",
    input: byId,
    handler: ({ id }) => run((db) => restartRecurring(db, id)),
  }),
  keepRecurring: op({
    description:
      "Record that a payment flagged as possibly ended is still going.",
    input: byId,
    handler: ({ id }) => run((db) => keepRecurring(db, id)),
  }),
  deleteRecurring: op({
    description:
      "Delete a recurring payment; its charges go back to plain spending.",
    input: byId,
    handler: ({ id }) => run((db) => deleteRecurring(db, id)),
  }),
  createRecurring: op({
    description:
      "Add a recurring payment by hand, for charges uploads won't show. Amount in dollars.",
    input: recurringInput,
    handler: (input) => run((db) => createRecurring(db, toInput(input))),
  }),
  updateRecurring: op({
    description: "Change a recurring payment.",
    input: recurringInput.extend({ id }),
    handler: ({ id, ...input }) =>
      run((db) => updateRecurring(db, id, toInput(input))),
  }),
  setTransactionRecurring: op({
    description:
      "Flag a transaction as part of a recurring payment (an id), start a new one from it (a frequency), or unflag it (null).",
    input: z.object({
      transactionId: id,
      target: z.union([id, z.enum(FREQUENCIES), z.null()]),
    }),
    handler: ({ transactionId, target }) =>
      run((db) => setTransactionRecurring(db, transactionId, target)),
  }),
}
