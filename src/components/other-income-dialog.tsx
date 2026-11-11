import { IconTrash } from "@tabler/icons-react"
import { actions } from "astro:actions"
import { useId, useState, type ReactElement } from "react"

import { draftNumber } from "@/components/amount-rule-input"
import { ConfirmDelete } from "@/components/confirm-delete"
import { FormDialog, resetOnClose } from "@/components/form-dialog"
import {
  BUSINESS_DAY_RULES,
  fromDraft,
  ScheduleFields,
  toDraft,
} from "@/components/schedule-fields"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { centsToInput } from "@/lib/money"
import type { BusinessDayRule } from "@/lib/paycheck/schedule"
import type { Account } from "@/server/accounts"
import type { Member } from "@/server/household"
import type { OtherIncome } from "@/server/income"

/** Adds income outside payroll (pension, rent, …), or edits `income`. */
function OtherIncomeDialogForm({
  income,
  members,
  accounts,
  trigger,
  onClosed,
}: {
  income?: OtherIncome
  members: Member[]
  accounts: Account[]
  trigger: ReactElement
  onClosed: () => void
}) {
  const ids = useId()
  const [memberId, setMemberId] = useState(
    String(income?.memberId ?? members[0]?.id ?? "")
  )
  const [name, setName] = useState(income?.name ?? "")
  const [amount, setAmount] = useState(centsToInput(income?.amount))
  const [schedule, setSchedule] = useState(() =>
    toDraft(income?.schedule, "monthly")
  )
  const [rule, setRule] = useState<BusinessDayRule>(
    income?.businessDayRule ?? "previous"
  )
  const [taxable, setTaxable] = useState(income?.taxable ?? false)
  const [accountId, setAccountId] = useState(String(income?.accountId ?? ""))

  const payload = () => ({
    memberId: Number(memberId),
    name,
    amount: draftNumber(amount),
    schedule: fromDraft(schedule),
    businessDayRule: rule,
    taxable,
    accountId: accountId === "" ? null : Number(accountId),
  })

  return (
    <FormDialog
      onClosed={onClosed}
      wide
      inlineErrors={false}
      title={income ? `Edit ${income.name}` : "Add other income"}
      description="Income outside a paycheck, like a pension, rent, or child support. Enter what's deposited."
      trigger={trigger}
      submitLabel={income ? "Save" : "Add income"}
      onSubmit={() =>
        income
          ? actions.updateOtherIncome({ id: income.id, ...payload() })
          : actions.createOtherIncome(payload())
      }
      footer={
        income && (
          <ConfirmDelete
            title={`Remove ${income.name}?`}
            description="It disappears from Income and the Dashboard."
            onConfirm={() => actions.deleteOtherIncome({ id: income.id })}
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
      <div className="grid gap-4 sm:grid-cols-3">
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
          <FieldLabel htmlFor={`${ids}-name`}>Name</FieldLabel>
          <Input
            id={`${ids}-name`}
            name="name"
            placeholder="e.g. Pension"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${ids}-amount`}>Amount deposited</FieldLabel>
          <Input
            id={`${ids}-amount`}
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
      </div>
      <ScheduleFields
        label="Arrives"
        value={schedule}
        onChange={setSchedule}
        kinds={[
          "weekly",
          "biweekly",
          "semimonthly",
          "monthly",
          "quarterly",
          "yearly",
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${ids}-rule`}>
            On weekends and bank holidays
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
        <Field>
          <FieldLabel htmlFor={`${ids}-account`}>Deposited to</FieldLabel>
          <NativeSelect
            id={`${ids}-account`}
            name="accountId"
            className="w-full"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <NativeSelectOption value="">Not set</NativeSelectOption>
            {accounts.map((account) => (
              <NativeSelectOption key={account.id} value={account.id}>
                {account.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field orientation="horizontal">
        <Switch
          id={`${ids}-taxable`}
          aria-labelledby={`${ids}-taxable-label`}
          checked={taxable}
          onCheckedChange={setTaxable}
        />
        <FieldContent>
          <FieldLabel htmlFor={`${ids}-taxable`} id={`${ids}-taxable-label`}>
            Taxable
          </FieldLabel>
          <FieldDescription>
            For your records and your agent; nothing is withheld from it here.
          </FieldDescription>
        </FieldContent>
      </Field>
    </FormDialog>
  )
}

export const OtherIncomeDialog = resetOnClose(OtherIncomeDialogForm)
