import { z } from "astro/zod"

import { ACCOUNT_KINDS } from "@/lib/accounts"
import { toCents } from "@/lib/money"
import {
  createAccount,
  deleteAccount,
  deleteBalance,
  updateBalance,
  recordBalance,
  setArchived,
  updateAccount,
} from "@/server/accounts"

import { op } from "./operation"
import { run } from "./run"
import { dollars, id, isoDate, optionalText } from "./schemas"

export const accountFields = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(100),
  kind: z.enum(ACCOUNT_KINDS),
  subtype: optionalText(100),
  institution: optionalText(100),
  last4: z
    .string()
    .trim()
    .regex(/^(\d{4})?$/, "Enter the last four digits, or leave this blank."),
  ownerId: id.nullable(),
  notes: optionalText(2000),
})

const balance = z.object({ amount: dollars, asOf: isoDate })

export const accounts = {
  createAccount: op({
    description:
      "Add an account (checking, savings, brokerage, retirement, hsa, or asset), optionally with its current balance in dollars.",
    input: accountFields.extend({ balance: balance.nullable() }),
    handler: ({ balance, ...input }) =>
      run((db) =>
        createAccount(
          db,
          input,
          balance
            ? { amount: toCents(balance.amount), asOf: balance.asOf }
            : undefined
        )
      ),
  }),
  updateAccount: op({
    description: "Change an account's details.",
    input: accountFields.extend({ id }),
    handler: ({ id, ...input }) => run((db) => updateAccount(db, id, input)),
  }),
  archiveAccount: op({
    description:
      "Archive a closed account (left out of net worth), or restore one.",
    input: z.object({ id, archived: z.boolean() }),
    handler: ({ id, archived }) => run((db) => setArchived(db, id, archived)),
  }),
  deleteAccount: op({
    description:
      "Delete an account that nothing refers to. Archive accounts with history instead.",
    input: z.object({ id }),
    handler: ({ id }) => run((db) => deleteAccount(db, id)),
  }),
  recordBalance: op({
    description:
      "Record an account's balance in dollars as of a date (for loans and cards, the amount owed). Earlier balances stay in its history.",
    input: balance.extend({ accountId: id }),
    handler: ({ accountId, amount, asOf }) =>
      run((db) => recordBalance(db, accountId, toCents(amount), asOf)),
  }),
  updateBalance: op({
    description:
      "Correct one entry in an account's balance history (amount in dollars, as of a date), for a typo rather than a new balance.",
    input: z.object({ id, amount: dollars, asOf: isoDate }),
    handler: ({ id, amount, asOf }) =>
      run((db) => updateBalance(db, id, { amount: toCents(amount), asOf })),
  }),
  deleteBalance: op({
    description: "Delete one entry from an account's balance history.",
    input: z.object({ id }),
    handler: ({ id }) => run((db) => deleteBalance(db, id)),
  }),
}
