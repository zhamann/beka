import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

/** A select that reloads the page with `param` set to the chosen option. */
export function ParamSelect({
  label,
  param,
  value,
  options,
}: {
  label: string
  param: string
  value: string
  options: { value: string; label: string }[]
}) {
  return (
    <NativeSelect
      aria-label={label}
      className="w-full"
      value={value}
      onChange={(event) => {
        const url = new URL(window.location.href)
        url.searchParams.set(param, event.target.value)
        window.location.assign(url)
      }}
    >
      {options.map((option) => (
        <NativeSelectOption key={option.value} value={option.value}>
          {option.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
