import { useId } from "react"

import { MoneyInput } from "@/components/form-fields"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

/** A percent-or-dollars amount as the form edits it. */
export interface AmountDraft {
  mode: "percent" | "amount"
  value: string
}

export const draftNumber = (value: string) =>
  value.trim() === "" ? NaN : Number(value.replace(/[$,%\s]/g, ""))

/** An amount with a % / $ choice, like "6 %" of pay or "$150" a check. */
export function AmountRuleInput({
  value,
  onChange,
  label,
  percentLabel = "% of pay",
  name,
}: {
  value: AmountDraft
  onChange: (draft: AmountDraft) => void
  label: string
  percentLabel?: string
  /** The form path errors use for the number, like "splits.0.value". */
  name?: string
}) {
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <span id={id} className="text-sm font-medium">
        {label}
      </span>
      <div className="grid grid-cols-[1fr_8rem] gap-2">
        {value.mode === "amount" ? (
          <MoneyInput
            aria-labelledby={id}
            name={name}
            value={value.value}
            onChange={(event) =>
              onChange({ ...value, value: event.target.value })
            }
          />
        ) : (
          <Input
            aria-labelledby={id}
            name={name}
            inputMode="decimal"
            placeholder="6"
            value={value.value}
            onChange={(event) =>
              onChange({ ...value, value: event.target.value })
            }
          />
        )}
        <NativeSelect
          aria-label={`${label} as`}
          className="w-full"
          value={value.mode}
          onChange={(event) =>
            onChange({
              ...value,
              mode: event.target.value as AmountDraft["mode"],
            })
          }
        >
          <NativeSelectOption value="percent">
            {percentLabel}
          </NativeSelectOption>
          <NativeSelectOption value="amount">$ a check</NativeSelectOption>
        </NativeSelect>
      </div>
    </div>
  )
}
