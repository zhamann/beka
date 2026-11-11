import { z } from "astro/zod"

import { toCents } from "@/lib/money"
import {
  DEDUCTION_TYPES,
  EMPLOYER_CONTRIBUTION_TYPES,
  type DeductionType,
  type EmployerContributionType,
} from "@/lib/paycheck/paycheck"
import {
  createJob,
  createOtherIncome,
  deleteJob,
  deleteOtherIncome,
  updateJob,
  updateOtherIncome,
} from "@/server/income"

import { op } from "./operation"
import { run } from "./run"
import { dollars, id, isoDate, percent } from "./schemas"

const day = z.number().int().min(1, "Choose a day.").max(31, "Choose a day.")

export const schedule = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["weekly", "biweekly"]), anchor: isoDate }),
  z.object({ kind: z.literal("semimonthly"), days: z.tuple([day, day]) }),
  z.object({ kind: z.literal("monthly"), day }),
  z.object({
    kind: z.literal("quarterly"),
    month: z.number().int().min(1).max(3),
    day,
  }),
  z.object({
    kind: z.literal("yearly"),
    month: z.number().int().min(1).max(12),
    day,
  }),
])

export const businessDayRule = z.enum(["previous", "next", "none"])

const money = dollars.min(0, "Enter 0 or more.")

/** A percent or a dollar amount; dollars become cents. */
const amountRule = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("percent"), value: percent }),
  z.object({ mode: z.literal("amount"), value: money }),
])

const toRule = <T extends z.infer<typeof amountRule>>(rule: T): T =>
  rule.mode === "amount" ? { ...rule, value: toCents(rule.value) } : rule

const localTax = z
  .object({
    mode: z.enum(["percent", "amount"]),
    value: money.max(1e7),
    bonusPercent: percent.nullable(),
  })
  .refine(
    (tax) => tax.mode === "amount" || tax.value <= 100,
    "Enter a percentage up to 100."
  )
  .nullable()

const toLocalTax = (tax: z.infer<typeof localTax>) =>
  tax && (tax.mode === "amount" ? { ...tax, value: toCents(tax.value) } : tax)

const deductionTypes = Object.keys(DEDUCTION_TYPES) as [
  DeductionType,
  ...DeductionType[],
]
const employerTypes = Object.keys(EMPLOYER_CONTRIBUTION_TYPES) as [
  EmployerContributionType,
  ...EmployerContributionType[],
]

export const jobInput = z.object({
  memberId: id,
  employer: z.string().trim().min(1, "Enter the employer.").max(100),
  pay: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("salary"),
      annual: money.positive("Enter the yearly salary."),
    }),
    z.object({
      type: z.literal("hourly"),
      rate: money.positive("Enter the hourly rate."),
      hoursPerPeriod: z
        .number({ error: "Enter hours per paycheck." })
        .min(0)
        .max(400),
      overtimeHours: z
        .number({ error: "Enter overtime hours, or 0." })
        .min(0)
        .max(400),
    }),
  ]),
  schedule: schedule.refine(
    (s) => s.kind !== "quarterly" && s.kind !== "yearly",
    "Paychecks come weekly, every two weeks, twice a month, or monthly."
  ),
  businessDayRule,
  w4: z.object({
    filingStatus: z.enum(["single", "married_jointly", "head_of_household"], {
      error: "Choose the filing status from Step 1(c) of the W-4.",
    }),
    multipleJobs: z.boolean(),
    dependentsAmount: money,
    otherIncome: money,
    deductions: money,
    extraWithholding: money,
  }),
  stateTax: localTax,
  localTax,
  deductions: z
    .array(
      z.intersection(
        amountRule,
        z.object({
          name: z.string().trim().min(1, "Name each deduction.").max(100),
          type: z.enum(deductionTypes),
          treatment: z.enum(["pretax_income", "pretax_all", "posttax"]),
          appliesToBonus: z.boolean(),
          hsaCoverage: z.enum(["self", "family"]),
        })
      )
    )
    .max(30),
  employerContributions: z
    .array(
      z.intersection(
        amountRule,
        z.object({
          name: z
            .string()
            .trim()
            .min(1, "Name each employer contribution.")
            .max(100),
          type: z.enum(employerTypes),
        })
      )
    )
    .max(10),
  bonus: z
    .object({
      mode: z.enum(["percent", "amount"]),
      value: money.positive("Enter the bonus."),
      schedule,
      withPaycheck: z.boolean(),
    })
    .nullable(),
  depositAccountId: id.nullable(),
  splits: z
    .array(
      z.intersection(
        z.discriminatedUnion("mode", [
          z.object({
            mode: z.literal("percent"),
            value: percent.positive("Enter more than 0."),
          }),
          z.object({
            mode: z.literal("amount"),
            value: money.positive("Enter more than 0."),
          }),
        ]),
        z.object({ accountId: id })
      )
    )
    .max(10),
})

