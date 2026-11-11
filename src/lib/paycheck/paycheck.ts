import {
  PERIODS_PER_YEAR,
  payDates,
  type BusinessDayRule,
  type Schedule,
} from "./schedule"
import { taxYear, type FilingStatus, type TaxYear } from "./tax-years"

/**
 * How a deduction is taxed: before income tax only (like a traditional
 * 401(k)), before income and payroll taxes (like health premiums and HSA
 * through a cafeteria plan), or after taxes.
 */
export type TaxTreatment = "pretax_income" | "pretax_all" | "posttax"

export const DEDUCTION_TYPES = {
  traditional_401k: {
    label: "Traditional 401(k)",
    treatment: "pretax_income",
    limit: "deferral",
  },
  traditional_403b: {
    label: "Traditional 403(b)",
    treatment: "pretax_income",
    limit: "deferral",
  },
  traditional_457b: {
    label: "457(b)",
    treatment: "pretax_income",
    limit: "457",
  },
  roth_401k: {
    label: "Roth 401(k) or 403(b)",
    treatment: "posttax",
    limit: "deferral",
  },
  hsa: { label: "HSA", treatment: "pretax_all", limit: "hsa" },
  health_fsa: { label: "Health FSA", treatment: "pretax_all", limit: null },
  dependent_care_fsa: {
    label: "Dependent care FSA",
    treatment: "pretax_all",
    limit: null,
  },
  medical: { label: "Medical insurance", treatment: "pretax_all", limit: null },
  dental: { label: "Dental insurance", treatment: "pretax_all", limit: null },
  vision: { label: "Vision insurance", treatment: "pretax_all", limit: null },
  commuter: {
    label: "Commuter benefits",
    treatment: "pretax_all",
    limit: null,
  },
  life_insurance: {
    label: "Life insurance",
    treatment: "posttax",
    limit: null,
  },
  disability_insurance: {
    label: "Disability insurance",
    treatment: "posttax",
    limit: null,
  },
  espp: { label: "Employee stock purchase", treatment: "posttax", limit: null },
  union_dues: { label: "Union dues", treatment: "posttax", limit: null },
  other: { label: "Other", treatment: null, limit: null },
} as const satisfies Record<
  string,
  {
    label: string
    treatment: TaxTreatment | null
    limit: "deferral" | "457" | "hsa" | null
  }
>

export type DeductionType = keyof typeof DEDUCTION_TYPES

export const EMPLOYER_CONTRIBUTION_TYPES = {
  retirement_match: "Retirement match",
  hsa: "HSA contribution",
  other: "Other",
} as const

export type EmployerContributionType = keyof typeof EMPLOYER_CONTRIBUTION_TYPES

/** A rule like "6% of pay" or "$150 a check". `value` is a percent or cents. */
export interface AmountRule {
  mode: "percent" | "amount"
  value: number
}

export interface DeductionSetup extends AmountRule {
  name: string
  type: DeductionType
  /** Only for `other`; preset types have their treatment built in. */
  treatment: TaxTreatment
  /** Whether a percent deduction also comes out of bonuses. */
  appliesToBonus: boolean
  /** For HSA deductions: which yearly limit applies. */
  hsaCoverage: "self" | "family"
}

export interface EmployerContributionSetup extends AmountRule {
  name: string
  type: EmployerContributionType
}

export interface W4 {
  filingStatus: FilingStatus
  /** Step 2: multiple jobs or a spouse who works. */
  multipleJobs: boolean
  /** Step 3, cents a year. */
  dependentsAmount: number
  /** Step 4(a), cents a year. */
  otherIncome: number
  /** Step 4(b), cents a year. */
  deductions: number
  /** Step 4(c), cents a paycheck. */
  extraWithholding: number
}

export interface LocalTaxSetup extends AmountRule {
  /** A separate percent for bonuses; `null` uses `value` when it's a percent. */
  bonusPercent: number | null
}

export interface BonusSetup {
  /** Percent of annual salary, or cents per payout. */
  mode: "percent" | "amount"
  value: number
  schedule: Schedule
  /** Paid on the regular paycheck that day instead of as its own deposit. */
  withPaycheck: boolean
}

