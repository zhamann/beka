import type { DatabaseSync } from "node:sqlite"

import {
  DEDUCTION_TYPES,
  simulateYear,
  splitDeposit,
  typicalPaycheck,
  type JobSetup,
  type Paycheck,
  type Split,
} from "@/lib/paycheck/paycheck"
import {
  payDates,
  type BusinessDayRule,
  type Schedule,
} from "@/lib/paycheck/schedule"

import { getAccount } from "./accounts"
import { logChange } from "./activity"
import { transaction } from "./database"
import {
  BekaError,
  notFound,
  SQLITE_CONSTRAINT_FOREIGNKEY,
  translate,
} from "./errors"
import { listMembers, type Member } from "./household"

// Jobs

export type JobInput = Omit<JobSetup, "id"> & {
  depositAccountId: number | null
  splits: Split[]
}

export interface Job extends JobInput {
  id: number
  memberName: string
}

interface JobRow {
  id: number
  member_id: number
  memberName: string
  employer: string
  pay: string
  schedule: string
  business_day_rule: BusinessDayRule
  w4: string
  state_tax: string | null
  local_tax: string | null
  deductions: string
  employer_contributions: string
  bonus: string | null
  deposit_account_id: number | null
}

const parse = <T>(json: string | null): T | null =>
  json === null ? null : (JSON.parse(json) as T)

function toJob(db: DatabaseSync, row: JobRow): Job {
  return {
    id: row.id,
    memberId: row.member_id,
    memberName: row.memberName,
    employer: row.employer,
    pay: JSON.parse(row.pay),
    schedule: JSON.parse(row.schedule),
    businessDayRule: row.business_day_rule,
    w4: JSON.parse(row.w4),
    stateTax: parse(row.state_tax),
    localTax: parse(row.local_tax),
    deductions: JSON.parse(row.deductions),
    employerContributions: JSON.parse(row.employer_contributions),
    bonus: parse(row.bonus),
    depositAccountId: row.deposit_account_id,
    splits: db
      .prepare(
        "SELECT account_id AS accountId, mode, value FROM job_splits WHERE job_id = ? ORDER BY position"
      )
      .all(row.id) as unknown as Split[],
  }
}

const jobSelect = `SELECT j.*, m.name AS memberName FROM jobs j JOIN members m ON m.id = j.member_id`

/** Every job, grouped by person and sorted by employer. */
export function listJobs(db: DatabaseSync): Job[] {
  const rows = db
    .prepare(
      `${jobSelect} ORDER BY m.name COLLATE NOCASE, j.employer COLLATE NOCASE`
    )
    .all() as unknown as JobRow[]
  return rows.map((row) => toJob(db, row))
}

export function getJob(db: DatabaseSync, id: number): Job {
  const row = db.prepare(`${jobSelect} WHERE j.id = ?`).get(id) as
    JobRow | undefined
  if (!row) throw notFound("job")
  return toJob(db, row)
}

const missingReference = new BekaError(
  "not-found",
  "That person or account no longer exists."
)

function writeJob(db: DatabaseSync, input: JobInput, id?: number): number {
  const values = [
    input.memberId,
    input.employer.trim(),
    JSON.stringify(input.pay),
    JSON.stringify(input.schedule),
    input.businessDayRule,
    JSON.stringify(input.w4),
    input.stateTax && JSON.stringify(input.stateTax),
    input.localTax && JSON.stringify(input.localTax),
    JSON.stringify(input.deductions),
    JSON.stringify(input.employerContributions),
    input.bonus && JSON.stringify(input.bonus),
    input.depositAccountId,
  ]
  try {
    if (id === undefined) {
      id = Number(
        db
          .prepare(
            `INSERT INTO jobs (member_id, employer, pay, schedule, business_day_rule, w4,
             state_tax, local_tax, deductions, employer_contributions, bonus, deposit_account_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(...values).lastInsertRowid
      )
    } else {
      db.prepare(
        `UPDATE jobs SET member_id = ?, employer = ?, pay = ?, schedule = ?, business_day_rule = ?,
         w4 = ?, state_tax = ?, local_tax = ?, deductions = ?, employer_contributions = ?,
         bonus = ?, deposit_account_id = ? WHERE id = ?`
      ).run(...values, id)
    }
    db.prepare("DELETE FROM job_splits WHERE job_id = ?").run(id)
    const insert = db.prepare(
      "INSERT INTO job_splits (job_id, position, account_id, mode, value) VALUES (?, ?, ?, ?, ?)"
    )
    input.splits.forEach((split, position) =>
      insert.run(id!, position, split.accountId, split.mode, split.value)
    )
  } catch (error) {
    translate(error, { [SQLITE_CONSTRAINT_FOREIGNKEY]: missingReference })
  }
  return id
}

/** A job's settings without its id and the member's name, for the activity log. */
function describeJob({ id, memberName, ...input }: Job): JobInput {
  void id
  void memberName
  return input
}

export function createJob(db: DatabaseSync, input: JobInput): Job {
  return transaction(db, () => {
    const job = getJob(db, writeJob(db, input))
    logChange(db, {
      action: "create",
      entity: "job",
      entityId: job.id,
      summary: `Added ${job.memberName}'s job at ${job.employer}`,
      after: describeJob(job),
    })
    return job
  })
}

