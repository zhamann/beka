import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it } from "vitest"

import { recordBalance } from "./accounts"
import { openDatabase } from "./database"
import {
  createLoan,
  getLoan,
  rankDebts,
  updateLoan,
  type LoanTerms,
} from "./loans"

let db: DatabaseSync
beforeEach(() => {
  db = openDatabase(":memory:")
})

const account = {
  subtype: "",
  institution: "",
  last4: "",
  ownerId: null,
  notes: "",
}

const terms = (rate: number, minimum: number): LoanTerms => ({
  loanType: "student",
  interestRate: rate,
  minimumPayment: minimum,
  dueDay: 18,
  originalAmount: null,
  escrow: 500_00,
})

function loan(name: string, rate: number, owed: number) {
  return createLoan(db, { ...account, name }, terms(rate, 100_00), {
    amount: owed,
    asOf: "2026-11-01",
  })
}

describe("loans", () => {
  it("stores terms, dropping escrow from anything but a mortgage", () => {
    const created = loan("Summit", 0.0925, 30_000_00)
    expect(getLoan(db, created.id)).toMatchObject({
      kind: "loan",
      interestRate: 0.0925,
      minimumPayment: 100_00,
      escrow: null,
      balance: { amount: 30_000_00 },
    })
    updateLoan(
      db,
      created.id,
      { ...account, name: "Mortgage" },
      {
        ...terms(0.065, 1_512_40),
        loanType: "mortgage",
      }
    )
    expect(getLoan(db, created.id)).toMatchObject({
      name: "Mortgage",
      loanType: "mortgage",
      escrow: 500_00,
    })
  })

  it("ranks by rate, or by smallest balance, with monthly interest", () => {
    loan("Lakeview", 0.0712, 21_400_00)
    loan("Summit 9%", 0.0925, 15_200_00)
    const small = loan("Summit 6%", 0.0598, 9_850_00)

    expect(rankDebts(db).map((d) => d.name)).toEqual([
      "Summit 9%",
      "Lakeview",
      "Summit 6%",
    ])
    expect(rankDebts(db, "balance").map((d) => d.name)).toEqual([
      "Summit 6%",
      "Summit 9%",
      "Lakeview",
    ])
    // $15,200.00 × 9.25% ÷ 12
    expect(rankDebts(db)[0].monthlyInterest).toBe(117_17)

    recordBalance(db, small.id, 0, "2026-11-06")
    expect(rankDebts(db, "balance")[0]).toMatchObject({
      name: "Summit 6%",
      monthlyInterest: 0,
    })
  })

  it("rejects a loan id that isn't a loan", () => {
    expect(() => getLoan(db, 99)).toThrow("loan no longer exists")
  })
})
