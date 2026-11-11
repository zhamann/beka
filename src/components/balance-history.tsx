import { IconPencil, IconTrash } from "@tabler/icons-react"
import { actions } from "astro:actions"

import { ConfirmDelete } from "@/components/confirm-delete"
import { FormDialog } from "@/components/form-dialog"
import { TextField } from "@/components/form-fields"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate, formatDateTime } from "@/lib/dates"
import { optionalNumber, text } from "@/lib/form"
import { centsToInput, formatMoney } from "@/lib/money"
import type { Balance } from "@/server/accounts"

export function BalanceHistory({ balances }: { balances: Balance[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>As of</TableHead>
          <TableHead className="hidden text-right @md:table-cell">
            Amount
          </TableHead>
          <TableHead className="w-0">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {balances.map((balance) => (
          <TableRow key={balance.id}>
            <TableCell className="whitespace-normal">
              {formatDate(balance.asOf)}
              <span className="block font-medium tabular-nums @md:hidden">
                {formatMoney(balance.amount)}
              </span>
              <span className="block text-sm text-muted-foreground">
                Entered{" "}
                <span className="whitespace-nowrap">
                  {formatDateTime(balance.recordedAt)}
                </span>
              </span>
            </TableCell>
            <TableCell className="hidden text-right tabular-nums @md:table-cell">
              {formatMoney(balance.amount)}
            </TableCell>
            <TableCell>
              <div className="flex justify-end">
                <FormDialog
                  compact
                  title={`Correct the balance from ${formatDate(balance.asOf)}`}
                  description="For a typo. To record a new balance, use Update balance instead."
                  submitLabel="Save"
                  successMessage="Balance corrected"
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Correct the ${formatMoney(balance.amount)} balance from ${formatDate(balance.asOf)}`}
                    >
                      <IconPencil />
                    </Button>
                  }
                  onSubmit={(form) =>
                    actions.updateBalance({
                      id: balance.id,
                      amount: optionalNumber(form, "amount") ?? NaN,
                      asOf: text(form, "asOf"),
                    })
                  }
                >
                  <div className="grid items-start gap-4 sm:grid-cols-2">
                    <TextField
                      name="amount"
                      label="Amount"
                      money
                      defaultValue={centsToInput(balance.amount)}
                    />
                    <TextField
                      name="asOf"
                      label="As of"
                      type="date"
                      defaultValue={balance.asOf}
                    />
                  </div>
                </FormDialog>
                <ConfirmDelete
                  title={`Delete the ${formatMoney(balance.amount)} balance from ${formatDate(balance.asOf)}?`}
                  description="It's removed from the account's history. To fix a typo, use the pencil instead."
                  onConfirm={() => actions.deleteBalance({ id: balance.id })}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete the ${formatMoney(balance.amount)} balance from ${formatDate(balance.asOf)}`}
                    >
                      <IconTrash />
                    </Button>
                  }
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