export interface JobSetup {
  id: number
  memberId: number
  employer: string
  pay:
    | { type: "salary"; /** Cents a year. */ annual: number }
    | {
        type: "hourly"
        /** Cents an hour. */
        rate: number
        hoursPerPeriod: number
        /** Overtime hours a period, paid at 1.5×. */
        overtimeHours: number
      }
  schedule: Schedule
  businessDayRule: BusinessDayRule
  w4: W4
  stateTax: LocalTaxSetup | null
  localTax: LocalTaxSetup | null
  deductions: DeductionSetup[]
  employerContributions: EmployerContributionSetup[]
  bonus: BonusSetup | null
}

export interface PaycheckLine {
  name: string
  type: DeductionType | EmployerContributionType
  /** Cents. */
  amount: number
}

export interface Paycheck {
  jobId: number
  date: string
  /** Cents of regular pay. */
  regular: number
  /** Cents of bonus. */
  bonus: number
  gross: number
  pretax: PaycheckLine[]
  taxes: {
    federal: number
    socialSecurity: number
    medicare: number
    state: number
    local: number
  }
  posttax: PaycheckLine[]
  employer: PaycheckLine[]
  /** Cents deposited. */
  net: number
  /** Deductions held at a yearly limit on this check, by name. */
  limited: string[]
}

const round = (value: number) => Math.round(value)

export function treatmentOf(deduction: DeductionSetup): TaxTreatment {
  return DEDUCTION_TYPES[deduction.type].treatment ?? deduction.treatment
}

/** Federal withholding on regular wages: Pub 15-T Worksheet 1A, in cents. */
export function federalWithholding(
  figures: TaxYear,
  w4: W4,
  taxableWages: number,
  periods: number
): number {
  const dollars = (cents: number) => cents / 100
  const annual = dollars(taxableWages) * periods + dollars(w4.otherIncome)
  const subtract =
    dollars(w4.deductions) +
    (w4.multipleJobs ? 0 : figures.line1g[w4.filingStatus])
  const adjusted = Math.max(0, annual - subtract)
  const table =
    figures.withholding[w4.filingStatus][
      w4.multipleJobs ? "checkbox" : "standard"
    ]
  const row = [...table].reverse().find((r) => adjusted >= r.atLeast)!
  const tentative = row.base + (adjusted - row.atLeast) * row.rate
  const perPeriod = tentative / periods - dollars(w4.dependentsAmount) / periods
  return round(Math.max(0, perPeriod) * 100) + w4.extraWithholding
}

/** Cents of regular pay each period. */
export function regularPay(job: JobSetup): number {
  if (job.pay.type === "salary") {
    return round(job.pay.annual / PERIODS_PER_YEAR[job.schedule.kind])
  }
  return round(
    job.pay.rate * (job.pay.hoursPerPeriod + job.pay.overtimeHours * 1.5)
  )
}

export function bonusAmount(job: JobSetup): number {
  if (!job.bonus) return 0
  if (job.bonus.mode === "amount") return job.bonus.value
  const annual =
    job.pay.type === "salary"
      ? job.pay.annual
      : regularPay(job) * PERIODS_PER_YEAR[job.schedule.kind]
  return round((annual * job.bonus.value) / 100)
}

const ruleAmount = (rule: AmountRule, base: number) =>
  rule.mode === "percent" ? round((base * rule.value) / 100) : rule.value

/** A person's age on December 31, for catch-up limits. */
const ageAt = (year: number, birthYear: number | null) =>
  birthYear === null ? null : year - birthYear

/** Yearly limits on one person's contributions, in cents. */
function personLimits(figures: TaxYear, birthYear: number | null) {
  const age = ageAt(figures.year, birthYear)
  const catchUp =
    age === null || age < 50
      ? 0
      : age >= 60 && age <= 63
        ? figures.superCatchUpLimit
        : figures.catchUpLimit
  return {
    deferral: (figures.electiveDeferralLimit + catchUp) * 100,
    "457":
      (figures.deferral457Limit +
        (age !== null && age >= 50 ? figures.catchUpLimit : 0)) *
      100,
    hsa: (coverage: "self" | "family") =>
      (figures.hsaLimit[coverage] +
        (age !== null && age >= 55 ? figures.hsaCatchUp : 0)) *
      100,
  }
}

