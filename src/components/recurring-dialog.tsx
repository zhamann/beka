import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react"
import { actions } from "astro:actions"

import { ConfirmDelete } from "@/components/confirm-delete"
import { FormDialog } from "@/components/form-dialog"
import { SelectField, TextField } from "@/components/form-fields"
import { Button } from "@/components/ui/button"
import { optionalId, optionalNumber, text } from "@/lib/form"
import { centsToInput } from "@/lib/money"
import { FREQUENCIES, FREQUENCY_LABELS, type Frequency } from "@/lib/recurring"
import type { Account } from "@/server/accounts"
import type { Category } from "@/server/categories"
import type { RecurringPayment } from "@/server/recurring"

/** Adds a recurring payment by hand, or edits `payment`. */
export function RecurringDialog({
  payment,
  categories,
  accounts,
  open,
  onOpenChange,
}: {
  payment?: RecurringPayment
  categories: Category[]
  accounts: Account[]
  /** Set these to open it from elsewhere, like a row's menu. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const controlled = open !== undefined
  const linked = (payment?.charges.length ?? 0) > 0
  return (
    <FormDialog
      title={payment ? `Edit ${payment.name}` : "Add a recurring payment"}
      description={
        payment
          ? undefined
          : "For something your uploads won't show, like a bill paid from an account you don't import. Charges from the merchant you name are linked to it."
      }
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        controlled ? undefined : payment ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit ${payment.name}`}
          >
            <IconPencil />
          </Button>
        ) : (
          <Button>
            <IconPlus />
            Add recurring payment
          </Button>
        )
      }
      submitLabel={payment ? "Save" : "Add"}
      onSubmit={(form) => {
        const input = {
          name: text(form, "name"),
          merchant: text(form, "merchant"),
          frequency: text(form, "frequency") as Frequency,
          amountMode: (text(form, "amountMode") || "latest") as
            "latest" | "average",
          matchMode: (text(form, "matchMode") || "any") as "any" | "near",
          manualAmount: optionalNumber(form, "manualAmount"),
          anchorDate: text(form, "anchorDate") || null,
          categoryId: optionalId(form, "categoryId"),
          accountId: optionalId(form, "accountId"),
        }
        return payment
          ? actions.updateRecurring({ id: payment.id, ...input })
          : actions.createRecurring(input)
      }}
      footer={
        payment && (
          <ConfirmDelete
            title={`Delete ${payment.name}?`}
            description="Its charges go back to plain spending. To keep its history, end it instead."
            onConfirm={() => actions.deleteRecurring({ id: payment.id })}
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
        <TextField
          name="name"
          label="Name"
          description="What you call it, like “Car insurance”."
          defaultValue={payment?.name}
          required
        />
        <TextField
          name="merchant"
          label="Merchant (optional)"
          description="Charges from this merchant are linked to it."
          defaultValue={payment?.merchant}
        />
        <SelectField
          name="frequency"
          label="How often"
          defaultValue={payment?.frequency ?? "monthly"}
          options={FREQUENCIES.map((f) => ({
            value: f,
            label: FREQUENCY_LABELS[f],
          }))}
        />
        {linked ? (
          <SelectField
            name="amountMode"
            label="Amount to count"
            defaultValue={payment?.amountMode}
            options={[
              { value: "latest", label: "The latest charge" },
              { value: "average", label: "The last year's average" },
            ]}
          />
        ) : (
          <TextField
            name="manualAmount"
            money
            label="Amount"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={centsToInput(payment?.manualAmount)}
            required
          />
        )}
        {linked && (
          <SelectField
            name="matchMode"
            label="Which charges belong"
            defaultValue={payment?.matchMode}
            options={[
              { value: "near", label: "Ones near the usual amount" },
              { value: "any", label: "Any charge from the merchant" },
            ]}
          />
        )}
        {!linked && (
          <TextField
            name="anchorDate"
            label="Next charge"
            type="date"
            defaultValue={payment?.anchorDate ?? ""}
          />
        )}
        <SelectField
          name="categoryId"
          label="Category"
          defaultValue={payment?.categoryId ?? ""}
          options={[
            { value: "", label: "None" },
            ...categories
              .filter((c) => c.type === "spending")
              .map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <SelectField
          name="accountId"
          label="Paid from"
          defaultValue={payment?.accountId ?? ""}
          options={[
            { value: "", label: "Not set" },
            ...accounts.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
      </div>
    </FormDialog>
  )
}
