import { z } from "astro/zod"

import { CATEGORY_COLORS, CATEGORY_TYPES } from "@/lib/categories"
import { toCents } from "@/lib/money"
import { FREQUENCIES } from "@/lib/recurring"
import { transaction } from "@/server/database"
import { setTransactionRecurring } from "@/server/recurring"
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/server/categories"
import {
  importTransactions,
  IMPORT_ROW_LIMIT,
  previewImport,
  undoImport,
} from "@/server/imports"
import {
  createTransaction,
  deleteTransactions,
  getTransaction,
  recategorize,
  updateTransaction,
} from "@/server/transactions"

import { op } from "./operation"
import { run } from "./run"
import { dollars, id, isoDate } from "./schemas"

const category = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(60),
  type: z.enum(CATEGORY_TYPES),
  hidden: z.boolean(),
  color: z.number().int().min(1).max(CATEGORY_COLORS.length).optional(),
})

const ids = z
  .array(id)
  .min(1, "Choose at least one transaction.")
  .max(IMPORT_ROW_LIMIT)

const transactionInput = z.object({
  date: isoDate,
  accountId: z
    .number({ error: "Choose an account." })
    .int()
    .positive("Choose an account."),
  merchant: z.string().trim().min(1, "Enter the merchant.").max(200),
  description: z.string().trim().max(1000),
  amount: dollars,
  categoryId: id,
  notes: z.string().trim().max(2000),
})

export const transactions = {
  createCategory: op({
    description: `Add a spending category with its type (spending, income, or excluded) and, optionally, the color it wears in spending lists (${CATEGORY_COLORS.map(({ color, name }) => `${color} ${name.toLowerCase()}`).join(", ")}). Left out, it takes the least-used color.`,
    input: category,
    handler: (input) => run((db) => createCategory(db, input)),
  }),
  updateCategory: op({
    description: `Rename, retype, hide, or recolor a category (colors: ${CATEGORY_COLORS.map(({ color, name }) => `${color} ${name.toLowerCase()}`).join(", ")}). Leaving color out keeps the one it has.`,
    input: category.extend({ id }),
    handler: ({ id, ...input }) => run((db) => updateCategory(db, id, input)),
  }),
  deleteCategory: op({
    description:
      "Delete a category, moving its transactions to another first when it has any.",
    input: z.object({ id, moveTo: id.nullable() }),
    handler: ({ id, moveTo }) => run((db) => deleteCategory(db, id, moveTo)),
  }),
  createTransaction: op({
    description:
      "Add one transaction by hand, for something no upload will carry, like a cash purchase (amount in dollars, negative for money out). Use import_transactions_csv for bank exports.",
    input: transactionInput,
    handler: ({ amount, ...input }) =>
      run((db) => createTransaction(db, { ...input, amount: toCents(amount) })),
  }),
  updateTransaction: op({
    description:
      "Edit one transaction (amount in dollars, negative for money out). Optionally set its recurring payment in the same save: an id, a frequency to start a new one, or null to unflag it.",
    input: transactionInput.extend({
      id,
      recurring: z.union([id, z.enum(FREQUENCIES), z.null()]).optional(),
    }),
    handler: ({ id, amount, recurring, ...input }) =>
      run((db) =>
        // One transaction, so a failed edit doesn't leave the recurring change behind.
        transaction(db, () => {
          updateTransaction(db, id, { ...input, amount: toCents(amount) })
          if (recurring !== undefined)
            setTransactionRecurring(db, id, recurring)
          return getTransaction(db, id)
        })
      ),
  }),
  recategorize: op({
    description: "Move transactions to one category.",
    input: z.object({ ids, categoryId: id }),
    handler: ({ ids, categoryId }) =>
      run((db) => recategorize(db, ids, categoryId)),
  }),
  deleteTransactions: op({
    description: "Delete transactions.",
    input: z.object({ ids }),
    handler: ({ ids }) => run((db) => deleteTransactions(db, ids)),
  }),
  previewImport: op({
    description: "Check a CSV of transactions without saving anything.",
    input: z.object({
      csv: z.string().max(15 * 1024 * 1024, "That file is too big."),
    }),
    handler: ({ csv }) => run((db) => previewImport(db, csv)),
  }),
  importTransactions: op({
    description:
      "Save already-resolved transaction rows (account and category ids, amounts in cents).",
    input: z.object({
      fileName: z.string().max(200),
      rows: z
        .array(
          z.object({
            date: isoDate,
            merchant: z.string().trim().min(1).max(200),
            description: z.string().max(1000),
            amount: z.number().int(),
            categoryId: id,
            accountId: id,
            notes: z.string().max(2000),
            notRecurring: z.boolean().optional(),
          })
        )
        .min(1, "There's nothing to import.")
        .max(IMPORT_ROW_LIMIT),
    }),
    handler: ({ rows, fileName }) =>
      run((db) => importTransactions(db, rows, fileName)),
  }),
  undoImport: op({
    description: "Undo an import, deleting the transactions it added.",
    input: z.object({ id }),
    handler: ({ id }) => run((db) => undoImport(db, id)),
  }),
}
