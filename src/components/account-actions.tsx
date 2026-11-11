import {
  IconArchive,
  IconArchiveOff,
  IconDots,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react"
import { actions } from "astro:actions"
import { useState, useTransition, type ReactElement } from "react"
import { toast } from "sonner"

import { BalanceDialog } from "@/components/balance-dialog"
import { ConfirmDelete } from "@/components/confirm-delete"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Account } from "@/server/accounts"
import { reloadWith } from "@/lib/reload"

/** Update, edit, archive, and delete buttons for an account's page. */
export function AccountActions({
  account,
  editDialog,
  backTo,
}: {
  account: Account
  /** The kind-specific edit dialog, given its trigger. */
  editDialog: (trigger: ReactElement) => ReactElement
  /** Where to go after deleting. */
  backTo: string
}) {
  const [pending, startTransition] = useTransition()
  const [deleting, setDeleting] = useState(false)
  // Links ending in #update, like the Dashboard's reminders, open the dialog.
  const [updating, setUpdating] = useState(
    () => typeof location !== "undefined" && location.hash === "#update"
  )

  function archive(archived: boolean) {
    startTransition(async () => {
      const { error } = await actions.archiveAccount({
        id: account.id,
        archived,
      })
      if (error) toast.error(error.message)
      else reloadWith(archived ? "Archived" : "Restored")
    })
  }

  return (
    <>
      <BalanceDialog
        account={account}
        open={updating}
        onOpenChange={setUpdating}
        trigger={<Button>Update balance</Button>}
      />
      {editDialog(
        <Button variant="outline">
          <IconPencil />
          Edit
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              disabled={pending}
              aria-label={`More actions for ${account.name}`}
            />
          }
        >
          <IconDots />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => archive(!account.archivedAt)}>
            {account.archivedAt ? <IconArchiveOff /> : <IconArchive />}
            {account.archivedAt ? "Restore" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleting(true)}
          >
            <IconTrash />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDelete
        title={`Delete ${account.name}?`}
        description="This deletes the account and its balance history. Accounts with transactions or income linked to them can only be archived."
        onConfirm={() => actions.deleteAccount({ id: account.id })}
        then={backTo}
        open={deleting}
        onOpenChange={setDeleting}
      />
    </>
  )
}
