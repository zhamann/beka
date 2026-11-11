import type { ActionError } from "astro:actions"
import { useState, useTransition, type ReactElement } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { FieldError } from "@/components/ui/field"
import { reloadWith } from "@/lib/reload"

/**
 * Asks before a destructive action. On success it goes to `then` (or reloads),
 * and on failure it shows the server's reason.
 */
export function ConfirmDelete({
  title,
  description,
  confirmLabel = "Delete",
  doneMessage = "Deleted",
  onConfirm,
  trigger,
  open,
  onOpenChange,
  then,
  children,
}: {
  title: string
  description: string
  confirmLabel?: string
  /** The toast shown once the page reloads. */
  doneMessage?: string
  onConfirm: () => Promise<{ error?: ActionError }>
  trigger?: ReactElement
  /** Set these to open it from elsewhere, like a menu. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  then?: string
  /** Extra fields shown above the buttons. */
  children?: React.ReactNode
}) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setError(undefined)
        onOpenChange?.(next)
      }}
    >
      {trigger && <AlertDialogTrigger render={trigger} />}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {error && <FieldError>{error}</FieldError>}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            // Solid, so the final step reads as the stronger choice.
            className="bg-destructive text-primary-foreground hover:bg-destructive/90"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault()
              startTransition(async () => {
                const { error } = await onConfirm()
                if (!error) return reloadWith(doneMessage, then)
                setError(error.message)
              })
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
