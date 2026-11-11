import { actions } from "astro:actions"
import { useState, type ReactElement } from "react"

import {
  AccountFields,
  NotesField,
  readAccountFields,
} from "@/components/account-fields"
import { BalanceFields, readBalance } from "@/components/balance-fields"
import { FormDialog, resetOnClose } from "@/components/form-dialog"
import { SelectField, TextField } from "@/components/form-fields"
import { number, optionalNumber } from "@/lib/form"
import { LOAN_TYPE_LABELS, LOAN_TYPES, type LoanType } from "@/lib/loans"
import { centsToInput } from "@/lib/money"
import type { Member } from "@/server/household"
import type { Loan } from "@/server/loans"

/** Adds a loan with its terms and balance owed, or edits `loan`. */
function LoanDialogForm({
  loan,
  members,
  trigger,
  onClosed,
}: {
  loan?: Loan
  members: Member[]
  trigger: ReactElement
  onClosed: () => void
}) {
  const [loanType, setLoanType] = useState<LoanType>(
    loan?.loanType ?? "student"
  )

  return (
    <FormDialog
      onClosed={onClosed}
      title={loan ? `Edit ${loan.name}` : "Add a loan"}
      trigger={trigger}
      submitLabel={loan ? "Save" : "Add loan"}
      onSubmit={(form) => {
        // The loan schema drops `kind`; loans are always loans.
        const input = readAccountFields(form)
        const terms = {
          loanType,
          interestRate: number(form, "interestRate"),
          minimumPayment: optionalNumber(form, "minimumPayment") ?? NaN,
          dueDay: optionalNumber(form, "dueDay"),
          originalAmount: optionalNumber(form, "originalAmount"),
          escrow: optionalNumber(form, "escrow"),
        }
        return loan
          ? actions.updateLoan({ id: loan.id, ...input, terms })
          : actions.createLoan({ ...input, terms, balance: readBalance(form) })
      }}
    >
      <AccountFields
        account={loan}
        kinds={["loan"]}
        members={members}
        namePlaceholder="e.g. Sam's student loan"
      />
      <SelectField
        name="loanType"
        label="Type"
        value={loanType}
        onChange={(event) => setLoanType(event.target.value as LoanType)}
        options={LOAN_TYPES.map((value) => ({
          value,
          label: LOAN_TYPE_LABELS[value],
        }))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="interestRate"
          label="Interest rate (%)"
          inputMode="decimal"
          placeholder="e.g. 6.5"
          defaultValue={loan ? +(loan.interestRate * 100).toFixed(4) : ""}
          required
        />
        <TextField
          name="minimumPayment"
          money
          label="Minimum payment"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={centsToInput(loan?.minimumPayment)}
          required
        />
        <TextField
          name="dueDay"
          label="Due day of the month"
          inputMode="numeric"
          defaultValue={loan?.dueDay ?? ""}
        />
        <TextField
          name="originalAmount"
          money
          label="Original amount"
          inputMode="decimal"
          defaultValue={centsToInput(loan?.originalAmount)}
        />
        {loanType === "mortgage" && (
          <TextField
            name="escrow"
            money
            label="Escrow per payment"
            description="Taxes and insurance included in the payment."
            inputMode="decimal"
            defaultValue={centsToInput(loan?.escrow)}
          />
        )}
      </div>
      {!loan && (
        <BalanceFields
          label="Amount owed"
          description="Optional. You can update it any time."
          required={false}
        />
      )}
      <NotesField account={loan} />
    </FormDialog>
  )
}

export const LoanDialog = resetOnClose(LoanDialogForm)
