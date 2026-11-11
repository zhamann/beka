import {
  IconCalendarOff,
  IconCheck,
  IconCreditCard,
  IconDots,
  IconListDetails,
  IconPencil,
  IconX,
} from "@tabler/icons-react"
import { actions, type ActionError } from "astro:actions"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { RecurringDialog } from "@/components/recurring-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { reloadWith, type Undo } from "@/lib/reload"
import type { Account } from "@/server/accounts"
import type { Category } from "@/server/categories"
import type { RecurringPayment } from "@/server/recurring"

type Kind = "suggestion" | "overdue" | "active" | "ended"

/** The quick decisions on a recurring payment, by where it's listed. */
export function RecurringButtons({
  id,
  kind,
  name = "It",
}: {
  id: number
  kind: Kind
  /** The payment's name, for its toast. */
  name?: string
}) {
  const [pending, startTransition] = useTransition()
  const act = (
    call: () => Promise<{ error?: ActionError }>,
    done: string,
    undo?: Undo
  ) =>
    startTransition(async () => {
      const { error } = await call()
      if (error) toast.error(error.message)
      else reloadWith(done, undefined, undo)
    })
  const restart: Undo = { action: "restartRecurring", input: { id } }

  if (kind === "suggestion") {
    return (
      <>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            act(() => actions.confirmRecurring({ id }), "Marked as recurring")
          }
        >
          <IconCheck />
          Yes, it repeats
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            act(
              () => actions.dismissRecurring({ id }),
              `${name} won't be suggested again`,
              { action: "restoreSuggestion", input: { id } }
            )
          }
        >
          <IconX />
          Not recurring
        </Button>
      </>
    )
  }
  if (kind === "overdue") {
    return (
      <>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            act(() => actions.endRecurring({ id }), "Ended", restart)
          }
        >
          It ended
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => act(() => actions.keepRecurring({ id }), "Kept")}
        >
          Still going
        </Button>
      </>
    )
  }
  if (kind === "ended") {
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => act(() => actions.restartRecurring({ id }), "Restarted")}
      >
        Restart
      </Button>
    )
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => act(() => actions.endRecurring({ id }), "Ended", restart)}
    >
      End
    </Button>
  )
}

/**
 * One menu for a payment's row on Recurring: edit or end it, or, for a card's
 * annual fee, go to the card where the fee is set.
 */
export function RecurringRowMenu({
  payment,
  categories,
  accounts,
}: {
  payment: RecurringPayment
  categories: Category[]
  accounts: Account[]
}) {
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const end = () =>
    startTransition(async () => {
      const { error } = await actions.endRecurring({ id: payment.id })
      if (error) toast.error(error.message)
      else
        reloadWith(`Ended ${payment.name}`, undefined, {
          action: "restartRecurring",
          input: { id: payment.id },
        })
    })
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              disabled={pending}
              aria-label={`Actions for ${payment.name}`}
            />
          }
        >
          <IconDots />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            render={<a href={`/transactions?payment=${payment.id}`} />}
          >
            <IconListDetails />
            See charges
          </DropdownMenuItem>
          {payment.cardId === null ? (
            <>
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <IconPencil />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={end}>
                <IconCalendarOff />
                It ended
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem
              render={<a href={`/accounts/${payment.cardId}`} />}
            >
              <IconCreditCard />
              Edit on the card
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {payment.cardId === null && (
        <RecurringDialog
          payment={payment}
          categories={categories}
          accounts={accounts}
          open={editing}
          onOpenChange={setEditing}
        />
      )}
    </>
  )
}
