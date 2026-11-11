import { cn } from "cn"
import { isInputError, type ActionError } from "astro:actions"
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactElement,
} from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { FieldError, FieldGroup } from "@/components/ui/field"
import { reloadWith } from "@/lib/reload"

type FieldErrors = Record<string, string[] | undefined>

const FieldErrorsContext = createContext<FieldErrors>({})

/** The error the server reported for one field of the surrounding form. */
export function useFieldError(name: string): string | undefined {
  return useContext(FieldErrorsContext)[name]?.[0]
}

/**
 * A dialog holding a form. `onSubmit` sends the form to an action; on success
 * the page reloads so it renders from the database and a toast confirms it,
 * and on failure the errors show beside their fields and the first one gets
 * focus. The title and buttons stay in view while a long form scrolls.
 */
export function FormDialog({
  title,
  description,
  trigger,
  submitLabel,
  successMessage = "Saved",
  onSubmit,
  open,
  onOpenChange,
  children,
  footer,
  wide = false,
  compact = false,
  inlineErrors = true,
  onClosed,
}: {
  title: string
  description?: string
  trigger?: ReactElement
  submitLabel: string
  /** The toast shown once the page reloads. */
  successMessage?: string
  onSubmit: (form: FormData) => Promise<{ error?: ActionError }>
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
  /** Extra buttons at the start of the footer, like Delete. */
  footer?: React.ReactNode
  wide?: boolean
  /** A form of a field or two, which stays a card on phones. */
  compact?: boolean
  /** Called once the dialog closes without saving, to reset its fields. */
  onClosed?: () => void
  /**
   * Whether errors show beside `TextField`s. Forms built from bare inputs show
   * the message by the buttons and mark the input whose `name` matches.
   */
  inlineErrors?: boolean
}) {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string>()
  /** Problems the server found in forms built from bare inputs, by field path. */
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([])
  const [attempt, setAttempt] = useState(0)
  const [pending, startTransition] = useTransition()
  const [innerOpen, setInnerOpen] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  /** Whether anything was typed or chosen since the dialog opened. */
  const dirty = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const errorId = `${useId()}-error`

  // Mark every problem under its own field, then point to the first one.
  useEffect(() => {
    const form = formRef.current
    if (!attempt || !form) return
    for (const marked of form.querySelectorAll("[data-marked-invalid]")) {
      marked.removeAttribute("aria-invalid")
      marked.removeAttribute("data-marked-invalid")
    }
    for (const field of form.querySelectorAll("[data-marked-field]")) {
      field.removeAttribute("data-invalid")
      field.removeAttribute("data-marked-field")
    }
    for (const note of form.querySelectorAll("[data-field-note]")) note.remove()
    let first = form.querySelector<HTMLElement>('[aria-invalid="true"]')
    issues.forEach((issue, index) => {
      // The most specific control the path names: "w4.extraWithholding",
      // then "w4", so a nested problem lands on its own field when it has one.
      // A form may wrap its fields in a group the controls don't name, like
      // "terms.bonuses.0.rate" for a control named "bonuses.0.rate", so
      // leading segments can drop too.
      const parts = issue.path.split(".")
      let target: HTMLElement | null = null
      for (let start = 0; start < parts.length && !target; start++) {
        for (let end = parts.length; end > start && !target; end--) {
          target = form.querySelector<HTMLElement>(
            `[name="${CSS.escape(parts.slice(start, end).join("."))}"]`
          )
        }
      }
      if (!target || target.hasAttribute("data-marked-invalid")) return
      const noteId = `${errorId}-${index}`
      target.setAttribute("aria-invalid", "true")
      target.setAttribute("data-marked-invalid", "")
      target.setAttribute("aria-describedby", noteId)
      // Its label turns red too, like fields the server names directly.
      const field = target.closest("[data-slot=field]")
      if (field && !field.hasAttribute("data-invalid")) {
        field.setAttribute("data-invalid", "true")
        field.setAttribute("data-marked-field", "")
      }
      // The message sits under its field, where the eye already is.
      const note = document.createElement("p")
      note.id = noteId
      note.dataset.fieldNote = ""
      note.className = "text-sm text-destructive"
      note.textContent = issue.message
      const anchor =
        target.closest("[data-slot=input-group]") ??
        target.closest("[data-slot=native-select-wrapper]") ??
        target
      anchor.after(note)
      first ??= target
    })
    // Open a folded section holding the field before pointing at it.
    const panel = first?.closest<HTMLElement>("[data-slot=collapsible-content]")
    if (panel && (panel.hidden || panel.hasAttribute("data-closed"))) {
      panel.parentElement
        ?.querySelector<HTMLElement>(":scope > [data-slot=collapsible-trigger]")
        ?.click()
    }
    requestAnimationFrame(() => {
      first?.focus()
      first?.scrollIntoView({ block: "center" })
    })
  }, [attempt, issues, errorId])

  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    startTransition(async () => {
      const { error } = await onSubmit(form)
      if (!error) return reloadWith(successMessage)
      if (isInputError(error) && !inlineErrors) {
        setFieldErrors({})
        const all = error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
        }))
        setIssues(all)
        // The footer sums up; each message also shows under its field.
        setFormError(
          all.length > 1
            ? `Fix the ${all.length} highlighted fields.`
            : all[0]?.message
        )
      } else if (isInputError(error)) {
        setFieldErrors(error.fields as FieldErrors)
        // Top-level problems show beside their fields. Problems inside lists,
        // like a card's bonus rows, are marked on the control named for them.
        const nested = error.issues
          .filter((issue) => issue.path.length > 1)
          .map((issue) => ({
            path: issue.path.map(String).join("."),
            message: issue.message,
          }))
        setIssues(nested)
        setFormError(
          nested.length > 1
            ? `Fix the ${nested.length} highlighted fields.`
            : (nested[0]?.message ??
                (Object.keys(error.fields).length
                  ? undefined
                  : error.issues[0]?.message))
        )
      } else {
        setFieldErrors({})
        setIssues([])
        setFormError(error.message)
      }
      setAttempt((n) => n + 1)
    })
  }

  function setOpen(next: boolean) {
    if (!next) {
      setFieldErrors({})
      setFormError(undefined)
      setIssues([])
    }
    dirty.current = false
    if (open === undefined) setInnerOpen(next)
    onOpenChange?.(next)
    if (!next) onClosed?.()
  }

  return (
    <>
      <Dialog
        open={open ?? innerOpen}
        onOpenChange={(next) => {
          // Closing with edits asks first, so a stray tap or Escape keeps them.
          if (!next && dirty.current && !pending) return setConfirmDiscard(true)
          setOpen(next)
        }}
      >
        {trigger && <DialogTrigger render={trigger} />}
        <DialogContent
          // On touch screens focus the dialog, not its first field, so the
          // keyboard doesn't cover the form before you've chosen what to change.
          initialFocus={(type) =>
            type === "touch"
              ? document.querySelector<HTMLElement>(
                  "[data-slot=dialog-content][data-open]"
                )
              : true
          }
          className={cn(
            "flex max-h-[90svh] flex-col gap-0 overflow-hidden p-0",
            // Phones get full-screen forms, so fields aren't cut off at the
            // footer; a form of a field or two stays a card.
            !compact &&
              "max-sm:h-svh max-sm:max-h-none max-sm:max-w-none max-sm:rounded-none",
            wide && "sm:max-w-2xl"
          )}
        >
          <form
            ref={formRef}
            onChange={() => (dirty.current = true)}
            onClick={(event) => {
              // Switches, toggles, and row buttons change the form without a change event.
              const control = (event.target as HTMLElement).closest(
                "[role=switch], [role=checkbox], [aria-pressed], [data-slot=toggle-group-item], button[type=button]:not([data-slot=dialog-close])"
              )
              if (
                control &&
                !control.closest("[data-slot=collapsible-trigger]")
              )
                dirty.current = true
            }}
            onSubmit={submit}
            className="flex min-h-0 flex-1 flex-col"
            noValidate
          >
            <DialogHeader className="px-6 pt-6 pr-14 pb-4">
              <DialogTitle className="text-xl">{title}</DialogTitle>
              {description && (
                <DialogDescription>{description}</DialogDescription>
              )}
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-1 pb-10">
              <FieldErrorsContext value={fieldErrors}>
                <FieldGroup>{children}</FieldGroup>
              </FieldErrorsContext>
            </div>
            <div className="grid gap-3 border-t px-6 py-4">
              {formError && <FieldError id={errorId}>{formError}</FieldError>}
              {/* Cancel and Save share a row even on phones; Delete sits apart. */}
              <DialogFooter className="flex-row flex-wrap items-center justify-end">
                {footer && (
                  <div className="max-sm:order-last max-sm:basis-full max-sm:border-t max-sm:pt-3 sm:mr-auto">
                    {footer}
                  </div>
                )}
                <DialogClose
                  render={
                    <Button variant="outline" className="flex-1 sm:flex-none" />
                  }
                >
                  Cancel
                </DialogClose>
                <Button
                  type="submit"
                  disabled={pending}
                  aria-busy={pending}
                  className="flex-1 sm:flex-none"
                >
                  {pending ? "Saving…" : submitLabel}
                </Button>
              </DialogFooter>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>
              What you entered in “{title}” hasn't been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmDiscard(false)
                setOpen(false)
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/**
 * Wraps a form dialog that keeps its fields in React state, so closing it
 * without saving starts the next open fresh instead of showing what was
 * discarded. The form gets `onClosed` to pass to its `FormDialog`.
 */
export function resetOnClose<P extends { onClosed: () => void }>(
  Form: React.ComponentType<P>
) {
  return function Resettable(props: Omit<P, "onClosed">) {
    const [key, setKey] = useState(0)
    return (
      <Form
        key={key}
        {...(props as P)}
        // After the closing animation, so the dialog doesn't vanish mid-fade.
        onClosed={() => setTimeout(() => setKey((k) => k + 1), 200)}
      />
    )
  }
}
