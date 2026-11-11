import { useId } from "react"

import { useFieldError } from "@/components/form-dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select"

/** Points a control at its help text and its error, whichever it has. */
const describedBy = (id: string, description?: string, error?: string) =>
  [description && `${id}-description`, error && `${id}-error`]
    .filter(Boolean)
    .join(" ") || undefined

interface FieldProps {
  name: string
  label: string
  description?: string
}

/** Dollars as typed, rewritten like "1,234.50" once you leave the field. */
function formatDollars(event: React.FocusEvent<HTMLInputElement>) {
  const raw = event.currentTarget.value.replace(/[$,\s]/g, "")
  if (raw === "" || !Number.isFinite(Number(raw))) return
  event.currentTarget.value = Number(raw).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * An input for dollars: a "$" in front, a number keypad on phones, and
 * thousands separators once you leave it. Values read back with `optionalNumber`
 * or `draftNumber`, which ignore the separators.
 */
export function MoneyInput({
  defaultValue,
  onBlur,
  onFocus,
  ...input
}: React.ComponentProps<typeof InputGroupInput>) {
  return (
    <InputGroup>
      <InputGroupAddon>
        <InputGroupText>$</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        inputMode="decimal"
        placeholder="0.00"
        {...input}
        defaultValue={
          typeof defaultValue === "string" &&
          defaultValue !== "" &&
          Number.isFinite(Number(defaultValue))
            ? Number(defaultValue).toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })
            : defaultValue
        }
        // Typing replaces the amount that's there, like a new balance would.
        onFocus={(event) => {
          event.currentTarget.select()
          onFocus?.(event)
        }}
        onBlur={(event) => {
          // Controlled inputs format through their own onChange.
          if (input.value === undefined) formatDollars(event)
          onBlur?.(event)
        }}
      />
    </InputGroup>
  )
}

/**
 * A labeled input that shows the server's error for `name`. With `money`, it
 * has a "$" in front and shows thousands separators once you leave it.
 */
export function TextField({
  name,
  label,
  description,
  money = false,
  ...input
}: FieldProps & { money?: boolean } & Omit<
    React.ComponentProps<typeof Input>,
    "name"
  >) {
  const id = useId()
  const error = useFieldError(name)
  const control = {
    id,
    name,
    autoComplete: "off",
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy(id, description, error),
    ...input,
  }
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {money ? <MoneyInput {...control} /> : <Input {...control} />}
      {description && (
        <FieldDescription id={`${id}-description`}>
          {description}
        </FieldDescription>
      )}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  )
}

type Option = { value: string | number; label: string; group?: string }

/** Options in their groups (in first-seen order), or ungrouped. */
function renderOptions(options: Option[]) {
  const groups = [...new Set(options.map((o) => o.group))]
  const render = (option: Option) => (
    <NativeSelectOption key={option.value} value={option.value}>
      {option.label}
    </NativeSelectOption>
  )
  return groups.map((group) =>
    group === undefined ? (
      options.filter((o) => o.group === undefined).map(render)
    ) : (
      <NativeSelectOptGroup key={group} label={group}>
        {options.filter((o) => o.group === group).map(render)}
      </NativeSelectOptGroup>
    )
  )
}

/** A labeled select that shows the server's error for `name`. Options with a `group` are grouped under it. */
export function SelectField({
  name,
  label,
  description,
  options,
  ...select
}: FieldProps & {
  options: Option[]
} & Omit<React.ComponentProps<typeof NativeSelect>, "name">) {
  const id = useId()
  const error = useFieldError(name)
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, description, error)}
        className="w-full"
        {...select}
      >
        {renderOptions(options)}
      </NativeSelect>
      {description && (
        <FieldDescription id={`${id}-description`}>
          {description}
        </FieldDescription>
      )}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  )
}
