import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { formatMonth } from "@/lib/months"

/** Switches the phone view of Spending to another month. */
export function MonthPicker({
  months,
  value,
  param,
  anchor,
}: {
  months: string[]
  value: string
  param: string
  /** The id of the section to return to after switching. */
  anchor?: string
}) {
  return (
    <NativeSelect
      aria-label="Month"
      className="w-full"
      value={value}
      onChange={(event) => {
        const url = new URL(window.location.href)
        url.searchParams.set(param, event.target.value)
        // Come back to the same section rather than the top of the page.
        if (anchor) url.hash = anchor
        window.location.assign(url)
      }}
    >
      {months.map((month) => (
        <NativeSelectOption key={month} value={month}>
          {formatMonth(month, "long")}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