export function updateJob(db: DatabaseSync, id: number, input: JobInput): Job {
  return transaction(db, () => {
    const before = getJob(db, id)
    writeJob(db, input, id)
    const after = getJob(db, id)
    logChange(db, {
      action: "update",
      entity: "job",
      entityId: id,
      summary: `Updated ${after.memberName}'s job at ${after.employer}`,
      before: describeJob(before),
      after: describeJob(after),
    })
    return after
  })
}

export function deleteJob(db: DatabaseSync, id: number) {
  transaction(db, () => {
    const before = getJob(db, id)
    db.prepare("DELETE FROM jobs WHERE id = ?").run(id)
    logChange(db, {
      action: "delete",
      entity: "job",
      entityId: id,
      summary: `Removed ${before.memberName}'s job at ${before.employer}`,
      before: describeJob(before),
    })
  })
}

// Other income

export interface OtherIncomeInput {
  memberId: number
  name: string
  /** Cents deposited each time. */
  amount: number
  schedule: Schedule
  businessDayRule: BusinessDayRule
  taxable: boolean
  accountId: number | null
}

export interface OtherIncome extends OtherIncomeInput {
  id: number
  memberName: string
}

interface OtherIncomeRow {
  id: number
  member_id: number
  memberName: string
  name: string
  amount: number
  schedule: string
  business_day_rule: BusinessDayRule
  taxable: number
  account_id: number | null
}

const toOtherIncome = (row: OtherIncomeRow): OtherIncome => ({
  id: row.id,
  memberId: row.member_id,
  memberName: row.memberName,
  name: row.name,
  amount: row.amount,
  schedule: JSON.parse(row.schedule),
  businessDayRule: row.business_day_rule,
  taxable: row.taxable === 1,
  accountId: row.account_id,
})

const otherSelect = `SELECT o.*, m.name AS memberName FROM other_income o JOIN members m ON m.id = o.member_id`

export function listOtherIncome(db: DatabaseSync): OtherIncome[] {
  return (
    db
      .prepare(
        `${otherSelect} ORDER BY m.name COLLATE NOCASE, o.name COLLATE NOCASE`
      )
      .all() as unknown as OtherIncomeRow[]
  ).map(toOtherIncome)
}

export function getOtherIncome(db: DatabaseSync, id: number): OtherIncome {
  const row = db.prepare(`${otherSelect} WHERE o.id = ?`).get(id) as
    OtherIncomeRow | undefined
  if (!row) throw notFound("income")
  return toOtherIncome(row)
}

function writeOtherIncome(
  db: DatabaseSync,
  input: OtherIncomeInput,
  id?: number
): number {
  const values = [
    input.memberId,
    input.name.trim(),
    input.amount,
    JSON.stringify(input.schedule),
    input.businessDayRule,
    input.taxable ? 1 : 0,
    input.accountId,
  ]
  try {
    if (id === undefined) {
      return Number(
        db
          .prepare(
            `INSERT INTO other_income (member_id, name, amount, schedule, business_day_rule, taxable, account_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(...values).lastInsertRowid
      )
    }
    db.prepare(
      `UPDATE other_income SET member_id = ?, name = ?, amount = ?, schedule = ?,
       business_day_rule = ?, taxable = ?, account_id = ? WHERE id = ?`
    ).run(...values, id)
    return id
  } catch (error) {
    translate(error, { [SQLITE_CONSTRAINT_FOREIGNKEY]: missingReference })
  }
}

export function createOtherIncome(
  db: DatabaseSync,
  input: OtherIncomeInput
): OtherIncome {
  return transaction(db, () => {
    const income = getOtherIncome(db, writeOtherIncome(db, input))
    logChange(db, {
      action: "create",
      entity: "other_income",
      entityId: income.id,
      summary: `Added ${income.memberName}'s ${income.name}`,
      after: income,
    })
    return income
  })
}

export function updateOtherIncome(
  db: DatabaseSync,
  id: number,
  input: OtherIncomeInput
): OtherIncome {
  return transaction(db, () => {
    const before = getOtherIncome(db, id)
    writeOtherIncome(db, input, id)
    const after = getOtherIncome(db, id)
    logChange(db, {
      action: "update",
      entity: "other_income",
      entityId: id,
      summary: `Updated ${after.memberName}'s ${after.name}`,
      before,
      after,
    })
    return after
  })
}

export function deleteOtherIncome(db: DatabaseSync, id: number) {
  transaction(db, () => {
    const before = getOtherIncome(db, id)
    db.prepare("DELETE FROM other_income WHERE id = ?").run(id)
    logChange(db, {
      action: "delete",
      entity: "other_income",
      entityId: id,
      summary: `Removed ${before.memberName}'s ${before.name}`,
      before,
    })
  })
}

// The year's deposits and totals

export interface DepositPart {
  accountId: number | null
  accountName: string | null
  amount: number
}