export function toJobInput(input: z.infer<typeof jobInput>) {
  return {
    ...input,
    pay:
      input.pay.type === "salary"
        ? { type: "salary" as const, annual: toCents(input.pay.annual) }
        : { ...input.pay, rate: toCents(input.pay.rate) },
    w4: {
      ...input.w4,
      dependentsAmount: toCents(input.w4.dependentsAmount),
      otherIncome: toCents(input.w4.otherIncome),
      deductions: toCents(input.w4.deductions),
      extraWithholding: toCents(input.w4.extraWithholding),
    },
    stateTax: toLocalTax(input.stateTax),
    localTax: toLocalTax(input.localTax),
    deductions: input.deductions.map(toRule),
    employerContributions: input.employerContributions.map(toRule),
    bonus: input.bonus && {
      ...input.bonus,
      value:
        input.bonus.mode === "amount"
          ? toCents(input.bonus.value)
          : input.bonus.value,
    },
    splits: input.splits.map(toRule),
  }
}

export const otherIncomeInput = z.object({
  memberId: id,
  name: z.string().trim().min(1, "Enter a name.").max(100),
  amount: money.positive("Enter the amount deposited."),
  schedule,
  businessDayRule,
  taxable: z.boolean(),
  accountId: id.nullable(),
})

export const toOtherIncomeInput = (
  input: z.infer<typeof otherIncomeInput>
) => ({
  ...input,
  amount: toCents(input.amount),
})

export const income = {
  createJob: op({
    description:
      "Add a job paid through payroll, with its pay, schedule, Form W-4, taxes, deductions, bonus, and deposit accounts.",
    input: jobInput,
    handler: (input) => run((db) => createJob(db, toJobInput(input))),
  }),
  updateJob: op({
    description: "Replace a job's settings.",
    input: jobInput.extend({ id }),
    handler: ({ id, ...input }) =>
      run((db) => updateJob(db, id, toJobInput(input))),
  }),
  deleteJob: op({
    description: "Remove a job.",
    input: z.object({ id }),
    handler: ({ id }) => run((db) => deleteJob(db, id)),
  }),
  createOtherIncome: op({
    description:
      "Add income outside payroll (a pension, rent, child support), entered as the amount deposited.",
    input: otherIncomeInput,
    handler: (input) =>
      run((db) => createOtherIncome(db, toOtherIncomeInput(input))),
  }),
  updateOtherIncome: op({
    description: "Change income outside payroll.",
    input: otherIncomeInput.extend({ id }),
    handler: ({ id, ...input }) =>
      run((db) => updateOtherIncome(db, id, toOtherIncomeInput(input))),
  }),
  deleteOtherIncome: op({
    description: "Remove income outside payroll.",
    input: z.object({ id }),
    handler: ({ id }) => run((db) => deleteOtherIncome(db, id)),
  }),
}