interface PayEvent {
  job: JobSetup
  date: string
  regular: number
  bonus: number
}

/** Every regular and bonus payment for a job in `year`. */
function payEvents(job: JobSetup, year: number): PayEvent[] {
  const regular = regularPay(job)
  const events: PayEvent[] = payDates(
    job.schedule,
    job.businessDayRule,
    year
  ).map((date) => ({
    job,
    date,
    regular,
    bonus: 0,
  }))
  if (!job.bonus) return events
  const bonus = bonusAmount(job)
  for (const date of payDates(job.bonus.schedule, job.businessDayRule, year)) {
    // A bonus paid with a paycheck rides on the first paycheck on or after its date.
    const paycheck = job.bonus.withPaycheck
      ? events.find((e) => e.date >= date && e.regular > 0)
      : undefined
    if (paycheck) paycheck.bonus += bonus
    else events.push({ job, date, regular: 0, bonus })
  }
  return events.sort((a, b) => a.date.localeCompare(b.date))
}

export interface YearResult {
  year: number
  /** Whether the app has this year's tax tables, or used the latest it has. */
  taxTablesCurrent: boolean
  paychecks: Paycheck[]
}

/**
 * Every paycheck for one person's jobs in `year`, assuming today's settings
 * have applied since January 1. Jobs share the person's 401(k) and HSA
 * limits; Social Security and Medicare are withheld per employer.
 */
