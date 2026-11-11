import { describe, expect, it } from "vitest"

import {
  simulateYear,
  splitDeposit,
  typicalPaycheck,
  type DeductionSetup,
  type JobSetup,
} from "./paycheck"
import { bankHolidays, nextPayDate, payDates } from "./schedule"
import { taxYear } from "./tax-years"

const job = (overrides: Partial<JobSetup> = {}): JobSetup => ({
  id: 1,
  memberId: 1,
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
  ...overrides,
})

const deduction = (overrides: Partial<DeductionSetup>): DeductionSetup => ({
  name: "401(k)",
  type: "traditional_401k",
  treatment: "pretax_income",
  mode: "percent",
  value: 6,
  appliesToBonus: true,
  hsaCoverage: "self",
  ...overrides,
})

const first = (setup: JobSetup, birthYear: number | null = null) =>
  simulateYear([setup], birthYear, 2026).paychecks[0]

describe("pay dates", () => {
  it("moves twice-monthly paydays to the previous business day", () => {
    const dates = payDates(
      { kind: "semimonthly", days: [15, 31] },
      "previous",
      2026
    )
    expect(dates).toHaveLength(24)
    // Dates the export shows deposits on.
    for (const date of [
      "2026-01-30",
      "2026-02-13",
      "2026-03-13",
      "2026-05-29",
      "2026-08-14",
      "2026-10-30",
    ]) {
      expect(dates).toContain(date)
    }
  })

  it("lands monthly pension payments on the last business day", () => {
    const dates = payDates({ kind: "monthly", day: 31 }, "previous", 2026)
    expect(dates.slice(6, 10)).toEqual([
      "2026-07-31",
      "2026-08-31",
      "2026-09-30",
      "2026-10-30",
    ])
  })

  it("counts biweekly paydays from any known one", () => {
    const dates = payDates(
      { kind: "biweekly", anchor: "2026-10-30" },
      "previous",
      2026
    )
    expect(dates).toHaveLength(26)
    expect(dates[0]).toBe("2026-01-09")
    expect(
      nextPayDate(
        { kind: "biweekly", anchor: "2026-10-30" },
        "previous",
        "2026-11-06"
      )
    ).toBe("2026-11-13")
  })

  it("knows bank holidays, moving Sunday ones to Monday", () => {
    const holidays = bankHolidays(2026)
    for (const date of [
      "2026-01-01",
      "2026-01-19",
      "2026-05-25",
      "2026-09-07",
      "2026-11-26",
      "2026-12-25",
    ]) {
      expect(holidays).toContain(date)
    }
    // July 4, 2026 is a Saturday and isn't moved.
    expect(holidays).not.toContain("2026-07-03")
    // July 4, 2027 is a Sunday, observed Monday.
    expect(bankHolidays(2027)).toContain("2027-07-05")
  })

  it("pays quarterly bonuses on the last day of each quarter's first month", () => {
    expect(
      payDates({ kind: "quarterly", month: 1, day: 31 }, "previous", 2026)
    ).toEqual(["2026-01-30", "2026-04-30", "2026-07-31", "2026-10-30"])
  })
})

