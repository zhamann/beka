import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it } from "vitest"

import {
  balanceHistory,
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  netWorth,
  recordBalance,
  setArchived,
  updateAccount,
  updateBalance,
  type AccountInput,
} from "./accounts"
import { listActivity } from "./activity"
import { openDatabase } from "./database"
import { createMember, deleteMember } from "./household"

let db: DatabaseSync
beforeEach(() => {
  db = openDatabase(":memory:")
})

const checking: AccountInput = {
  name: "Checking",
  kind: "checking",
  subtype: "",
  institution: "Northwind Bank",
  last4: "4417",
  ownerId: null,
  notes: "",
}

describe("accounts", () => {
  it("keeps every balance and reports the latest by date", () => {
    const account = createAccount(db, checking, {
      amount: 100_00,
      asOf: "2026-10-01",
    })
    recordBalance(db, account.id, 250_00, "2026-11-01")
    recordBalance(db, account.id, 90_00, "2026-09-01")
    expect(getAccount(db, account.id).balance).toMatchObject({
      amount: 250_00,
      asOf: "2026-11-01",
    })
    expect(balanceHistory(db, account.id).map((b) => b.amount)).toEqual([
      250_00, 100_00, 90_00,
    ])
  })

  it("corrects a mistyped balance in place and logs it", () => {
    const account = createAccount(db, checking, {
      amount: 1_000_00,
      asOf: "2026-10-01",
    })
    const [entry] = balanceHistory(db, account.id)
    updateBalance(db, entry.id, { amount: 100_00, asOf: "2026-10-02" })
    expect(getAccount(db, account.id).balance).toMatchObject({
      amount: 100_00,
      asOf: "2026-10-02",
    })
    expect(balanceHistory(db, account.id)).toHaveLength(1)
    expect(listActivity(db)[0].summary).toBe("Corrected a balance of Checking")
  })

  it("adds up net worth from open accounts, counting debts as owed", () => {
    createAccount(db, checking, { amount: 5_000_00, asOf: "2026-11-01" })
    createAccount(
      db,
      { ...checking, name: "Home", kind: "asset", last4: "" },
      { amount: 300_000_00, asOf: "2026-11-01" }
    )
    createAccount(
      db,
      { ...checking, name: "Mortgage", kind: "loan", last4: "" },
      { amount: 200_000_00, asOf: "2026-11-01" }
    )
    const closed = createAccount(
      db,
      { ...checking, name: "Old savings", kind: "savings", last4: "" },
      { amount: 1_000_00, asOf: "2026-01-01" }
    )
    setArchived(db, closed.id, true)

    expect(netWorth(db)).toMatchObject({
      assets: 305_000_00,
      debts: 200_000_00,
      net: 105_000_00,
    })
    expect(listAccounts(db, { archived: true }).map((a) => a.name)).toEqual([
      "Old savings",
    ])
  })

  it("refuses duplicate names and invalid last four digits", () => {
    createAccount(db, checking)
    expect(() => createAccount(db, { ...checking, name: "checking" })).toThrow(
      "already has that name"
    )
    expect(() =>
      createAccount(db, { ...checking, name: "Other", last4: "12a4" })
    ).toThrow()
  })

  it("won't turn an account into a loan", () => {
    const account = createAccount(db, checking)
    expect(() =>
      updateAccount(db, account.id, { ...checking, kind: "loan" })
    ).toThrow("can't change")
    updateAccount(db, account.id, { ...checking, kind: "savings" })
    expect(getAccount(db, account.id).kind).toBe("savings")
  })

  it("keeps owners with accounts from being removed", () => {
    const robin = createMember(db, { name: "Robin", birthYear: null })
    const account = createAccount(db, { ...checking, ownerId: robin.id })
    expect(getAccount(db, account.id).ownerName).toBe("Robin")
    expect(() => deleteMember(db, robin.id)).toThrow("first")
    deleteAccount(db, account.id)
    deleteMember(db, robin.id)
  })

  it("logs balance updates", () => {
    const account = createAccount(db, checking)
    recordBalance(db, account.id, 12_34, "2026-11-06")
    expect(listActivity(db)[0]).toMatchObject({
      entity: "balance",
      summary: "Updated the balance of Checking",
      after: { amount: 12_34, asOf: "2026-11-06" },
    })
  })
})

describe("transactions", () => {
  it("rolls back a nested change without losing the outer one", async () => {
    const { transaction } = await import("./database")
    const account = createAccount(db, checking)
    transaction(db, () => {
      recordBalance(db, account.id, 1_00, "2026-11-01")
      expect(() =>
        transaction(db, () => {
          recordBalance(db, account.id, 2_00, "2026-11-02")
          throw new Error("nope")
        })
      ).toThrow("nope")
    })
    expect(balanceHistory(db, account.id).map((b) => b.amount)).toEqual([1_00])
  })
})
