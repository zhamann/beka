import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it } from "vitest"

import { createAccount, deleteAccount } from "./accounts"
import { openDatabase } from "./database"
import { createMember, deleteMember } from "./household"
import {
  createJob,
  createOtherIncome,
  getJob,
  incomeYear,
  updateJob,
  type JobInput,
} from "./income"

let db: DatabaseSync
beforeEach(() => {
  db = openDatabase(":memory:")
})

const account = (name: string) =>
  createAccount(db, {
    name,
    kind: "checking",
    subtype: "",
    institution: "",
    last4: "",
    ownerId: null,
    notes: "",
  })

const jobInput = (memberId: number, depositAccountId: number): JobInput => ({
  memberId,
  employer: "Acme",
  pay: { type: "salary", annual: 60_000_00 },
  schedule: { kind: "semimonthly", days: [15, 31] },
  businessDayRule: "previous",
  w4: {
    filingStatus: "single",
    multipleJobs: false,
    dependentsAmount: 0,
    otherIncome: 0,
    deductions: 0,
    extraWithholding: 0,
  },
  stateTax: null,
  localTax: null,
  deductions: [],
  employerContributions: [],
  bonus: null,
  depositAccountId,
  splits: [],
})

describe("income", () => {
  it("stores a job and its deposit splits", () => {
    const robin = createMember(db, { name: "Robin", birthYear: null })
    const checking = account("Checking")
    const savings = account("Savings")
    const job = createJob(db, {
      ...jobInput(robin.id, checking.id),
      splits: [{ accountId: savings.id, mode: "amount", value: 200_00 }],
    })
    expect(getJob(db, job.id)).toMatchObject({
      memberName: "Robin",
      pay: { type: "salary", annual: 60_000_00 },
      splits: [{ accountId: savings.id, mode: "amount", value: 200_00 }],
    })
    updateJob(db, job.id, {
      ...jobInput(robin.id, checking.id),
      employer: "Fabrikam",
    })
    expect(getJob(db, job.id)).toMatchObject({
      employer: "Fabrikam",
      splits: [],
    })
  })

  it("lists the year's deposits from paychecks and other income", () => {
    const robin = createMember(db, { name: "Robin", birthYear: null })
    const checking = account("Checking")
    const savings = account("Savings")
    createJob(db, {
      ...jobInput(robin.id, checking.id),
      splits: [{ accountId: savings.id, mode: "amount", value: 100_00 }],
    })
    createOtherIncome(db, {
      memberId: robin.id,
      name: "Pension",
      amount: 1_250_00,
      schedule: { kind: "monthly", day: 31 },
      businessDayRule: "previous",
      taxable: false,
      accountId: checking.id,
    })

    const year = incomeYear(db, 2026)
    expect(year.deposits).toHaveLength(24 + 12)
    expect(year.deposits[0]).toMatchObject({
      date: "2026-01-15",
      amount: 2_099_58,
      parts: [
        { accountName: "Checking", amount: 1_999_58 },
        { accountName: "Savings", amount: 100_00 },
      ],
    })
    expect(year.household).toMatchObject({
      gross: 60_000_00,
      otherIncome: 12 * 1_250_00,
      deposited: 24 * 2_099_58 + 12 * 1_250_00,
    })
    expect(year.monthly).toBe(
      year.byMember.reduce(
        (sum, { totals }) => sum + Math.round(totals.deposited / 12),
        0
      )
    )
    expect(year.typical.get(1)?.net).toBe(2_099_58)
  })

  it("keeps people and accounts with income from being deleted", () => {
    const robin = createMember(db, { name: "Robin", birthYear: null })
    const checking = account("Checking")
    createJob(db, jobInput(robin.id, checking.id))
    expect(() => deleteMember(db, robin.id)).toThrow()
    expect(() => deleteAccount(db, checking.id)).toThrow("Archive it instead")
  })
})
