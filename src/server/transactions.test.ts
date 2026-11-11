import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it } from "vitest"

import { createAccount } from "./accounts"
import { listActivity } from "./activity"
import { listCategories } from "./categories"
import { openDatabase } from "./database"
import { BekaError } from "./errors"
import { createRecurring, listRecurring } from "./recurring"
import { createTransaction, listTransactions } from "./transactions"

let db: DatabaseSync
let accountId: number
beforeEach(() => {
  db = openDatabase(":memory:")
  accountId = createAccount(db, {
    name: "Checking",
    kind: "checking",
    subtype: "",
    institution: "",
    last4: "",
    ownerId: null,
    notes: "",
  }).id
})

const categoryId = (name: string) =>
  listCategories(db).find((c) => c.name === name)!.id

describe("createTransaction", () => {
  const input = () => ({
    date: "2026-03-14",
    accountId,
    merchant: " Farmers Market ",
    description: "",
    amount: -2350,
    categoryId: categoryId("Groceries"),
    notes: "",
  })

  it("adds a transaction outside any import and logs it", () => {
    const added = createTransaction(db, input())
    expect(added).toMatchObject({
      merchant: "Farmers Market",
      amount: -2350,
      importId: null,
      categoryName: "Groceries",
    })
    expect(listTransactions(db).total).toBe(1)
    expect(listActivity(db)[0].summary).toBe(
      "Added Farmers Market on Mar 14, 2026"
    )
  })

  it("links it to its merchant's recurring payment", () => {
    const payment = createRecurring(db, {
      name: "Farmers Market box",
      merchant: "Farmers Market",
      frequency: "monthly",
      amountMode: "latest",
      matchMode: "any",
      manualAmount: null,
      anchorDate: null,
      categoryId: null,
      accountId: null,
    })
    expect(createTransaction(db, input()).recurringId).toBe(payment.id)
  })

  it("explains a missing account", () => {
    expect(() => createTransaction(db, { ...input(), accountId: 999 })).toThrow(
      BekaError
    )
  })
})

describe("listTransactions", () => {
  it("filters by a range of months and leaves out recurring charges", () => {
    const groceries = listCategories(db).find((c) => c.name === "Groceries")!
    const add = (date: string, merchant: string, amount: number) =>
      createTransaction(db, {
        date,
        accountId,
        merchant,
        description: "",
        amount,
        categoryId: groceries.id,
        notes: "",
      })
    createRecurring(db, {
      name: "Produce box",
      merchant: "Produce box",
      frequency: "monthly",
      amountMode: "latest",
      matchMode: "any",
      manualAmount: null,
      anchorDate: null,
      categoryId: null,
      accountId: null,
    })
    add("2026-01-31", "Kroger", -10_00)
    add("2026-02-01", "Kroger", -20_00)
    add("2026-02-02", "Produce box", -30_00)
    add("2026-03-31", "Kroger", -40_00)
    add("2026-04-01", "Kroger", -50_00)

    expect(
      listTransactions(db, { from: "2026-02", to: "2026-03" })
    ).toMatchObject({ total: 3, sum: -90_00 })
    expect(
      listTransactions(db, {
        from: "2026-02",
        to: "2026-03",
        excludeRecurring: true,
      })
    ).toMatchObject({ total: 2, sum: -60_00 })
    expect(
      listTransactions(db, {
        categoryIds: [categoryId("Groceries"), categoryId("Dining & Drinks")],
      }).total
    ).toBe(5)
    expect(
      listTransactions(db, { categoryIds: [categoryId("Dining & Drinks")] })
        .total
    ).toBe(0)
    const box = listRecurring(db)[0]
    expect(listTransactions(db, { recurringId: box.id })).toMatchObject({
      total: 1,
      sum: -30_00,
    })
  })
})
