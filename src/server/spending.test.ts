import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it } from "vitest"

import { createAccount } from "./accounts"
import { listCategories } from "./categories"
import { openDatabase } from "./database"
import { importTransactions, type ImportRow } from "./imports"
import { createRecurring } from "./recurring"
import {
  averageSpend,
  monthsBetween,
  spendingPace,
  spendingTable,
} from "./spending"

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

const row = (
  date: string,
  dollars: number,
  category: string,
  merchant = "Store"
): ImportRow => ({
  date,
  merchant,
  description: merchant,
  amount: Math.round(dollars * 100),
  categoryId: listCategories(db).find((c) => c.name === category)!.id,
  accountId,
  notes: "",
})

describe("spending", () => {
  it("lists months across years", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ])
  })

  it("totals spending by category and month, netting refunds and leaving out other types", () => {
    importTransactions(
      db,
      [
        row("2026-09-03", -100, "Groceries"),
        row("2026-09-20", 20, "Groceries"),
        row("2026-10-03", -50, "Groceries"),
        row("2026-10-04", -30, "Dining & Drinks"),
        row("2026-10-05", -500, "Credit Card Payment"),
        row("2026-10-06", 2000, "Income"),
        row("2026-11-02", -40, "Groceries"),
      ],
      "",
      "2026-11-06"
    )
    const table = spendingTable(db, {
      from: "2026-09",
      to: "2026-11",
      on: "2026-11-06",
    })
    expect(table.months).toEqual(["2026-09", "2026-10"])
    expect(table.current).toBe("2026-11")
    expect(table.categories.map((c) => [c.name, c.byMonth, c.average])).toEqual(
      [
        [
          "Groceries",
          { "2026-09": 80_00, "2026-10": 50_00, "2026-11": 40_00 },
          65_00,
        ],
        ["Dining & Drinks", { "2026-10": 30_00 }, 15_00],
      ]
    )
    expect(table.totals).toEqual({
      "2026-09": 80_00,
      "2026-10": 80_00,
      "2026-11": 40_00,
    })
    expect(table.average).toBe(80_00)
  })

  it("leaves recurring charges out of Spend unless asked", () => {
    importTransactions(
      db,
      [
        row("2026-10-05", -27.99, "Health & Wellness", "Club Fitness"),
        row("2026-10-06", -10, "Health & Wellness"),
      ],
      "",
      "2026-11-06"
    )
    createRecurring(db, {
      name: "Club Fitness",
      merchant: "Club Fitness",
      frequency: "monthly",
      amountMode: "latest",
      matchMode: "any",
      manualAmount: null,
      anchorDate: null,
      categoryId: null,
      accountId: null,
    })
    const range = { from: "2026-10", to: "2026-10", on: "2026-11-06" }
    expect(spendingTable(db, range).totals["2026-10"]).toBe(10_00)
    expect(
      spendingTable(db, { ...range, includeRecurring: true }).totals["2026-10"]
    ).toBe(37_99)
  })

  it("averages Spend over the last 12 complete months, or fewer when data starts later", () => {
    importTransactions(
      db,
      [
        row("2025-01-10", -999, "Shopping"),
        row("2025-11-10", -120, "Shopping"),
        row("2026-10-10", -240, "Shopping"),
        row("2026-11-01", -5000, "Shopping"),
      ],
      "",
      "2026-11-06"
    )
    expect(averageSpend(db, "2026-11-06")).toEqual({
      average: 30_00,
      months: 12,
    })
    expect(averageSpend(db, "2025-03-15")).toEqual({
      average: Math.round(999_00 / 2),
      months: 2,
    })
  })

  it("builds up this month day by day against a usual month that ends on Spend", () => {
    importTransactions(
      db,
      [
        row("2026-09-02", -30, "Groceries"),
        row("2026-09-30", -10, "Groceries"),
        row("2026-10-01", -20, "Dining & Drinks"),
        row("2026-10-31", -40, "Shopping"),
        row("2026-10-15", 500, "Income"),
        row("2026-11-03", -15, "Groceries"),
      ],
      "",
      "2026-11-05"
    )
    const pace = spendingPace(db, "2026-11-05")
    expect(pace).toMatchObject({
      month: "2026-11",
      day: 5,
      days: 30,
      months: 2,
    })
    expect(pace.spent).toEqual([0, 0, 15_00, 15_00, 15_00])
    expect(pace.usual).toHaveLength(30)
    // Day 1: September's nothing and October's $20.
    expect(pace.usual[0]).toBe(10_00)
    expect(pace.usual[1]).toBe(25_00)
    expect(pace.usual[28]).toBe(25_00)
    // A 30-day month ends with October's 31st counted, on the average.
    expect(pace.usual[29]).toBe(50_00)
    expect(pace.usual[29]).toBe(averageSpend(db, "2026-11-05").average)
  })

  it("has no usual month before a month is complete", () => {
    importTransactions(
      db,
      [row("2026-11-02", -12, "Groceries")],
      "",
      "2026-11-03"
    )
    expect(spendingPace(db, "2026-11-03")).toMatchObject({
      spent: [0, 12_00, 12_00],
      usual: [],
      months: 0,
    })
  })
})
