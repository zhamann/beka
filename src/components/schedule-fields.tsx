import { useId } from "react"

import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { today } from "@/lib/dates"
import {
  LAST_DAY,
  type BusinessDayRule,
  type Schedule,
  type ScheduleKind,
} from "@/lib/paycheck/schedule"

/** A schedule as the form edits it, with every kind's fields kept. */
export interface ScheduleDraft {
  kind: ScheduleKind
  anchor: string
  days: [number, number]
  day: number
  month: number
}

const KIND_LABELS: Record<ScheduleKind, string> = {
  weekly: "Every week",
  biweekly: "Every two weeks",
  semimonthly: "Twice a month",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
}

export const BUSINESS_DAY_RULES: { value: BusinessDayRule; label: string }[] = [
  { value: "previous", label: "Move to the business day before" },
  { value: "next", label: "Move to the business day after" },
  { value: "none", label: "Don't move" },
]

const DAY_OPTIONS = [
  ...Array.from({ length: 30 }, (_, i) => ({
    value: i + 1,
    label: String(i + 1),
  })),
  { value: LAST_DAY, label: "Last day" },
]

const monthLabel = (month: number) =>
  new Date(2000, month - 1, 1).toLocaleString("en-US", { month: "long" })

export function toDraft(
  schedule: Schedule | undefined,
  fallback: ScheduleKind
): ScheduleDraft {
  const draft: ScheduleDraft = {
    kind: schedule?.kind ?? fallback,
    anchor: today(),
    days: [15, LAST_DAY],
    day: LAST_DAY,
    month: 1,
  }
  if (!schedule) return draft
  switch (schedule.kind) {
    case "weekly":
    case "biweekly":
      draft.anchor = schedule.anchor
      break
    case "semimonthly":
      draft.days = schedule.days
      break
    case "monthly":
      draft.day = schedule.day
      break
    case "quarterly":
    case "yearly":
      draft.day = schedule.day
      draft.month = schedule.month
  }
  return draft
}

export function fromDraft(draft: ScheduleDraft): Schedule {
  switch (draft.kind) {
    case "weekly":
    case "biweekly":
      return { kind: draft.kind, anchor: draft.anchor }
    case "semimonthly":
      return { kind: "semimonthly", days: draft.days }
    case "monthly":
      return { kind: "monthly", day: draft.day }
    case "quarterly":
      return {
        kind: "quarterly",
        month: ((draft.month - 1) % 3) + 1,
        day: draft.day,
      }
    case "yearly":
      return { kind: "yearly", month: draft.month, day: draft.day }
  }
}

function DaySelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (day: number) => void
}) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        className="w-full"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {DAY_OPTIONS.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}

/** Fields for when money arrives: how often, and on which days. */
export function ScheduleFields({
  value,
  onChange,
  kinds,
  label = "How often",
}: {
  value: ScheduleDraft
  onChange: (draft: ScheduleDraft) => void
  kinds: ScheduleKind[]
  label?: string
}) {
  const ids = useId()
  const set = (change: Partial<ScheduleDraft>) =>
    onChange({ ...value, ...change })

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field>
        <FieldLabel htmlFor={`${ids}-kind`}>{label}</FieldLabel>
        <NativeSelect
          id={`${ids}-kind`}
          className="w-full"
          value={value.kind}
          onChange={(event) =>
            set({ kind: event.target.value as ScheduleKind })
          }
        >
          {kinds.map((kind) => (
            <NativeSelectOption key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {(value.kind === "weekly" || value.kind === "biweekly") && (
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor={`${ids}-anchor`}>
            A recent or upcoming payday
          </FieldLabel>
          <Input
            id={`${ids}-anchor`}
            type="date"
            value={value.anchor}
            onChange={(event) => set({ anchor: event.target.value })}
          />
        </Field>
      )}
      {value.kind === "semimonthly" && (
        <>
          <DaySelect
            label="First day"
            value={value.days[0]}
            onChange={(day) => set({ days: [day, value.days[1]] })}
          />
          <DaySelect
            label="Second day"
            value={value.days[1]}
            onChange={(day) => set({ days: [value.days[0], day] })}
          />
        </>
      )}
      {(value.kind === "quarterly" || value.kind === "yearly") && (
        <Field>
          <FieldLabel htmlFor={`${ids}-month`}>
            {value.kind === "quarterly" ? "First month" : "Month"}
          </FieldLabel>
          <NativeSelect
            id={`${ids}-month`}
            className="w-full"
            value={
              value.kind === "quarterly"
                ? ((value.month - 1) % 3) + 1
                : value.month
            }
            onChange={(event) => set({ month: Number(event.target.value) })}
          >
            {(value.kind === "quarterly"
              ? [1, 2, 3]
              : Array.from({ length: 12 }, (_, i) => i + 1)
            ).map((month) => (
              <NativeSelectOption key={month} value={month}>
                {value.kind === "quarterly"
                  ? [0, 3, 6, 9]
                      .map((add) => monthLabel(month + add).slice(0, 3))
                      .join(", ")
                  : monthLabel(month)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
      {(value.kind === "monthly" ||
        value.kind === "quarterly" ||
        value.kind === "yearly") && (
        <DaySelect
          label="Day"
          value={value.day}
          onChange={(day) => set({ day })}
        />
      )}
    </div>
  )
}
