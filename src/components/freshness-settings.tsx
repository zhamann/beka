import { actions } from "astro:actions"
import { useId, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { FreshnessRules } from "@/server/settings"

/** Turns each out-of-date check on or off, saving each change as it's made. */
export function FreshnessSettings({ rules: saved }: { rules: FreshnessRules }) {
  const id = useId()
  const [rules, setRules] = useState(saved)
  const [days, setDays] = useState(String(saved.balanceDays))
  const [pending, startTransition] = useTransition()
  const save = (change: Partial<FreshnessRules>) => {
    const next = { ...rules, ...change }
    setRules(next)
    startTransition(async () => {
      const { error } = await actions.updateFreshnessRules(next)
      if (error) {
        toast.error(error.message)
        setRules(rules)
        setDays(String(rules.balanceDays))
      } else toast.success("Saved")
    })
  }
  const saveDays = () => {
    if (days.trim() !== String(rules.balanceDays))
      save({ balanceDays: Number(days) })
  }

  const toggles: {
    key: keyof FreshnessRules
    label: string
    description: string
  }[] = [
    {
      key: "balances",
      label: "Balances",
      description: "Flag a balance once it's older than this many days:",
    },
    {
      key: "transactions",
      label: "Transactions",
      description: "Flag when last month's transactions aren't imported.",
    },
    {
      key: "rotatingCategories",
      label: "Rotating card categories",
      description:
        "Flag cards you've entered rotating categories for when a new quarter starts.",
    },
    {
      key: "taxTables",
      label: "Tax tables",
      description:
        "Flag when this version doesn't have this year's tax tables.",
    },
  ]

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        saveDays()
      }}
    >
      <FieldGroup>
        {toggles.map((toggle) => (
          <Field key={toggle.key} orientation="horizontal">
            <Switch
              id={`${id}-${toggle.key}`}
              aria-labelledby={`${id}-${toggle.key}-label`}
              checked={Boolean(rules[toggle.key])}
              disabled={pending}
              onCheckedChange={(on) => save({ [toggle.key]: on })}
            />
            <FieldContent>
              <FieldLabel
                htmlFor={`${id}-${toggle.key}`}
                id={`${id}-${toggle.key}-label`}
              >
                {toggle.label}
              </FieldLabel>
              <FieldDescription>{toggle.description}</FieldDescription>
              {toggle.key === "balances" && (
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    id={`${id}-days`}
                    aria-labelledby={`${id}-days-before ${id}-days ${id}-days-after`}
                    className="w-20"
                    inputMode="numeric"
                    value={days}
                    disabled={!rules.balances}
                    onChange={(e) => setDays(e.target.value)}
                    onBlur={saveDays}
                  />
                  <span id={`${id}-days-after`} className="text-sm">
                    days
                  </span>
                  <span id={`${id}-days-before`} className="sr-only">
                    Balances are old after
                  </span>
                </div>
              )}
            </FieldContent>
          </Field>
        ))}
      </FieldGroup>
    </form>
  )
}
