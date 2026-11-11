import { IconPlus, IconX } from "@tabler/icons-react"
import { actions } from "astro:actions"
import { cn } from "cn"
import { useId, useState, type ReactElement } from "react"

import {
  AccountFields,
  NotesField,
  readAccountFields,
} from "@/components/account-fields"
import { BalanceFields, readBalance } from "@/components/balance-fields"
import { FormDialog, resetOnClose } from "@/components/form-dialog"
import { MoneyInput, SelectField, TextField } from "@/components/form-fields"
import { Button } from "@/components/ui/button"
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
import {
  CAP_PERIODS,
  quarterOf,
  REWARDS_CURRENCIES,
  REWARDS_CURRENCY_LABELS,
  type CapPeriod,
  type RewardsCurrency,
} from "@/lib/cards"
import { today } from "@/lib/dates"
import { optionalNumber } from "@/lib/form"
import { centsToInput } from "@/lib/money"
import type { Card, RewardCategory } from "@/server/cards"
import type { Member } from "@/server/household"

interface BonusRow {
  key: number
  rewardCategoryId: string
  rate: string
  cap: string
  capPeriod: CapPeriod
  condition: string
  /** "" for always, or "2026-4" for a rotating quarter. */
  when: string
}

/** A control with a small visible label above it, for rows of short fields. */
function Labeled({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={cn("grid gap-1.5 text-sm font-medium", className)}>
      {label}
      {children}
    </label>
  )
}

interface CreditRow {
  key: number
  name: string
  annualValue: string
}

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2000, i, 1).toLocaleString("en-US", { month: "long" }),
}))

let nextKey = 0

/** The current quarter and the next three, for rotating categories. */
function upcomingQuarters(): { value: string; label: string }[] {
  let { year, quarter } = quarterOf(today())
  return Array.from({ length: 4 }, () => {
    const option = {
      value: `${year}-${quarter}`,
      label: `Q${quarter} ${year} only`,
    }
    quarter = quarter === 4 ? 1 : quarter + 1
    if (quarter === 1) year += 1
    return option
  })
}

const toNumber = (value: string) =>
  value.trim() === "" ? null : Number(value.replace(/[$,%\s]/g, ""))

