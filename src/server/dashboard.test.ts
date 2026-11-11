import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it } from "vitest"

import { age } from "@/lib/dates"

import { createAccount, recordBalance } from "./accounts"
import { listCategories } from "./categories"
import { openDatabase } from "./database"
import { checkDeposits } from "./deposit-matching"
import { needsUpdating } from "./freshness"
import { createMember } from "./household"
import { createOtherIncome, incomeYear } from "./income"
import { importTransactions, type ImportRow } from "./imports"
import { updateFreshnessRules, DEFAULT_RULES } from "./settings"

let db: DatabaseSync
let accountId: number
beforeEach(() => {
  db = openDatabase(":memory:")
  accountId = createAccount(
    db,
    {
      name: "Checking",
      kind: "checking",
      subtype: "",
      institution: "",
      last4: "",
      ownerId: null,
      notes: "",
    },
    { amount: 1_000_00, asOf: "2026-10-01" }
  ).id
})

const category = (name: string) =>
  listCategories(db).find((c) => c.name === name)!.id
const row = (
  date: string,
  dollars: number,
  name = "Groceries",
  merchant = "Store"
): ImportRow => ({
  date,
  merchant,
  description: merchant,
  amount: Math.round(dollars * 100),
  categoryId: category(name),
  accountId,
  notes: "",
})

describe("needs updating", () => {
  it("flags old balances, a missing month, and uncategorized transactions", () => {
    importTransactions(
      db,
      [row("2026-09-20", -10), row("2026-09-21", -5, "Uncategorized")],
      "",
      "2026-11-06"
    )
    expect(needsUpdating(db, "2026-11-06").map((r) => r.kind)).toEqual([
      "balance",
      "transactions",
      "uncategorized",
    ])
    recordBalance(db, accountId, 1_200_00, "2026-11-01")
    importTransactions(db, [row("2026-10-30", -10)], "", "2026-11-06")
    expect(needsUpdating(db, "2026-11-06").map((r) => r.kind)).toEqual([
      "uncategorized",
    ])
  })

  it("gives property a year before its value counts as old", () => {
    recordBalance(db, accountId, 1_200_00, "2026-11-01")
    importTransactions(db, [row("2026-10-30", -10)], "", "2026-11-06")
    const home = createAccount(
      db,
      {
        name: "Home",
        kind: "asset",
        subtype: "",
        institution: "",
        last4: "",
        ownerId: null,
        notes: "",
      },
      { amount: 400_000_00, asOf: "2026-05-01" }
    )
    const kinds = (on: string) =>
      needsUpdating(db, on)
        .filter((r) => r.kind === "balance")
        .map((r) => r.href)
    expect(kinds("2026-11-06")).toEqual([])
    expect(kinds("2027-06-01")).toContain(`/accounts/${home.id}#update`)
  })

  it("skips rules turned off in Settings", () => {
    updateFreshnessRules(db, {
      ...DEFAULT_RULES,
      balances: false,
      transactions: false,
    })
    expect(needsUpdating(db, "2026-11-06")).toEqual([])
  })
})

describe("deposit checks", () => {
  it("matches expected deposits to uploaded income within three days", () => {
    const robin = createMember(db, { name: "Robin", birthYear: null })
    createOtherIncome(db, {
      memberId: robin.id,
      name: "Pension",
      amount: 1_250_00,
      schedule: { kind: "monthly", day: 31 },
      businessDayRule: "previous",
      taxable: false,
      accountId,
    })
    importTransactions(
      db,
      [
        row("2026-08-31", 1250, "Income", "Pension"),
        row("2026-09-30", 1240, "Income", "Pension"),
        row("2026-11-03", -20),
      ],
      "",
      "2026-11-06"
    )
    const deposits = incomeYear(db, 2026).deposits
    const checks = checkDeposits(db, deposits, "2026-11-06")
    const byDate = Object.fromEntries(
      deposits.map((d, i) => [d.date, checks[i]])
    )
    expect(byDate["2026-08-31"]).toMatchObject({
      status: "matched",
      difference: 0,
    })
    expect(byDate["2026-09-30"]).toMatchObject({
      status: "matched",
      difference: -10_00,
    })
    expect(byDate["2026-10-30"]).toEqual({ status: "missing" })
    expect(byDate["2026-01-30"]).toEqual({ status: "unknown" })
    expect(byDate["2026-11-30"]).toEqual({ status: "upcoming" })
  })
})

describe("age", () => {
  it("counts days for two months, then months", () => {
    expect(age(1)).toBe("1 day")
    expect(age(45)).toBe("45 days")
    expect(age(160)).toBe("5 months")
  })
})
