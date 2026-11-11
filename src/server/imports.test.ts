import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it } from "vitest"

import { createAccount } from "./accounts"
import { listActivity, runAs } from "./activity"
import { listCategories } from "./categories"
import { openDatabase } from "./database"
import {
  aiInstructions,
  importTransactions,
  listImports,
  parseAmount,
  parseDate,
  previewImport,
  undoImport,
  type ImportRow,
} from "./imports"
import {
  categorizationGuide,
  listTransactions,
  recategorize,
} from "./transactions"

let db: DatabaseSync
let checkingId: number
beforeEach(() => {
  db = openDatabase(":memory:")
  checkingId = createAccount(db, {
    name: "Checking",
    kind: "checking",
    subtype: "",
    institution: "Northwind Bank",
    last4: "4417",
    ownerId: null,
    notes: "",
  }).id
})

const categoryId = (name: string) =>
  listCategories(db).find((c) => c.name === name)!.id

const header = "date,merchant,description,amount,category,account,notes"

const row = (overrides: Partial<ImportRow> = {}): ImportRow => ({
  date: "2026-10-05",
  merchant: "Walmart",
  description: "WALMART SC 02231 SPRINGFIELD",
  amount: -42_10,
  categoryId: categoryId("Groceries"),
  accountId: checkingId,
  notes: "",
  ...overrides,
})

describe("parsing", () => {
  it("reads amounts in common shapes", () => {
    expect(parseAmount("-12.34")).toBe(-12_34)
    expect(parseAmount("$1,234.5")).toBe(1_234_50)
    expect(parseAmount("(9.99)")).toBe(-9_99)
    expect(parseAmount("twelve")).toBeNull()
  })

  it("reads ISO and US dates, rejecting impossible ones", () => {
    expect(parseDate("2026-11-06")).toBe("2026-11-06")
    expect(parseDate("11/6/2026")).toBe("2026-11-06")
    expect(parseDate("2026-02-30")).toBeNull()
  })
})

describe("imports", () => {
  it("previews rows, flagging problems by line", () => {
    const preview = previewImport(
      db,
      [
        header,
        '2026-10-05,Walmart,"WALMART, SPRINGFIELD",-42.10,groceries,checking,',
        "2026-10-06,Peacock,PEACOCK,-9.99,Streaming,Checking,",
        "bad,,X,abc,Groceries,Savings,",
      ].join("\n")
    )
    expect(preview.fileError).toBeNull()
    expect(preview.rows[0]).toMatchObject({
      line: 2,
      description: "WALMART, SPRINGFIELD",
      amount: -42_10,
      category: "Groceries",
      account: "Checking",
      errors: [],
    })
    expect(preview.rows[1].errors).toEqual([
      "There's no category named “Streaming”.",
    ])
    expect(preview.rows[2].errors).toHaveLength(4)
    expect(preview.unknownCategories).toEqual(["Streaming"])
    expect(preview.unknownAccounts).toEqual(["Savings"])
  })

  it("explains a missing column", () => {
    expect(previewImport(db, "date,amount\n2026-01-01,1").fileError).toContain(
      "merchant, description, category, account"
    )
  })

  it("skips transactions already imported, but keeps real repeats in one file", () => {
    const facebook = (n: number) =>
      Array.from({ length: n }, () =>
        row({ merchant: "Facebook", description: "FACEBK ADS", amount: -2_00 })
      )
    expect(
      importTransactions(db, [row(), ...facebook(2)], "october.csv")
    ).toMatchObject({
      added: 3,
      skipped: 0,
    })
    // Four identical charges in the next file: two are already stored.
    expect(importTransactions(db, [row(), ...facebook(4)])).toMatchObject({
      added: 2,
      skipped: 3,
    })
    expect(listTransactions(db).total).toBe(5)
    const csv = [
      header,
      "2026-10-05,Walmart,WALMART SC 02231 SPRINGFIELD,-42.10,Groceries,Checking,",
    ].join("\n")
    expect(previewImport(db, csv).rows[0].duplicate).toBe(true)
  })

  it("flags a charge that matches a stored one except its bank description", () => {
    importTransactions(db, [row()])
    const csv = [header, "2026-10-05,Walmart,,-42.10,Groceries,Checking,"].join(
      "\n"
    )
    expect(previewImport(db, csv).rows[0]).toMatchObject({
      duplicate: false,
      possibleDuplicate: true,
    })
  })

  it("undoes an import, deleting its transactions", () => {
    const { importId } = runAs("agent", () =>
      importTransactions(db, [row(), row({ date: "2026-10-06" })], "a.csv")
    )
    expect(listImports(db)[0]).toMatchObject({
      actor: "agent",
      added: 2,
      remaining: 2,
    })
    expect(undoImport(db, importId!)).toBe(2)
    expect(listTransactions(db).total).toBe(0)
    expect(listActivity(db)[0]).toMatchObject({ action: "undo" })
  })

  it("flags rows that differ from a merchant's usual category", () => {
    importTransactions(db, [
      row(),
      row({ date: "2026-09-05" }),
      row({ date: "2026-08-05" }),
    ])
    const csv = [
      header,
      "2026-11-01,walmart,WALMART,-10,Shopping,Checking,",
    ].join("\n")
    expect(previewImport(db, csv).rows[0].usualCategory).toBe("Groceries")
  })
})

describe("the categorization guide", () => {
  it("lists each merchant's categories with when each was last used", () => {
    importTransactions(db, [
      row({
        merchant: "CEFCU",
        date: "2026-05-02",
        amount: -770_00,
        categoryId: categoryId("Internal Transfers"),
      }),
      row({
        merchant: "CEFCU",
        date: "2026-06-02",
        amount: -770_00,
        categoryId: categoryId("Internal Transfers"),
      }),
      row({
        merchant: "CEFCU",
        date: "2026-07-02",
        amount: -770_00,
        categoryId: categoryId("Loan Payment"),
      }),
    ])
    expect(categorizationGuide(db)).toEqual([
      {
        merchant: "CEFCU",
        categories: [
          { name: "Internal Transfers", count: 2, lastUsed: "2026-06-02" },
          { name: "Loan Payment", count: 1, lastUsed: "2026-07-02" },
        ],
      },
    ])
    const instructions = aiInstructions(db)
    expect(instructions).toContain(
      "- CEFCU: Internal Transfers 2× (last 2026-06-02), Loan Payment 1× (last 2026-07-02). Latest: Loan Payment."
    )
    expect(instructions).toContain(
      "- Checking (Northwind Bank, ending in 4417)"
    )
    expect(instructions).toContain("- Uncategorized: Counted in Spending.")
  })

  it("follows bulk recategorizing", () => {
    importTransactions(db, [row(), row({ date: "2026-10-06" })])
    const ids = listTransactions(db).transactions.map((t) => t.id)
    recategorize(db, ids, categoryId("Shopping"))
    expect(categorizationGuide(db)[0].categories).toEqual([
      { name: "Shopping", count: 2, lastUsed: "2026-10-06" },
    ])
  })
})