export function simulateYear(
  jobs: JobSetup[],
  birthYear: number | null,
  year: number
): YearResult {
  const { figures, current } = taxYear(year)
  const limits = personLimits(figures, birthYear)
  const used = { deferral: 0, "457": 0, hsa: 0 }
  const perJob = new Map<
    number,
    { ssWages: number; medicareWages: number; supplemental: number }
  >()

  const events = jobs
    .flatMap((job) => payEvents(job, year))
    .sort((a, b) => a.date.localeCompare(b.date) || a.job.id - b.job.id)
  const paychecks = events.map(({ job, date, regular, bonus }) => {
    const totals = perJob.get(job.id) ?? {
      ssWages: 0,
      medicareWages: 0,
      supplemental: 0,
    }
    perJob.set(job.id, totals)
    const gross = regular + bonus
    const limited: string[] = []

    // Employer HSA money counts toward the HSA limit first.
    const employer = job.employerContributions.map((contribution) => {
      let amount = ruleAmount(contribution, regular)
      if (contribution.type === "hsa") {
        const coverage =
          job.deductions.find((d) => d.type === "hsa")?.hsaCoverage ?? "self"
        amount = Math.max(0, Math.min(amount, limits.hsa(coverage) - used.hsa))
        used.hsa += amount
      }
      return { name: contribution.name, type: contribution.type, amount }
    })

    const lines = job.deductions.map((deduction) => {
      const base =
        deduction.mode === "percent"
          ? regular + (deduction.appliesToBonus ? bonus : 0)
          : 0
      let amount =
        deduction.mode === "percent"
          ? ruleAmount(deduction, base)
          : regular > 0
            ? deduction.value
            : 0
      const limit = DEDUCTION_TYPES[deduction.type].limit
      if (limit) {
        const cap =
          limit === "hsa" ? limits.hsa(deduction.hsaCoverage) : limits[limit]
        const room = Math.max(0, cap - used[limit])
        if (amount > room) {
          amount = room
          limited.push(deduction.name)
        }
        used[limit] += amount
      }
      return {
        deduction,
        line: { name: deduction.name, type: deduction.type, amount },
      }
    })
    const pretaxIncome = lines.filter(
      ({ deduction }) => treatmentOf(deduction) !== "posttax"
    )
    const pretaxAll = lines.filter(
      ({ deduction }) => treatmentOf(deduction) === "pretax_all"
    )
    const sum = (items: { line: PaycheckLine }[]) =>
      items.reduce((total, { line }) => total + line.amount, 0)

    // Split pre-tax deductions between regular pay and bonus to tax each part.
    const bonusShare = gross === 0 ? 0 : bonus / gross
    const incomeWages = Math.max(0, gross - sum(pretaxIncome))
    const regularIncomeWages = round(incomeWages * (1 - bonusShare))
    const bonusIncomeWages = incomeWages - regularIncomeWages

    const periods = PERIODS_PER_YEAR[job.schedule.kind]
    let federal =
      regular > 0
        ? federalWithholding(figures, job.w4, regularIncomeWages, periods)
        : 0
    if (bonusIncomeWages > 0) {
      const threshold = figures.supplementalHighThreshold * 100
      const normal = Math.max(
        0,
        Math.min(bonusIncomeWages, threshold - totals.supplemental)
      )
      federal += round(
        normal * figures.supplementalRate +
          (bonusIncomeWages - normal) * figures.supplementalHighRate
      )
      totals.supplemental += bonusIncomeWages
    }

    const ficaWages = Math.max(0, gross - sum(pretaxAll))
    const ssRoom = Math.max(
      0,
      figures.socialSecurityWageBase * 100 - totals.ssWages
    )
    const socialSecurity = round(
      Math.min(ficaWages, ssRoom) * figures.socialSecurityRate
    )
    totals.ssWages += Math.min(ficaWages, ssRoom)
    const medicareThreshold = figures.additionalMedicareThreshold * 100
    const overThreshold =
      Math.max(0, totals.medicareWages + ficaWages - medicareThreshold) -
      Math.max(0, totals.medicareWages - medicareThreshold)
    const medicare = round(
      ficaWages * figures.medicareRate +
        overThreshold * figures.additionalMedicareRate
    )
    totals.medicareWages += ficaWages

    const localTax = (setup: LocalTaxSetup | null) => {
      if (!setup) return 0
      const regularTax =
        regular > 0
          ? setup.mode === "percent"
            ? round((regularIncomeWages * setup.value) / 100)
            : setup.value
          : 0
      const bonusRate =
        setup.bonusPercent ?? (setup.mode === "percent" ? setup.value : 0)
      return regularTax + round((bonusIncomeWages * bonusRate) / 100)
    }
    const taxes = {
      federal,
      socialSecurity,
      medicare,
      state: localTax(job.stateTax),
      local: localTax(job.localTax),
    }

    const pretax = lines
      .filter(({ deduction }) => treatmentOf(deduction) !== "posttax")
      .map(({ line }) => line)
    const posttax = lines
      .filter(({ deduction }) => treatmentOf(deduction) === "posttax")
      .map(({ line }) => line)
    const withheld =
      pretax.reduce((t, l) => t + l.amount, 0) +
      posttax.reduce((t, l) => t + l.amount, 0) +
      Object.values(taxes).reduce((t, v) => t + v, 0)

    return {
      jobId: job.id,
      date,
      regular,
      bonus,
      gross,
      pretax,
      taxes,
      posttax,
      employer,
      net: gross - withheld,
      limited,
    }
  })

  return { year, taxTablesCurrent: current, paychecks }
}

/** A typical regular paycheck: the first of the year with no bonus and no limit reached. */
export function typicalPaycheck(
  result: YearResult,
  jobId: number
): Paycheck | undefined {
  const checks = result.paychecks.filter((p) => p.jobId === jobId)
  return (
    checks.find(
      (p) => p.bonus === 0 && p.regular > 0 && p.limited.length === 0
    ) ?? checks[0]
  )
}

export interface Split {
  accountId: number
  mode: "percent" | "amount"
  /** A percent of the deposit, or cents. */
  value: number
}

/**
 * Divides a deposit between accounts: splits apply in order, each capped at
 * what's left, and the rest goes to the main account.
 */
export function splitDeposit(
  net: number,
  mainAccountId: number | null,
  splits: Split[]
): { accountId: number | null; amount: number }[] {
  let left = net
  const parts = splits.map((split) => {
    const amount = Math.min(
      left,
      split.mode === "percent" ? round((net * split.value) / 100) : split.value
    )
    left -= amount
    return { accountId: split.accountId, amount }
  })
  return [{ accountId: mainAccountId, amount: left }, ...parts].filter(
    (part) => part.amount > 0
  )
}