describe("paychecks", () => {
  it("withholds federal tax with the 2026 percentage method", () => {
    expect(first(job())).toMatchObject({
      gross: 2_500_00,
      // ($60,000 − $8,600) in the 12% row: $1,240 + 12% × $31,500 = $5,020 ÷ 24
      taxes: {
        federal: 209_17,
        socialSecurity: 155_00,
        medicare: 36_25,
        state: 0,
        local: 0,
      },
      net: 2_099_58,
    })
  })

  it("takes pre-tax deductions before the right taxes", () => {
    const check = first(
      job({
        pay: { type: "salary", annual: 120_000_00 },
        w4: { ...job().w4, filingStatus: "married_jointly" },
        deductions: [
          deduction({}),
          deduction({
            name: "Medical",
            type: "medical",
            mode: "amount",
            value: 100_00,
          }),
        ],
        stateTax: { mode: "percent", value: 4, bonusPercent: null },
      })
    )
    // Income tax wages $4,600: ($110,400 − $12,900) → $2,480 + 12% × $53,400 = $8,888 ÷ 24
    expect(check.taxes).toEqual({
      federal: 370_33,
      socialSecurity: 303_80,
      medicare: 71_05,
      state: 184_00,
      local: 0,
    })
    expect(check.net).toBe(
      5_000_00 - 300_00 - 100_00 - 370_33 - 303_80 - 71_05 - 184_00
    )
  })

  it("stops 401(k) deferrals at the yearly limit, raised by catch-up ages", () => {
    const setup = job({
      pay: { type: "salary", annual: 120_000_00 },
      deductions: [deduction({ value: 50 })],
    })
    const total = (birthYear: number | null) =>
      simulateYear([setup], birthYear, 2026).paychecks.reduce(
        (sum, p) => sum + p.pretax[0].amount,
        0
      )
    expect(total(null)).toBe(24_500_00)
    expect(total(1975)).toBe(32_500_00)
    expect(total(1965)).toBe(35_750_00)
    const checks = simulateYear([setup], null, 2026).paychecks
    expect(checks[9]).toMatchObject({
      pretax: [{ amount: 2_000_00 }],
      limited: ["401(k)"],
    })
    expect(checks[10].pretax[0].amount).toBe(0)
  })

  it("shares the 401(k) limit across a person's jobs", () => {
    const a = job({
      id: 1,
      pay: { type: "salary", annual: 120_000_00 },
      deductions: [deduction({ value: 50 })],
    })
    const b = job({
      id: 2,
      pay: { type: "salary", annual: 120_000_00 },
      deductions: [deduction({ value: 50 })],
    })
    const total = simulateYear([a, b], null, 2026).paychecks.reduce(
      (sum, p) => sum + p.pretax[0].amount,
      0
    )
    expect(total).toBe(24_500_00)
  })

  it("counts employer HSA money toward the HSA limit", () => {
    const result = simulateYear(
      [
        job({
          deductions: [
            deduction({
              name: "HSA",
              type: "hsa",
              mode: "amount",
              value: 200_00,
              hsaCoverage: "self",
            }),
          ],
          employerContributions: [
            { name: "Employer HSA", type: "hsa", mode: "amount", value: 50_00 },
          ],
        }),
      ],
      null,
      2026
    )
    const employee = result.paychecks.reduce(
      (sum, p) => sum + p.pretax[0].amount,
      0
    )
    const employer = result.paychecks.reduce(
      (sum, p) => sum + p.employer[0].amount,
      0
    )
    // Employer money goes in first each check, so it keeps flowing as the limit nears.
    expect(employer).toBe(18 * 50_00)
    expect(employee + employer).toBe(4_400_00)
  })

  it("stops Social Security at the wage base and adds Medicare over $200,000", () => {
    const checks = simulateYear(
      [job({ pay: { type: "salary", annual: 480_000_00 } })],
      null,
      2026
    ).paychecks
    const ss = checks.reduce((sum, p) => sum + p.taxes.socialSecurity, 0)
    expect(ss).toBe(Math.round(184_500_00 * 0.062))
    const medicare = checks.reduce((sum, p) => sum + p.taxes.medicare, 0)
    expect(medicare).toBe(Math.round(480_000_00 * 0.0145 + 280_000_00 * 0.009))
  })

  it("withholds 22% on a bonus paid with a paycheck", () => {
    const result = simulateYear(
      [
        job({
          deductions: [deduction({ value: 10 })],
          bonus: {
            mode: "amount",
            value: 1_000_00,
            schedule: { kind: "quarterly", month: 1, day: 31 },
            withPaycheck: true,
          },
        }),
      ],
      null,
      2026
    )
    const january = result.paychecks.filter((p) => p.date.startsWith("2026-01"))
    expect(january).toHaveLength(2)
    const [regular, withBonus] = january
    expect(withBonus).toMatchObject({ regular: 2_500_00, bonus: 1_000_00 })
    // The bonus adds $100 of 401(k), 22% on the other $900, and 7.65% payroll tax.
    expect(withBonus.pretax[0].amount - regular.pretax[0].amount).toBe(100_00)
    expect(withBonus.taxes.federal - regular.taxes.federal).toBe(198_00)
    expect(withBonus.net - regular.net).toBe(
      1_000_00 - 100_00 - 198_00 - 62_00 - 14_50
    )
    expect(typicalPaycheck(result, 1)).toBe(regular)
  })

  it("pays hourly wages for regular and overtime hours", () => {
    expect(
      first(
        job({
          pay: {
            type: "hourly",
            rate: 25_00,
            hoursPerPeriod: 80,
            overtimeHours: 4,
          },
          schedule: { kind: "biweekly", anchor: "2026-01-09" },
        })
      ).gross
    ).toBe(2_150_00)
  })

  it("reduces withholding for dependents and adds extra withholding", () => {
    const base = first(job()).taxes.federal
    const adjusted = first(
      job({
        w4: {
          ...job().w4,
          dependentsAmount: 2_400_00,
          extraWithholding: 25_00,
        },
      })
    ).taxes.federal
    expect(adjusted).toBe(base - 100_00 + 25_00)
  })

  it("uses the latest tables for years it doesn't have yet", () => {
    expect(taxYear(2027)).toMatchObject({
      current: false,
      figures: { year: 2026 },
    })
    expect(simulateYear([job()], null, 2027).taxTablesCurrent).toBe(false)
  })
})

describe("deposit splits", () => {
  it("sends fixed and percent splits out first, the rest to the main account", () => {
    expect(
      splitDeposit(2_000_00, 1, [
        { accountId: 2, mode: "amount", value: 500_00 },
        { accountId: 3, mode: "percent", value: 10 },
      ])
    ).toEqual([
      { accountId: 1, amount: 1_300_00 },
      { accountId: 2, amount: 500_00 },
      { accountId: 3, amount: 200_00 },
    ])
    expect(
      splitDeposit(100_00, 1, [{ accountId: 2, mode: "amount", value: 500_00 }])
    ).toEqual([{ accountId: 2, amount: 100_00 }])
  })
})