/** Adds a credit card with its rewards, or edits `card`. */
function CardDialogForm({
  card,
  members,
  rewardCategories,
  trigger,
  onClosed,
}: {
  card?: Card
  members: Member[]
  rewardCategories: RewardCategory[]
  trigger: ReactElement
  onClosed: () => void
}) {
  const ids = useId()
  const [currency, setCurrency] = useState<RewardsCurrency>(
    card?.rewardsCurrency ?? "cash"
  )
  const [foreignFee, setForeignFee] = useState(
    card?.foreignTransactionFee ?? false
  )
  const [carriesBalance, setCarriesBalance] = useState(
    card?.carriesBalance ?? false
  )
  const [annualFee, setAnnualFee] = useState(
    centsToInput(card?.annualFee || null)
  )
  const [bonuses, setBonuses] = useState<BonusRow[]>(
    () =>
      card?.bonuses.map((bonus) => ({
        key: nextKey++,
        rewardCategoryId: String(bonus.rewardCategoryId),
        rate: String(bonus.rate),
        cap: centsToInput(bonus.cap),
        capPeriod: bonus.capPeriod ?? "year",
        condition: bonus.condition,
        when: bonus.year === null ? "" : `${bonus.year}-${bonus.quarter}`,
      })) ?? []
  )
  const [credits, setCredits] = useState<CreditRow[]>(
    () =>
      card?.credits.map((credit) => ({
        key: nextKey++,
        name: credit.name,
        annualValue: centsToInput(credit.annualValue),
      })) ?? []
  )
  const quarters = upcomingQuarters()
  // Keep a past rotating quarter selectable on cards that still have one.
  for (const bonus of bonuses) {
    if (bonus.when && !quarters.some((q) => q.value === bonus.when)) {
      const [year, quarter] = bonus.when.split("-")
      quarters.unshift({ value: bonus.when, label: `Q${quarter} ${year} only` })
    }
  }

  const updateBonus = (key: number, change: Partial<BonusRow>) =>
    setBonuses((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...change } : row))
    )
  const updateCredit = (key: number, change: Partial<CreditRow>) =>
    setCredits((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...change } : row))
    )

  return (
    <FormDialog
      onClosed={onClosed}
      wide
      title={card ? `Edit ${card.name}` : "Add a credit card"}
      description="Its rewards decide which card Beka suggests where."
      trigger={trigger}
      submitLabel={card ? "Save" : "Add card"}
      onSubmit={(form) => {
        const input = readAccountFields(form)
        const terms = {
          rewardsCurrency: currency,
          pointValue:
            currency === "cash"
              ? 1
              : (optionalNumber(form, "pointValue") ?? NaN),
          baseRate: optionalNumber(form, "baseRate") ?? NaN,
          annualFee: toNumber(annualFee) ?? 0,
          annualFeeMonth: optionalNumber(form, "annualFeeMonth"),
          foreignTransactionFee: foreignFee,
          creditLimit: optionalNumber(form, "creditLimit"),
          apr: optionalNumber(form, "apr"),
          statementDueDay: optionalNumber(form, "statementDueDay"),
          carriesBalance,
          bonuses: bonuses.map((row) => {
            const [year, quarter] = row.when
              ? row.when.split("-").map(Number)
              : [null, null]
            return {
              rewardCategoryId: Number(row.rewardCategoryId),
              rate: toNumber(row.rate) ?? NaN,
              cap: toNumber(row.cap),
              capPeriod: row.capPeriod,
              condition: row.condition,
              year,
              quarter,
            }
          }),
          credits: credits.map((row) => ({
            name: row.name,
            annualValue: toNumber(row.annualValue) ?? NaN,
          })),
        }
        return card
          ? actions.updateCard({ id: card.id, ...input, terms })
          : actions.createCard({ ...input, terms, balance: readBalance(form) })
      }}
    >
      <AccountFields
        account={card}
        kinds={["credit_card"]}
        members={members}
        namePlaceholder="e.g. Travel card"
      />
      <FieldSet>
        <FieldLegend>Rewards</FieldLegend>
        <div className="grid items-start gap-4 sm:grid-cols-3">
          <SelectField
            name="rewardsCurrency"
            label="Earns"
            value={currency}
            onChange={(event) =>
              setCurrency(event.target.value as RewardsCurrency)
            }
            options={REWARDS_CURRENCIES.map((value) => ({
              value,
              label: REWARDS_CURRENCY_LABELS[value],
            }))}
          />
          {currency !== "cash" && (
            <TextField
              name="pointValue"
              label={`Cents per ${currency === "points" ? "point" : "mile"}`}
              inputMode="decimal"
              placeholder="e.g. 1.25"
              defaultValue={
                card && card.rewardsCurrency !== "cash" ? card.pointValue : ""
              }
            />
          )}
          <TextField
            name="baseRate"
            label={
              currency === "cash"
                ? "Base cash back (%)"
                : `Base ${currency} per $1`
            }
            inputMode="decimal"
            placeholder="e.g. 1"
            defaultValue={card?.baseRate ?? ""}
            required
          />
          <p className="text-sm text-muted-foreground sm:col-span-3">
            The base rate is what the card earns on everything without a bonus.
          </p>
        </div>
        <Field>
          <FieldLabel>Bonus categories</FieldLabel>
          <FieldDescription>
            {currency === "cash"
              ? "Cash back as a percentage, like 3 for 3%."
              : `${currency === "points" ? "Points" : "Miles"} per dollar, like 2 for 2x.`}{" "}
            Pick a quarter for rotating categories.
          </FieldDescription>
          <div className="flex flex-col gap-3">
            {bonuses.map((row, index) => (
              <div
                key={row.key}
                className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_5rem_auto]"
              >
                <Labeled label="Category">
                  <NativeSelect
                    aria-label="Category"
                    name={`bonuses.${index}.rewardCategoryId`}
                    className="w-full"
                    value={row.rewardCategoryId}
                    onChange={(event) =>
                      updateBonus(row.key, {
                        rewardCategoryId: event.target.value,
                      })
                    }
                  >
                    <NativeSelectOption value="">
                      Choose a category
                    </NativeSelectOption>
                    {rewardCategories.map((category) => (
                      <NativeSelectOption key={category.id} value={category.id}>
                        {category.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Labeled>
                <Labeled label="Rate">
                  <Input
                    aria-label="Rate"
                    name={`bonuses.${index}.rate`}
                    inputMode="decimal"
                    placeholder={currency === "cash" ? "3" : "2"}
                    value={row.rate}
                    onChange={(event) =>
                      updateBonus(row.key, { rate: event.target.value })
                    }
                  />
                </Labeled>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="self-end"
                  aria-label="Remove bonus"
                  onClick={() =>
                    setBonuses((rows) => rows.filter((r) => r.key !== row.key))
                  }
                >
                  <IconX />
                </Button>
                <div className="grid gap-2 sm:col-span-3 sm:grid-cols-3">
                  <Labeled label="Cap ($)">
                    <Input
                      aria-label="Spending cap"
                      name={`bonuses.${index}.cap`}
                      inputMode="decimal"
                      placeholder="No cap"
                      value={row.cap}
                      onChange={(event) =>
                        updateBonus(row.key, { cap: event.target.value })
                      }
                    />
                  </Labeled>
                  <Labeled label="Per">
                    <NativeSelect
                      aria-label="Cap period"
                      className="w-full"
                      value={row.capPeriod}
                      onChange={(event) =>
                        updateBonus(row.key, {
                          capPeriod: event.target.value as CapPeriod,
                        })
                      }
                    >
                      {CAP_PERIODS.map((period) => (
                        <NativeSelectOption key={period} value={period}>
                          a {period}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Labeled>
                  <Labeled label="When">
                    <NativeSelect
                      aria-label="When"
                      className="w-full"
                      value={row.when}
                      onChange={(event) =>
                        updateBonus(row.key, { when: event.target.value })
                      }
                    >
                      <NativeSelectOption value="">Always</NativeSelectOption>
                      {quarters.map((option) => (
                        <NativeSelectOption
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Labeled>
                  <Labeled
                    label="Condition (optional)"
                    className="sm:col-span-3"
                  >
                    <Input
                      aria-label="Condition"
                      placeholder="e.g. booked on the card's site"
                      value={row.condition}
                      onChange={(event) =>
                        updateBonus(row.key, { condition: event.target.value })
                      }
                    />
                  </Labeled>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              className="self-start"
              onClick={() =>
                setBonuses((rows) => [
                  ...rows,
                  {
                    key: nextKey++,
                    rewardCategoryId: "",
                    rate: "",
                    cap: "",
                    capPeriod: "year",
                    condition: "",
                    when: "",
                  },
                ])
              }
            >
              <IconPlus />
              Add bonus category
            </Button>
          </div>
        </Field>
      </FieldSet>
      <FieldSet>
        <FieldLegend>Fees and credits</FieldLegend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${ids}-fee`}>Annual fee</FieldLabel>
            <MoneyInput
              id={`${ids}-fee`}
              value={annualFee}
              onChange={(event) => setAnnualFee(event.target.value)}
            />
          </Field>
          {(toNumber(annualFee) ?? 0) > 0 && (
            <SelectField
              name="annualFeeMonth"
              label="Charged in"
              defaultValue={card?.annualFeeMonth ?? ""}
              options={[{ value: "", label: "Not sure" }, ...MONTHS]}
            />
          )}
        </div>
        <Field orientation="horizontal">
          <Switch
            id={`${ids}-foreign`}
            aria-labelledby={`${ids}-foreign-label`}
            checked={foreignFee}
            onCheckedChange={setForeignFee}
          />
          <FieldContent>
            <FieldLabel htmlFor={`${ids}-foreign`} id={`${ids}-foreign-label`}>
              Charges foreign transaction fees
            </FieldLabel>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel>Statement credits</FieldLabel>
          <FieldDescription>
            Yearly credits that offset the fee, like a dining credit.
          </FieldDescription>
          <div className="flex flex-col gap-2">
            {credits.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[1fr_7rem_auto] gap-2"
              >
                <Input
                  aria-label="Credit name"
                  placeholder="e.g. Dining credit"
                  value={row.name}
                  onChange={(event) =>
                    updateCredit(row.key, { name: event.target.value })
                  }
                />
                <MoneyInput
                  aria-label="Yearly value"
                  value={row.annualValue}
                  onChange={(event) =>
                    updateCredit(row.key, { annualValue: event.target.value })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove credit"
                  onClick={() =>
                    setCredits((rows) => rows.filter((r) => r.key !== row.key))
                  }
                >
                  <IconX />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              className="self-start"
              onClick={() =>
                setCredits((rows) => [
                  ...rows,
                  { key: nextKey++, name: "", annualValue: "" },
                ])
              }
            >
              <IconPlus />
              Add credit
            </Button>
          </div>
        </Field>
      </FieldSet>
      <FieldSet>
        <FieldLegend>Account</FieldLegend>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="creditLimit"
            money
            label="Credit limit (optional)"
            inputMode="decimal"
            defaultValue={centsToInput(card?.creditLimit)}
          />
          <TextField
            name="apr"
            label="APR (%, optional)"
            inputMode="decimal"
            defaultValue={
              card?.apr === null || card?.apr === undefined
                ? ""
                : +(card.apr * 100).toFixed(4)
            }
          />
          <TextField
            name="statementDueDay"
            label="Payment due day (optional)"
            inputMode="numeric"
            defaultValue={card?.statementDueDay ?? ""}
          />
        </div>
        <Field orientation="horizontal">
          <Switch
            id={`${ids}-carries`}
            aria-labelledby={`${ids}-carries-label`}
            checked={carriesBalance}
            onCheckedChange={setCarriesBalance}
          />
          <FieldContent>
            <FieldLabel htmlFor={`${ids}-carries`} id={`${ids}-carries-label`}>
              Carries a balance month to month
            </FieldLabel>
            <FieldDescription>
              Ranks the card with your loans at its APR.
            </FieldDescription>
          </FieldContent>
        </Field>
        {!card && (
          <BalanceFields
            label="Current balance"
            description="Optional. You can update it any time."
            required={false}
          />
        )}
      </FieldSet>
      <NotesField account={card} />
    </FormDialog>
  )
}

export const CardDialog = resetOnClose(CardDialogForm)
