import { IconPlus, IconTrash } from "@tabler/icons-react"
import { actions } from "astro:actions"
import { useId, useState, type ReactElement } from "react"

import { ConfirmDelete } from "@/components/confirm-delete"
import { FormDialog, resetOnClose } from "@/components/form-dialog"
import { SelectField, TextField } from "@/components/form-fields"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { today } from "@/lib/dates"
import { number, optionalId, optionalNumber, text } from "@/lib/form"
import { centsToInput } from "@/lib/money"
import { FREQUENCIES, FREQUENCY_LABELS, type Frequency } from "@/lib/recurring"
import type { AccountKind } from "@/lib/accounts"
import type { Account } from "@/server/accounts"
import type { Category } from "@/server/categories"
import type { RecurringPayment } from "@/server/recurring"
import type { Transaction } from "@/server/transactions"

/** The signed dollars from an amount field and a money in/out choice. */
function signedAmount(form: FormData): number {
  const amount = optionalNumber(form, "amount")
  if (amount === null) return NaN
  return text(form, "direction") === "in" ? Math.abs(amount) : -Math.abs(amount)
}

const EVERYDAY: AccountKind[] = ["checking", "savings", "credit_card"]

/**
 * Accounts a transaction can be in: checking, savings, and cards first, then
 * the rest. Archived accounts only show when the transaction is already in one.
 */
function accountOptions(accounts: Account[], current?: number) {
  const open = accounts.filter((a) => !a.archivedAt || a.id === current)
  const option = (group: string) => (a: Account) => ({
    value: a.id,
    label: a.archivedAt ? `${a.name} (archived)` : a.name,
    group,
  })
  return [
    ...open
      .filter((a) => EVERYDAY.includes(a.kind))
      .map(option("Checking, savings, and cards")),
    ...open
      .filter((a) => !EVERYDAY.includes(a.kind))
      .map(option("Other accounts")),
  ]
}

/** Edits or deletes `transaction`, or adds one by hand when it's left out. */
function TransactionDialogForm({
  transaction,
  accounts,
  categories,
  recurring,
  trigger,
  open,
  onOpenChange,
  onClosed,
}: {
  transaction?: Transaction
  accounts: Account[]
  categories: Category[]
  /** Active recurring payments this charge could belong to. */
  recurring: Pick<RecurringPayment, "id" | "name">[]
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onClosed: () => void
}) {
  const currentRecurring =
    transaction?.recurringId == null ? "none" : `id:${transaction.recurringId}`
  const uncategorized = categories.find((c) => c.builtin)?.id
  const ids = useId()
  const [direction, setDirection] = useState<"in" | "out">(
    transaction && transaction.amount > 0 ? "in" : "out"
  )
  return (
    <FormDialog
      onClosed={onClosed}
      title={transaction ? `Edit ${transaction.merchant}` : "Add a transaction"}
      description={
        transaction
          ? undefined
          : "For something no upload will carry, like a cash purchase."
      }
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      submitLabel={transaction ? "Save" : "Add transaction"}
      successMessage={transaction ? "Saved" : "Transaction added"}
      onSubmit={async (form) => {
        const fields = {
          date: text(form, "date"),
          accountId: optionalId(form, "accountId") ?? NaN,
          merchant: text(form, "merchant"),
          description: text(form, "description"),
          amount: signedAmount(form),
          categoryId: number(form, "categoryId"),
          notes: text(form, "notes"),
        }
        if (!transaction) return actions.createTransaction(fields)
        const choice = text(form, "recurring")
        const recurring =
          choice === currentRecurring
            ? undefined
            : choice === "none"
              ? null
              : choice.startsWith("id:")
                ? Number(choice.slice(3))
                : (choice.slice(4) as Frequency)
        return actions.updateTransaction({
          id: transaction.id,
          ...fields,
          recurring,
        })
      }}
      footer={
        transaction && (
          <ConfirmDelete
            title="Delete this transaction?"
            description="It's removed from Spending and its import."
            onConfirm={() =>
              actions.deleteTransactions({ ids: [transaction.id] })
            }
            trigger={
              <Button variant="destructive" className="sm:mr-auto">
                <IconTrash />
                Delete
              </Button>
            }
          />
        )
      }
    >
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel id={`${ids}-direction`}>Direction</FieldLabel>
          <input type="hidden" name="direction" value={direction} />
          <ToggleGroup
            aria-labelledby={`${ids}-direction`}
            variant="outline"
            value={[direction]}
            onValueChange={(value: string[]) => {
              if (value[0]) setDirection(value[0] as "in" | "out")
            }}
            className="w-full"
          >
            <ToggleGroupItem
              value="out"
              className="flex-1 data-[pressed]:bg-primary data-[pressed]:text-primary-foreground"
            >
              Money out
            </ToggleGroupItem>
            <ToggleGroupItem
              value="in"
              className="flex-1 data-[pressed]:bg-primary data-[pressed]:text-primary-foreground"
            >
              Money in
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <TextField
          name="amount"
          money
          label="Amount"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={
            transaction ? centsToInput(Math.abs(transaction.amount)) : ""
          }
        />
        <TextField
          name="merchant"
          label="Merchant"
          defaultValue={transaction?.merchant}
          required
        />
        <SelectField
          name="categoryId"
          label="Category"
          defaultValue={transaction?.categoryId ?? uncategorized}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
        <TextField
          name="date"
          label="Date"
          type="date"
          defaultValue={transaction?.date ?? today()}
        />
        <SelectField
          name="accountId"
          label="Account"
          defaultValue={transaction?.accountId ?? ""}
          options={[
            ...(transaction ? [] : [{ value: "", label: "Choose an account" }]),
            ...accountOptions(accounts, transaction?.accountId),
          ]}
        />
        {transaction && (
          <div className="sm:col-span-2">
            <SelectField
              name="recurring"
              label="Recurring payment"
              defaultValue={currentRecurring}
              options={[
                { value: "none", label: "Not recurring" },
                ...recurring.map((payment) => ({
                  value: `id:${payment.id}`,
                  label: payment.name,
                })),
                ...FREQUENCIES.map((frequency) => ({
                  value: `new:${frequency}`,
                  label: `New ${FREQUENCY_LABELS[frequency].toLowerCase()} payment`,
                })),
              ]}
            />
          </div>
        )}
        <div className="sm:col-span-2">
          <TextField
            name="description"
            label="Bank description (optional)"
            defaultValue={transaction?.description}
          />
        </div>
        <div className="sm:col-span-2">
          <TextField
            name="notes"
            label="Notes (optional)"
            defaultValue={transaction?.notes}
          />
        </div>
      </div>
    </FormDialog>
  )
}

/** The Transactions page's button for adding one by hand. */
export function AddTransactionButton(
  props: Omit<
    React.ComponentProps<typeof TransactionDialog>,
    "transaction" | "trigger"
  >
) {
  return (
    <TransactionDialog
      {...props}
      trigger={
        <Button>
          <IconPlus />
          Add transaction
        </Button>
      }
    />
  )
}

export const TransactionDialog = resetOnClose(TransactionDialogForm)
