import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it } from "vitest"

import { createAccount } from "./accounts"
import { listCategories } from "./categories"
import { openDatabase } from "./database"
import { checkDeposits } from "./deposit-matching"
import type { Deposit } from "./income"
import { createTransaction } from "./transactions"

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

const deposit = (date: string, name: string, amount: number): Deposit => ({
  date,
  memberId: 1,
  memberName: "Alex",
  source: { kind: "other", incomeId: 1, name, taxable: true },
  amount,
  parts: [{ accountId, accountName: "Checking", amount }],
})

const income = (date: string, merchant: string, amount: number) =>
  createTransaction(db, {
    date,
    accountId,
    merchant,
    description: "",
    amount,
    categoryId: listCategories(db).find((c) => c.name === "Income")!.id,
    notes: "",
  }).id

describe("checkDeposits", () => {
  it("gives each payer's deposit its own transaction", () => {
    income("2026-06-01", "Brightline Logistics", 2_731_44)
    const brightline = income("2026-06-15", "Brightline Logistics", 2_731_44)
    // Riverside's paycheck is expected nearer Brightline's amount, but the
    // only transaction names Brightline.
    const checks = checkDeposits(
      db,
      [
        deposit("2026-06-12", "Riverside Clinic", 2_600_00),
        deposit("2026-06-15", "Brightline Logistics", 2_378_81),
      ],
      "2026-07-01"
    )
    expect(checks[0]).toEqual({ status: "missing" })
    expect(checks[1]).toMatchObject({
      status: "matched",
      transactionId: brightline,
      difference: 352_63,
    })
  })

  it("matches by closest amount when transactions don't name the payer", () => {
    const small = income("2026-06-14", "ACH CREDIT", 1_000_00)
    const large = income("2026-06-15", "ACH CREDIT", 2_000_00)
    const checks = checkDeposits(
      db,
      [
        deposit("2026-06-15", "Paycheck A", 2_010_00),
        deposit("2026-06-15", "Paycheck B", 990_00),
      ],
      "2026-07-01"
    )
    expect(
      checks.map((c) => c.status === "matched" && c.transactionId)
    ).toEqual([large, small])
  })

  it("leaves future deposits upcoming", () => {
    income("2026-06-15", "Brightline", 100_00)
    expect(
      checkDeposits(
        db,
        [deposit("2026-08-01", "Brightline", 100_00)],
        "2026-07-01"
      )
    ).toEqual([{ status: "upcoming" }])
  })
})
