import {
  IconChevronRight,
  IconPencil,
  IconTrash,
  IconX,
} from "@tabler/icons-react"
import { actions } from "astro:actions"
import { Fragment, useState, useTransition } from "react"
import { cn } from "cn"
import { toast } from "sonner"

import { ConfirmDelete } from "@/components/confirm-delete"
import { TransactionDialog } from "@/components/transaction-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDayHeading } from "@/lib/dates"
import { formatMonth } from "@/lib/months"
import { reloadWith } from "@/lib/reload"
import { formatMoney } from "@/lib/money"
import type { Account } from "@/server/accounts"
import type { Category } from "@/server/categories"
import type { RecurringPayment } from "@/server/recurring"
import type { Transaction } from "@/server/transactions"

/** A page of transactions you can select to recategorize or delete together. */
export function TransactionTable({
  transactions,
  accounts,
  categories,
  recurring,
}: {
  transactions: Transaction[]
  accounts: Account[]
  categories: Category[]
  recurring: Pick<RecurringPayment, "id" | "name">[]
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editing, setEditing] = useState<Transaction>()
  const [editorOpen, setEditorOpen] = useState(false)
  const edit = (t: Transaction) => {
    setEditing(t)
    setEditorOpen(true)
  }
  const [categoryId, setCategoryId] = useState("")
  const [pending, startTransition] = useTransition()
  const allSelected =
    transactions.length > 0 && selected.size === transactions.length

  function toggle(id: number, on: boolean) {
    const next = new Set(selected)
    if (on) next.add(id)
    else next.delete(id)
    setSelected(next)
  }

  function move() {
    startTransition(async () => {
      const { error } = await actions.recategorize({
        ids: [...selected],
        categoryId: Number(categoryId),
      })
      if (error) toast.error(error.message)
      else
        reloadWith(
          `Moved ${selected.size} transaction${selected.size === 1 ? "" : "s"}`
        )
    })
  }

  return (
    <div className={cn("flex flex-col gap-3", selected.size > 0 && "pb-24")}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <Checkbox
                aria-label={`Select all ${transactions.length} on this page`}
                checked={allSelected}
                indeterminate={selected.size > 0 && !allSelected}
                onCheckedChange={(on) =>
                  setSelected(
                    on ? new Set(transactions.map((t) => t.id)) : new Set()
                  )
                }
              />
            </TableHead>
            <TableHead className="hidden w-24 @2xl:table-cell">Date</TableHead>
            <TableHead className="w-full @2xl:w-auto">Merchant</TableHead>
            <TableHead className="hidden @2xl:table-cell">Category</TableHead>
            <TableHead className="hidden @4xl:table-cell">Account</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="hidden w-0 @2xl:table-cell">
              <span className="sr-only">Edit</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((t, index) => (
            <Fragment key={t.id}>
              {/* Wider screens show the date in its own column, grouped by month. */}
              {t.date.slice(0, 7) !==
                transactions[index - 1]?.date.slice(0, 7) && (
                <TableRow className="hidden bg-muted/60 hover:bg-muted/60 @2xl:table-row">
                  <TableCell
                    colSpan={7}
                    className="py-2 text-sm font-medium text-muted-foreground"
                  >
                    {formatMonth(t.date.slice(0, 7), "long")}
                  </TableCell>
                </TableRow>
              )}
              {t.date !== transactions[index - 1]?.date && (
                <TableRow className="bg-muted/60 hover:bg-muted/60 @2xl:hidden">
                  <TableCell
                    colSpan={7}
                    className="py-2 text-sm font-medium text-muted-foreground"
                  >
                    {formatDayHeading(t.date)}
                  </TableCell>
                </TableRow>
              )}
              <TableRow
                data-state={selected.has(t.id) ? "selected" : undefined}
                className="cursor-pointer [&>td]:py-2 @2xl:[&>td]:py-3"
                onClick={(event) => {
                  // The checkbox and buttons do their own thing.
                  if (
                    (event.target as HTMLElement).closest(
                      "button, a, input, label, [role=checkbox]"
                    )
                  )
                    return
                  edit(t)
                }}
              >
                <TableCell>
                  {/* The whole cell selects, so the target isn't just the box. */}
                  <label className="-mx-3 -my-2 flex min-h-11 cursor-pointer items-center px-3 py-2">
                    <Checkbox
                      aria-label={`Select ${t.merchant} on ${t.date}`}
                      checked={selected.has(t.id)}
                      onCheckedChange={(on) => toggle(t.id, on)}
                    />
                  </label>
                </TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums @2xl:table-cell">
                  {formatDayHeading(t.date).replace(/^\w+, /, "")}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-col">
                    <Button
                      variant="link"
                      className="h-auto justify-start p-0 text-left text-sm/snug font-medium whitespace-normal text-foreground"
                      onClick={() => edit(t)}
                    >
                      {t.merchant}
                    </Button>
                    <span
                      className={cn(
                        "line-clamp-2 text-muted-foreground @2xl:line-clamp-none",
                        !(t.recurringName || t.notes) && "@4xl:hidden"
                      )}
                    >
                      <span className="@2xl:hidden">{t.categoryName}, </span>
                      <span className="@4xl:hidden">{t.accountName}</span>
                      {t.recurringName && (
                        <span>
                          <span className="@4xl:hidden">, </span>recurring
                        </span>
                      )}
                      {t.notes && (
                        <span className="block italic">{t.notes}</span>
                      )}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden @2xl:table-cell">
                  {t.categoryName}
                </TableCell>
                <TableCell className="hidden text-muted-foreground @4xl:table-cell">
                  {t.accountName}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    t.amount > 0 &&
                      t.categoryType === "income" &&
                      "font-medium text-primary",
                    // Transfers and card payments don't count anywhere.
                    t.categoryType === "excluded" && "text-muted-foreground"
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {t.amount > 0 && t.categoryType !== "income" && "+"}
                    {formatMoney(t.amount)}
                    <IconChevronRight
                      className="size-4 text-muted-foreground @2xl:hidden"
                      aria-hidden="true"
                    />
                  </span>
                </TableCell>
                <TableCell className="hidden @2xl:table-cell">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${t.merchant}`}
                    onClick={() => edit(t)}
                  >
                    <IconPencil />
                  </Button>
                </TableCell>
              </TableRow>
            </Fragment>
          ))}
        </TableBody>
      </Table>
      {selected.size > 0 && (
        // Pinned to the bottom of the screen so the rows don't jump when it appears.
        <div
          role="region"
          aria-label="Selected transactions"
          aria-live="polite"
          className="fixed inset-x-2 bottom-20 z-30 mx-auto flex flex-wrap items-center gap-2 rounded-2xl border bg-popover p-2 shadow-lg sm:inset-x-0 sm:w-fit sm:max-w-[calc(100%-2rem)] md:bottom-6"
        >
          <span className="px-2 text-sm font-medium">
            {selected.size} selected
            {allSelected && transactions.length > 1 && " on this page"}
          </span>
          <div className="min-w-0 basis-full sm:w-56 sm:basis-auto">
            <NativeSelect
              aria-label="New category"
              className="w-full"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <NativeSelectOption value="">Move to…</NativeSelectOption>
              {categories.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {categoryId && (
            <Button size="sm" disabled={pending} onClick={move}>
              Change category
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-label="Clear selection"
            onClick={() => setSelected(new Set())}
          >
            <IconX />
            Clear
          </Button>
          <ConfirmDelete
            title={
              selected.size === 1
                ? "Delete this transaction?"
                : `Delete ${selected.size} transactions?`
            }
            description={
              selected.size === 1
                ? "It's removed from Spending and its import."
                : "They're removed from Spending and their imports."
            }
            onConfirm={() => actions.deleteTransactions({ ids: [...selected] })}
            trigger={
              <Button size="sm" variant="ghost">
                <IconTrash />
                Delete
              </Button>
            }
          />
        </div>
      )}
      {editing && (
        <TransactionDialog
          key={editing.id}
          transaction={editing}
          accounts={accounts}
          categories={categories}
          recurring={recurring}
          open={editorOpen}
          onOpenChange={setEditorOpen}
        />
      )}
    </div>
  )
}
