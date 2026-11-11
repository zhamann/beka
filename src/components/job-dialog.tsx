import {
  IconChevronDown,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react"
import { actions } from "astro:actions"
import { useId, useState, type ReactElement } from "react"

import {
  AmountRuleInput,
  draftNumber,
  type AmountDraft,
} from "@/components/amount-rule-input"
import { ConfirmDelete } from "@/components/confirm-delete"
import { FormDialog, resetOnClose } from "@/components/form-dialog"
import { MoneyInput } from "@/components/form-fields"
import {
  BUSINESS_DAY_RULES,
  fromDraft,
  ScheduleFields,
  toDraft,
  type ScheduleDraft,
} from "@/components/schedule-fields"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { centsToInput } from "@/lib/money"
import {
  DEDUCTION_TYPES,
  EMPLOYER_CONTRIBUTION_TYPES,
  type DeductionType,
  type EmployerContributionType,
  type TaxTreatment,
} from "@/lib/paycheck/paycheck"
import type { BusinessDayRule } from "@/lib/paycheck/schedule"
import type { FilingStatus } from "@/lib/paycheck/tax-years"
import type { Account } from "@/server/accounts"
import type { Member } from "@/server/household"
import type { Job } from "@/server/income"

let nextKey = 0

const FILING_LABELS: Record<FilingStatus, string> = {
  married_jointly: "Married filing jointly",
  single: "Single or married filing separately",
  head_of_household: "Head of household",
}

interface DeductionDraft extends AmountDraft {
  key: number
  name: string
  type: DeductionType
  treatment: TaxTreatment
  appliesToBonus: boolean
  hsaCoverage: "self" | "family"
}

interface ContributionDraft extends AmountDraft {
  key: number
  name: string
  type: EmployerContributionType
}

interface SplitDraft extends AmountDraft {
  key: number
  accountId: string
}

interface TaxDraft {
  mode: "none" | "percent" | "amount"
  value: string
  bonusPercent: string
}

const amountDraft = (
  mode: "percent" | "amount",
  value: number
): AmountDraft => ({
  mode,
  value: mode === "amount" ? centsToInput(value) : String(value),
})

const taxDraft = (tax: Job["stateTax"]): TaxDraft =>
  tax
    ? {
        mode: tax.mode,
        value:
          tax.mode === "amount" ? centsToInput(tax.value) : String(tax.value),
        bonusPercent: tax.bonusPercent === null ? "" : String(tax.bonusPercent),
      }
    : { mode: "none", value: "", bonusPercent: "" }

const fromTax = (tax: TaxDraft) =>
  tax.mode === "none"
    ? null
    : {
        mode: tax.mode,
        value: draftNumber(tax.value),
        bonusPercent:
          tax.bonusPercent.trim() === "" ? null : draftNumber(tax.bonusPercent),
      }

/** A dollar amount as typed, rewritten like "1,234.50" when it's a number. */
const dollars = (value: string) => {
  const raw = value.replace(/[$,\s]/g, "")
  return raw !== "" && Number.isFinite(Number(raw))
    ? Number(raw).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : value
}

const toDollars = (value: string) =>
  value.trim() === "" ? 0 : draftNumber(value)
const fromRule = <T extends AmountDraft>({ mode, value }: T) => ({
  mode,
  value: draftNumber(value),
})

function TaxFields({
  label,
  name,
  value,
  onChange,
}: {
  label: string
  /** The form path errors use, like "stateTax". */
  name: string
  value: TaxDraft
  onChange: (tax: TaxDraft) => void
}) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="grid items-end gap-2 sm:grid-cols-[10rem_1fr_1fr]">
        <NativeSelect
          id={id}
          className="w-full"
          value={value.mode}
          onChange={(event) =>
            onChange({ ...value, mode: event.target.value as TaxDraft["mode"] })
          }
        >
          <NativeSelectOption value="none">None</NativeSelectOption>
          <NativeSelectOption value="percent">
            % of taxable pay
          </NativeSelectOption>
          <NativeSelectOption value="amount">$ a check</NativeSelectOption>
        </NativeSelect>
        {value.mode !== "none" && (
          <>
            <Field>
              <FieldLabel htmlFor={`${id}-value`} className="text-sm">
                {value.mode === "percent" ? "Rate (%)" : "Amount ($)"}
              </FieldLabel>
              <Input
                id={`${id}-value`}
                name={`${name}.value`}
                inputMode="decimal"
                placeholder={value.mode === "percent" ? "4.7" : "0.00"}
                value={value.value}
                onChange={(event) =>
                  onChange({ ...value, value: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-bonus`} className="text-sm">
                On bonuses (%, optional)
              </FieldLabel>
              <Input
                id={`${id}-bonus`}
                inputMode="decimal"
                placeholder="Same rate"
                value={value.bonusPercent}
                onChange={(event) =>
                  onChange({ ...value, bonusPercent: event.target.value })
                }
              />
            </Field>
          </>
        )}
      </div>
    </Field>
  )
}

function RowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="self-start justify-self-start"
      onClick={onClick}
    >
      <IconPlus />
      {label}
    </Button>
  )
}

/**
 * A part of the form that can fold away, showing a one-line summary of what
 * it holds. It starts open when it holds anything beyond the defaults.
 */
function FoldSection({
  title,
  summary,
  defaultOpen,
  children,
}: {
  title: string
  summary: string
  defaultOpen: boolean
  children: React.ReactNode
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="flex flex-col gap-4">
      <CollapsibleTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="group/fold h-auto justify-between gap-4 rounded-xl bg-muted/60 px-3 py-2.5 text-left whitespace-normal"
          />
        }
      >
        <span className="flex flex-col">
          <span className="text-base font-medium">{title}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {summary}
          </span>
        </span>
        <IconChevronDown className="shrink-0 transition-transform group-data-[panel-open]/fold:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent
        keepMounted
        className="flex flex-col gap-4 data-[closed]:hidden"
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

function RemoveButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={onClick}
    >
      <IconX />
    </Button>
  )
}

/** Adds a job paid through payroll, or edits `job`. */
function JobDialogForm({
  job,
  members,
  accounts,
  trigger,
  onClosed,
}: {
  job?: Job
  members: Member[]
  /** Accounts a paycheck can be deposited to. */
  accounts: Account[]
  trigger: ReactElement
  onClosed: () => void
}) {
  const ids = useId()
  const [memberId, setMemberId] = useState(
    String(job?.memberId ?? members[0]?.id ?? "")
  )
  const [employer, setEmployer] = useState(job?.employer ?? "")
  const [payType, setPayType] = useState(job?.pay.type ?? "salary")
  const [annual, setAnnual] = useState(
    job?.pay.type === "salary" ? dollars(centsToInput(job.pay.annual)) : ""
  )
  const [rate, setRate] = useState(
    job?.pay.type === "hourly" ? dollars(centsToInput(job.pay.rate)) : ""
  )
  const [hours, setHours] = useState(
    job?.pay.type === "hourly" ? String(job.pay.hoursPerPeriod) : "80"
  )
  const [overtime, setOvertime] = useState(
    job?.pay.type === "hourly" ? String(job.pay.overtimeHours) : "0"
  )
  const [schedule, setSchedule] = useState<ScheduleDraft>(() =>
    toDraft(job?.schedule, "semimonthly")
  )
  const [rule, setRule] = useState<BusinessDayRule>(
    job?.businessDayRule ?? "previous"
  )
  // A new job asks for its filing status rather than assuming one.
  const [filingStatus, setFilingStatus] = useState<FilingStatus | "">(
    job?.w4.filingStatus ?? ""
  )
  const [multipleJobs, setMultipleJobs] = useState(
    job?.w4.multipleJobs ?? false
  )
  const [dependents, setDependents] = useState(
    dollars(centsToInput(job?.w4.dependentsAmount || null))
  )
  const [otherIncome, setOtherIncome] = useState(
    dollars(centsToInput(job?.w4.otherIncome || null))
  )
  const [w4Deductions, setW4Deductions] = useState(
    dollars(centsToInput(job?.w4.deductions || null))
  )
  const [extra, setExtra] = useState(
    dollars(centsToInput(job?.w4.extraWithholding || null))
  )
  const [stateTax, setStateTax] = useState(() =>
    taxDraft(job?.stateTax ?? null)
  )
  const [localTax, setLocalTax] = useState(() =>
    taxDraft(job?.localTax ?? null)
  )
  const [deductions, setDeductions] = useState<DeductionDraft[]>(
    () =>
      job?.deductions.map((d) => ({
        ...amountDraft(d.mode, d.value),
        key: nextKey++,
        name: d.name,
        type: d.type,
        treatment: d.treatment,
        appliesToBonus: d.appliesToBonus,
        hsaCoverage: d.hsaCoverage,
      })) ?? []
  )
  const [contributions, setContributions] = useState<ContributionDraft[]>(
    () =>
      job?.employerContributions.map((c) => ({
        ...amountDraft(c.mode, c.value),
        key: nextKey++,
        name: c.name,
        type: c.type,
      })) ?? []
  )
  const [hasBonus, setHasBonus] = useState(Boolean(job?.bonus))
  const [bonus, setBonus] = useState<AmountDraft>(() =>
    job?.bonus
      ? {
          mode: job.bonus.mode,
          value:
            job.bonus.mode === "amount"
              ? centsToInput(job.bonus.value)
              : String(job.bonus.value),
        }
      : { mode: "amount", value: "" }
  )
  const [bonusSchedule, setBonusSchedule] = useState<ScheduleDraft>(() =>
    toDraft(job?.bonus?.schedule, "quarterly")
  )
  const [bonusWithPaycheck, setBonusWithPaycheck] = useState(
    job?.bonus?.withPaycheck ?? false
  )
  const [depositAccountId, setDepositAccountId] = useState(
    String(job?.depositAccountId ?? "")
  )
  const [splits, setSplits] = useState<SplitDraft[]>(
    () =>
      job?.splits.map((s) => ({
        ...amountDraft(s.mode, s.value),
        key: nextKey++,
        accountId: String(s.accountId),
      })) ?? []
  )

  const update = <T extends { key: number }>(
    set: (fn: (rows: T[]) => T[]) => void,
    key: number,
    change: Partial<T>
  ) =>
    set((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...change } : row))
    )
  const remove = <T extends { key: number }>(
    set: (fn: (rows: T[]) => T[]) => void,
    key: number
  ) => set((rows) => rows.filter((row) => row.key !== key))

  function payload() {
    return {
      memberId: Number(memberId),
      employer,
      pay:
        payType === "salary"
          ? { type: "salary" as const, annual: draftNumber(annual) }
          : {
              type: "hourly" as const,
              rate: draftNumber(rate),
              hoursPerPeriod: draftNumber(hours),
              overtimeHours: toDollars(overtime),
            },
      schedule: fromDraft(schedule),
      businessDayRule: rule,
      w4: {
        filingStatus: filingStatus as FilingStatus,
        multipleJobs,
        dependentsAmount: toDollars(dependents),
        otherIncome: toDollars(otherIncome),
        deductions: toDollars(w4Deductions),
        extraWithholding: toDollars(extra),
      },
      stateTax: fromTax(stateTax),
      localTax: fromTax(localTax),
      deductions: deductions.map((d) => ({
        ...fromRule(d),
        name: d.name,
        type: d.type,
        treatment: d.treatment,
        appliesToBonus: d.appliesToBonus,
        hsaCoverage: d.hsaCoverage,
      })),
      employerContributions: contributions.map((c) => ({
        ...fromRule(c),
        name: c.name,
        type: c.type,
      })),
      bonus: hasBonus
        ? {
            ...fromRule(bonus),
            schedule: fromDraft(bonusSchedule),
            withPaycheck: bonusWithPaycheck,
          }
        : null,
      depositAccountId:
        depositAccountId === "" ? null : Number(depositAccountId),
      splits: splits.map((s) => ({
        ...fromRule(s),
        accountId: Number(s.accountId),
      })),
    }
  }

  const w4Adjusted =
    multipleJobs ||
    [dependents, otherIncome, w4Deductions, extra].some(
      (value) => value.trim() !== ""
    )
  const w4Summary = [
    filingStatus ? FILING_LABELS[filingStatus] : "Filing status not chosen",
    multipleJobs && "Step 2 checked",
    w4Adjusted && !multipleJobs && "with adjustments",
  ]
    .filter(Boolean)
    .join(", ")
  const taxSummary =
    [
      stateTax.mode !== "none" && "State tax",
      localTax.mode !== "none" && "local tax",
    ]
      .filter(Boolean)
      .join(" and ") || "None"
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`
  const deductionSummary =
    deductions.length + contributions.length === 0
      ? "None"
      : [
          deductions.length > 0 && plural(deductions.length, "deduction"),
          contributions.length > 0 &&
            plural(contributions.length, "employer contribution"),
        ]
          .filter(Boolean)
          .join(", ")

  const accountOptions = accounts.map((account) => (
    <NativeSelectOption key={account.id} value={account.id}>
      {account.name}
    </NativeSelectOption>
  ))

  return (
    <FormDialog
      onClosed={onClosed}
      wide
      inlineErrors={false}
      title={job ? `Edit ${job.employer}` : "Add a job"}
      description="Enter it the way your paystub and Form W-4 show it."
      trigger={trigger}
      submitLabel={job ? "Save" : "Add job"}
      onSubmit={() =>
        job
          ? actions.updateJob({ id: job.id, ...payload() })
          : actions.createJob(payload())
      }
      footer={
        job && (
          <ConfirmDelete
            title={`Remove ${job.employer}?`}
            description="Its paychecks disappear from Income and the Dashboard."
            onConfirm={() => actions.deleteJob({ id: job.id })}
            trigger={
              <Button variant="destructive" className="sm:mr-auto">
                <IconTrash />
                Remove
              </Button>
            }
          />
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${ids}-member`}>Person</FieldLabel>
          <NativeSelect
            id={`${ids}-member`}
            name="memberId"
            className="w-full"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
          >
            {members.map((member) => (
              <NativeSelectOption key={member.id} value={member.id}>
                {member.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${ids}-employer`}>Employer</FieldLabel>
          <Input
            id={`${ids}-employer`}
            name="employer"
            value={employer}
            onChange={(e) => setEmployer(e.target.value)}
          />
        </Field>
      </div>

      <FieldSet>
        <FieldLegend>Pay</FieldLegend>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field>
            <FieldLabel htmlFor={`${ids}-type`}>Pay type</FieldLabel>
            <NativeSelect
              id={`${ids}-type`}
              className="w-full"
              value={payType}
              onChange={(e) =>
                setPayType(e.target.value as "salary" | "hourly")
              }
            >
              <NativeSelectOption value="salary">Salary</NativeSelectOption>
              <NativeSelectOption value="hourly">Hourly</NativeSelectOption>
            </NativeSelect>
          </Field>
          {payType === "salary" ? (
            <Field className="sm:col-span-3">
              <FieldLabel htmlFor={`${ids}-annual`}>Yearly salary</FieldLabel>
              <MoneyInput
                id={`${ids}-annual`}
                name="pay.annual"
                onBlur={(e) => setAnnual(dollars(e.target.value))}
                value={annual}
                onChange={(e) => setAnnual(e.target.value)}
              />
            </Field>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor={`${ids}-rate`}>Hourly rate</FieldLabel>
                <MoneyInput
                  id={`${ids}-rate`}
                  name="pay.rate"
                  onBlur={(e) => setRate(dollars(e.target.value))}
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${ids}-hours`}>
                  Hours a paycheck
                </FieldLabel>
                <Input
                  id={`${ids}-hours`}
                  name="pay.hoursPerPeriod"
                  inputMode="decimal"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${ids}-ot`}>Overtime hours</FieldLabel>
                <Input
                  id={`${ids}-ot`}
                  name="pay.overtimeHours"
                  inputMode="decimal"
                  value={overtime}
                  onChange={(e) => setOvertime(e.target.value)}
                />
              </Field>
            </>
          )}
        </div>
        <ScheduleFields
          label="How often"
          value={schedule}
          onChange={setSchedule}
          kinds={["weekly", "biweekly", "semimonthly", "monthly"]}
        />
        <Field>
          <FieldLabel htmlFor={`${ids}-rule`}>
            Paydays on weekends and bank holidays
          </FieldLabel>
          <NativeSelect
            id={`${ids}-rule`}
            className="w-full"
            value={rule}
            onChange={(e) => setRule(e.target.value as BusinessDayRule)}
          >
            {BUSINESS_DAY_RULES.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </FieldSet>

      <FoldSection
        title="Form W-4"
        summary={w4Summary}
        defaultOpen={w4Adjusted || !job}
      >
        <FieldDescription>
          The filing status is required. Fill in the other steps only if your
          W-4 does; a blank amount counts as zero.
        </FieldDescription>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${ids}-filing`}>
              Step 1(c): filing status
            </FieldLabel>
            <NativeSelect
              id={`${ids}-filing`}
              className="w-full"
              name="w4.filingStatus"
              value={filingStatus}
              onChange={(e) => setFilingStatus(e.target.value as FilingStatus)}
            >
              <NativeSelectOption value="" disabled>
                Choose from your W-4
              </NativeSelectOption>
              <NativeSelectOption value="married_jointly">
                Married filing jointly
              </NativeSelectOption>
              <NativeSelectOption value="single">
                Single or married filing separately
              </NativeSelectOption>
              <NativeSelectOption value="head_of_household">
                Head of household
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field orientation="horizontal" className="self-end">
            <Switch
              id={`${ids}-step2`}
              aria-labelledby={`${ids}-step2-label`}
              checked={multipleJobs}
              onCheckedChange={setMultipleJobs}
            />
            <FieldContent>
              <FieldLabel htmlFor={`${ids}-step2`} id={`${ids}-step2-label`}>
                Step 2 box checked
              </FieldLabel>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-dependents`}>
              Step 3: dependents (yearly $)
            </FieldLabel>
            <MoneyInput
              id={`${ids}-dependents`}
              name="w4.dependentsAmount"
              onBlur={(e) => setDependents(dollars(e.target.value))}
              value={dependents}
              onChange={(e) => setDependents(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-4a`}>
              Step 4(a): other income (yearly $)
            </FieldLabel>
            <MoneyInput
              id={`${ids}-4a`}
              name="w4.otherIncome"
              onBlur={(e) => setOtherIncome(dollars(e.target.value))}
              value={otherIncome}
              onChange={(e) => setOtherIncome(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-4b`}>
              Step 4(b): deductions (yearly $)
            </FieldLabel>
            <MoneyInput
              id={`${ids}-4b`}
              name="w4.deductions"
              onBlur={(e) => setW4Deductions(dollars(e.target.value))}
              value={w4Deductions}
              onChange={(e) => setW4Deductions(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-4c`}>
              Step 4(c): extra withholding ($ a check)
            </FieldLabel>
            <MoneyInput
              id={`${ids}-4c`}
              name="w4.extraWithholding"
              onBlur={(e) => setExtra(dollars(e.target.value))}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
          </Field>
        </div>
      </FoldSection>

      <FoldSection
        title="State and local tax"
        summary={taxSummary}
        defaultOpen={stateTax.mode !== "none" || localTax.mode !== "none"}
      >
        <FieldDescription>
          Your paystub's rate, applied to pay after pre-tax deductions. A bonus
          % is optional.
        </FieldDescription>
        <TaxFields
          label="State"
          name="stateTax"
          value={stateTax}
          onChange={setStateTax}
        />
        <TaxFields
          label="Local"
          name="localTax"
          value={localTax}
          onChange={setLocalTax}
        />
      </FoldSection>

      <FoldSection
        title="Deductions"
        summary={deductionSummary}
        defaultOpen={deductions.length + contributions.length > 0}
      >
        <FieldDescription>
          Retirement, HSA, insurance premiums, and anything else taken out of
          each check.
        </FieldDescription>
        {deductions.map((d, index) => (
          <div key={d.key} className="grid gap-2 rounded-lg border p-3">
            <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <NativeSelect
                aria-label="Type"
                className="w-full"
                value={d.type}
                onChange={(e) => {
                  const type = e.target.value as DeductionType
                  const preset = DEDUCTION_TYPES[type]
                  update(setDeductions, d.key, {
                    type,
                    name:
                      d.name && d.name !== DEDUCTION_TYPES[d.type].label
                        ? d.name
                        : preset.label,
                    appliesToBonus: preset.limit !== null,
                  })
                }}
              >
                {(Object.keys(DEDUCTION_TYPES) as DeductionType[]).map(
                  (type) => (
                    <NativeSelectOption key={type} value={type}>
                      {DEDUCTION_TYPES[type].label}
                    </NativeSelectOption>
                  )
                )}
              </NativeSelect>
              <Input
                aria-label="Name"
                className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"
                placeholder="Name on your paystub"
                name={`deductions.${index}.name`}
                value={d.name}
                onChange={(e) =>
                  update(setDeductions, d.key, { name: e.target.value })
                }
              />
              <RemoveButton
                label="Remove deduction"
                onClick={() => remove(setDeductions, d.key)}
              />
            </div>
            <AmountRuleInput
              label="Amount"
              name={`deductions.${index}.value`}
              value={d}
              onChange={(rule) => update(setDeductions, d.key, rule)}
            />
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {d.type === "other" && (
                <NativeSelect
                  aria-label="Taxed"
                  value={d.treatment}
                  onChange={(e) =>
                    update(setDeductions, d.key, {
                      treatment: e.target.value as TaxTreatment,
                    })
                  }
                >
                  <NativeSelectOption value="pretax_income">
                    Before income tax
                  </NativeSelectOption>
                  <NativeSelectOption value="pretax_all">
                    Before income and payroll tax
                  </NativeSelectOption>
                  <NativeSelectOption value="posttax">
                    After taxes
                  </NativeSelectOption>
                </NativeSelect>
              )}
              {d.type === "hsa" && (
                <NativeSelect
                  aria-label="HSA coverage"
                  value={d.hsaCoverage}
                  onChange={(e) =>
                    update(setDeductions, d.key, {
                      hsaCoverage: e.target.value as "self" | "family",
                    })
                  }
                >
                  <NativeSelectOption value="self">
                    Self-only coverage
                  </NativeSelectOption>
                  <NativeSelectOption value="family">
                    Family coverage
                  </NativeSelectOption>
                </NativeSelect>
              )}
              {d.mode === "percent" && hasBonus && (
                <Field orientation="horizontal" className="w-auto">
                  <Switch
                    id={`${ids}-bonus-${d.key}`}
                    aria-labelledby={`${ids}-bonus-${d.key}-label`}
                    checked={d.appliesToBonus}
                    onCheckedChange={(appliesToBonus) =>
                      update(setDeductions, d.key, { appliesToBonus })
                    }
                  />
                  <FieldLabel
                    htmlFor={`${ids}-bonus-${d.key}`}
                    id={`${ids}-bonus-${d.key}-label`}
                  >
                    Also from bonuses
                  </FieldLabel>
                </Field>
              )}
            </div>
          </div>
        ))}
        <RowButton
          label="Add deduction"
          onClick={() =>
            setDeductions((rows) => [
              ...rows,
              {
                key: nextKey++,
                name: DEDUCTION_TYPES.traditional_401k.label,
                type: "traditional_401k",
                treatment: "pretax_income",
                mode: "percent",
                value: "",
                appliesToBonus: true,
                hsaCoverage: "self",
              },
            ])
          }
        />
        <Field>
          <FieldLabel>Employer contributions</FieldLabel>
          <FieldDescription>
            Money your employer adds, like a 401(k) match. It isn't part of the
            deposit.
          </FieldDescription>
          {contributions.map((c, index) => (
            <div
              key={c.key}
              className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <NativeSelect
                aria-label="Type"
                className="w-full"
                value={c.type}
                onChange={(e) => {
                  const type = e.target.value as EmployerContributionType
                  update(setContributions, c.key, {
                    type,
                    name:
                      c.name && c.name !== EMPLOYER_CONTRIBUTION_TYPES[c.type]
                        ? c.name
                        : EMPLOYER_CONTRIBUTION_TYPES[type],
                  })
                }}
              >
                {(
                  Object.keys(
                    EMPLOYER_CONTRIBUTION_TYPES
                  ) as EmployerContributionType[]
                ).map((type) => (
                  <NativeSelectOption key={type} value={type}>
                    {EMPLOYER_CONTRIBUTION_TYPES[type]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Input
                aria-label="Name"
                className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"
                value={c.name}
                onChange={(e) =>
                  update(setContributions, c.key, { name: e.target.value })
                }
              />
              <RemoveButton
                label="Remove contribution"
                onClick={() => remove(setContributions, c.key)}
              />
              <div className="col-span-2 sm:col-span-3">
                <AmountRuleInput
                  label="Amount"
                  name={`employerContributions.${index}.value`}
                  value={c}
                  onChange={(rule) => update(setContributions, c.key, rule)}
                />
              </div>
            </div>
          ))}
          <RowButton
            label="Add employer contribution"
            onClick={() =>
              setContributions((rows) => [
                ...rows,
                {
                  key: nextKey++,
                  name: EMPLOYER_CONTRIBUTION_TYPES.retirement_match,
                  type: "retirement_match",
                  mode: "percent",
                  value: "",
                },
              ])
            }
          />
        </Field>
      </FoldSection>

      <FoldSection
        title="Bonus"
        summary={hasBonus ? "Pays a regular bonus" : "No bonus"}
        defaultOpen={hasBonus}
      >
        <Field orientation="horizontal">
          <Switch
            id={`${ids}-has-bonus`}
            aria-labelledby={`${ids}-has-bonus-label`}
            checked={hasBonus}
            onCheckedChange={setHasBonus}
          />
          <FieldLabel
            htmlFor={`${ids}-has-bonus`}
            id={`${ids}-has-bonus-label`}
          >
            This job pays a regular bonus
          </FieldLabel>
        </Field>
        {hasBonus && (
          <>
            <AmountRuleInput
              label="Bonus each payout"
              name="bonus.value"
              percentLabel="% of salary"
              value={bonus}
              onChange={setBonus}
            />
            <ScheduleFields
              label="How often"
              value={bonusSchedule}
              onChange={setBonusSchedule}
              kinds={["monthly", "quarterly", "yearly"]}
            />
            <Field orientation="horizontal">
              <Switch
                id={`${ids}-with-paycheck`}
                aria-labelledby={`${ids}-with-paycheck-label`}
                checked={bonusWithPaycheck}
                onCheckedChange={setBonusWithPaycheck}
              />
              <FieldContent>
                <FieldLabel
                  htmlFor={`${ids}-with-paycheck`}
                  id={`${ids}-with-paycheck-label`}
                >
                  Added to that day's paycheck
                </FieldLabel>
                <FieldDescription>
                  Otherwise it arrives as its own deposit.
                </FieldDescription>
              </FieldContent>
            </Field>
          </>
        )}
      </FoldSection>

      <FieldSet>
        <FieldLegend>Deposit</FieldLegend>
        <Field>
          <FieldLabel htmlFor={`${ids}-deposit`}>Main account</FieldLabel>
          <NativeSelect
            id={`${ids}-deposit`}
            className="w-full"
            value={depositAccountId}
            onChange={(e) => setDepositAccountId(e.target.value)}
          >
            <NativeSelectOption value="">Not set</NativeSelectOption>
            {accountOptions}
          </NativeSelect>
          <FieldDescription>
            Gets whatever isn't split off below.
          </FieldDescription>
        </Field>
        {splits.map((s, index) => (
          <div
            key={s.key}
            className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            <div className="grid gap-1.5">
              <span
                id={`${ids}-split-${s.key}`}
                className="text-sm font-medium"
              >
                Also deposit into
              </span>
              <NativeSelect
                aria-labelledby={`${ids}-split-${s.key}`}
                name={`splits.${index}.accountId`}
                className="w-full"
                value={s.accountId}
                onChange={(e) =>
                  update(setSplits, s.key, { accountId: e.target.value })
                }
              >
                <NativeSelectOption value="">
                  Choose an account
                </NativeSelectOption>
                {accountOptions}
              </NativeSelect>
            </div>
            <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
              <AmountRuleInput
                label="Amount"
                name={`splits.${index}.value`}
                percentLabel="% of deposit"
                value={s}
                onChange={(rule) => update(setSplits, s.key, rule)}
              />
            </div>
            <RemoveButton
              label="Remove split"
              onClick={() => remove(setSplits, s.key)}
            />
          </div>
        ))}
        <RowButton
          label="Split to another account"
          onClick={() =>
            setSplits((rows) => [
              ...rows,
              { key: nextKey++, accountId: "", mode: "amount", value: "" },
            ])
          }
        />
      </FieldSet>
    </FormDialog>
  )
}

export const JobDialog = resetOnClose(JobDialogForm)