export interface Deposit {
  date: string
  memberId: number
  memberName: string
  source:
    | { kind: "job"; jobId: number; employer: string; paycheck: Paycheck }
    | { kind: "other"; incomeId: number; name: string; taxable: boolean }
  /** Cents deposited across every account. */
  amount: number
  parts: DepositPart[]
}

export interface Totals {
  gross: number
  federal: number
  socialSecurity: number
  medicare: number
  state: number
  local: number
  /** Traditional and Roth deferrals, 457(b) included. */
  retirement: number
  hsa: number
  /** Every other deduction: insurance premiums, FSAs, dues, … */
  otherDeductions: number
  employer: number
  /** Income outside payroll. */
  otherIncome: number
  /** Cents deposited: take-home pay plus other income. */
  deposited: number
}

const emptyTotals = (): Totals => ({
  gross: 0,
  federal: 0,
  socialSecurity: 0,
  medicare: 0,
  state: 0,
  local: 0,
  retirement: 0,
  hsa: 0,
  otherDeductions: 0,
  employer: 0,
  otherIncome: 0,
  deposited: 0,
})

function addPaycheck(totals: Totals, paycheck: Paycheck) {
  totals.gross += paycheck.gross
  totals.federal += paycheck.taxes.federal
  totals.socialSecurity += paycheck.taxes.socialSecurity
  totals.medicare += paycheck.taxes.medicare
  totals.state += paycheck.taxes.state
  totals.local += paycheck.taxes.local
  for (const line of [...paycheck.pretax, ...paycheck.posttax]) {
    const limit =
      DEDUCTION_TYPES[line.type as keyof typeof DEDUCTION_TYPES]?.limit
    if (limit === "hsa") totals.hsa += line.amount
    else if (limit) totals.retirement += line.amount
    else totals.otherDeductions += line.amount
  }
  totals.employer += paycheck.employer.reduce(
    (sum, line) => sum + line.amount,
    0
  )
  totals.deposited += paycheck.net
}

export interface IncomeYear {
  year: number
  taxTablesCurrent: boolean
  deposits: Deposit[]
  byMember: { member: Member; totals: Totals }[]
  household: Totals
  /** Each person's deposits for the year ÷ 12, rounded, then added: the Dashboard's Income. */
  monthly: number
  /** A regular paycheck for each job, for its breakdown. */
  typical: Map<number, Paycheck>
}

/** Every deposit in `year` from jobs and other income, with yearly totals. */
export function incomeYear(db: DatabaseSync, year: number): IncomeYear {
  const members = listMembers(db)
  const jobs = listJobs(db)
  const others = listOtherIncome(db)
  const accountNames = new Map<number, string>()
  const accountName = (id: number | null) => {
    if (id === null) return null
    if (!accountNames.has(id)) accountNames.set(id, getAccount(db, id).name)
    return accountNames.get(id)!
  }
  const parts = (amount: number, mainId: number | null, splits: Split[]) =>
    splitDeposit(amount, mainId, splits).map((part) => ({
      ...part,
      accountName: accountName(part.accountId),
    }))

  const deposits: Deposit[] = []
  const typical = new Map<number, Paycheck>()
  let taxTablesCurrent = true
  const byMember = members.map((member) => {
    const totals = emptyTotals()
    const memberJobs = jobs.filter((job) => job.memberId === member.id)
    const result = simulateYear(memberJobs, member.birthYear, year)
    if (memberJobs.length > 0) taxTablesCurrent &&= result.taxTablesCurrent
    for (const job of memberJobs) {
      const check = typicalPaycheck(result, job.id)
      if (check) typical.set(job.id, check)
    }
    for (const paycheck of result.paychecks) {
      const job = memberJobs.find((j) => j.id === paycheck.jobId)!
      addPaycheck(totals, paycheck)
      deposits.push({
        date: paycheck.date,
        memberId: member.id,
        memberName: member.name,
        source: {
          kind: "job",
          jobId: job.id,
          employer: job.employer,
          paycheck,
        },
        amount: paycheck.net,
        parts: parts(paycheck.net, job.depositAccountId, job.splits),
      })
    }
    for (const income of others.filter((o) => o.memberId === member.id)) {
      for (const date of payDates(
        income.schedule,
        income.businessDayRule,
        year
      )) {
        totals.otherIncome += income.amount
        totals.deposited += income.amount
        deposits.push({
          date,
          memberId: member.id,
          memberName: member.name,
          source: {
            kind: "other",
            incomeId: income.id,
            name: income.name,
            taxable: income.taxable,
          },
          amount: income.amount,
          parts: parts(income.amount, income.accountId, []),
        })
      }
    }
    return { member, totals }
  })

  const household = emptyTotals()
  for (const { totals } of byMember) {
    for (const key of Object.keys(household) as (keyof Totals)[])
      household[key] += totals[key]
  }
  deposits.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.memberName.localeCompare(b.memberName)
  )
  return {
    year,
    taxTablesCurrent,
    deposits,
    byMember,
    household,
    // Each person's month rounded to the cent, then added, so the Income
    // page's sum and the Dashboard show the same household figure.
    monthly: byMember.reduce(
      (sum, { totals }) => sum + Math.round(totals.deposited / 12),
      0
    ),
    typical,
  }
}
