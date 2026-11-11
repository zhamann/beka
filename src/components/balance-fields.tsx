import { TextField } from "@/components/form-fields"
import { today } from "@/lib/dates"
import { optionalNumber, text } from "@/lib/form"
import { centsToInput } from "@/lib/money"

/** An amount and the date it was true on. */
export function BalanceFields({
  label = "Balance",
  description,
  defaultAmount,
  required = true,
}: {
  label?: string
  description?: string
  defaultAmount?: number | null
  required?: boolean
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        name="amount"
        money
        label={label}
        description={description}
        inputMode="decimal"
        placeholder="0.00"
        defaultValue={centsToInput(defaultAmount)}
        required={required}
      />
      <TextField name="asOf" label="As of" type="date" defaultValue={today()} />
    </div>
  )
}

/** The balance from `BalanceFields`, or null when the amount is blank. */
export function readBalance(form: FormData) {
  const amount = optionalNumber(form, "amount")
  return amount === null ? null : { amount, asOf: text(form, "asOf") }
}
