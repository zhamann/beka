import {
  IconAlertTriangle,
  IconFileUpload,
  IconPlus,
} from "@tabler/icons-react"
import { actions } from "astro:actions"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldError } from "@/components/ui/field"
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ACCOUNT_KIND_LABELS, type AccountKind } from "@/lib/accounts"
import { formatShortDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { reloadWith } from "@/lib/reload"
import type { Account } from "@/server/accounts"
import type { Category } from "@/server/categories"
import type { Preview, PreviewRow } from "@/server/imports"

/** Rows shown at a time; "Show more" adds this many again. */
const PAGE = 100

const DRAFT_KEY = "beka:import-draft"

/** The upload left in progress this session, if any. */
function readDraft(): Draft | undefined {
  try {
    if (typeof sessionStorage === "undefined") return undefined
    const saved = sessionStorage.getItem(DRAFT_KEY)
    return saved ? (JSON.parse(saved) as Draft) : undefined
  } catch {
    return undefined
  }
}

/** An upload in progress, kept so it survives leaving the page. */
interface Draft {
  name: string
  text: string
  overrides: Record<number, number>
  accountFor: Record<string, number>
  unflagged: number[]
  leftOut?: number[]
  keepPossible?: number[]
}

/** Account kinds an import can add on the spot; cards and loans need their terms. */
const NEW_KINDS: AccountKind[] = [
  "checking",
  "savings",
  "brokerage",
  "retirement",
  "hsa",
]

const count = (n: number, noun: string) =>
  `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`

/** Picks a CSV, previews it, lets you fix categories, then imports it. */
export function ImportUploader({
  categories: initialCategories,
  accounts: initialAccounts,
}: {
  categories: Category[]
  accounts: Pick<Account, "id" | "name">[]
}) {
  const [accounts, setAccounts] = useState(initialAccounts)
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<{ name: string; text: string }>()
  const [preview, setPreview] = useState<Preview>()
  const [categories, setCategories] = useState(initialCategories)
  const [overrides, setOverrides] = useState<Record<number, number>>(
    () => readDraft()?.overrides ?? {}
  )
  /** Unknown account names in the file, mapped to an existing account. */
  const [accountFor, setAccountFor] = useState<Record<string, number>>(
    () => readDraft()?.accountFor ?? {}
  )
  const [shown, setShown] = useState(PAGE)
  const [showAll, setShowAll] = useState(false)
  const [keepPossible, setKeepPossible] = useState<Set<number>>(
    () => new Set(readDraft()?.keepPossible)
  )
  /** Lines with problems someone chose to skip rather than fix. */
  const [leftOut, setLeftOut] = useState<Set<number>>(
    () => new Set(readDraft()?.leftOut)
  )
  const [unflagged, setUnflagged] = useState<Set<number>>(
    () => new Set(readDraft()?.unflagged)
  )
  const [error, setError] = useState<string>()
  /** Whether the preview came back from an earlier visit this session. */
  const [restored, setRestored] = useState(false)
  const [pending, startTransition] = useTransition()

  /** Previews `text`. Reloading the same file keeps the corrections made so far. */
  function load(name: string, text: string, keep = false) {
    setError(undefined)
    startTransition(async () => {
      const { data, error } = await actions.previewImport({ csv: text })
      if (error) return setError(error.message)
      setFile({ name, text })
      setPreview(data)
      if (keep) return
      setKeepPossible(new Set())
      setLeftOut(new Set())
      setOverrides({})
      setAccountFor({})
      setUnflagged(new Set())
      setShowAll(false)
      setShown(PAGE)
    })
  }

  // The file and its corrections survive leaving the page (to add a card,
  // say) for the rest of the browser session.
  useEffect(() => {
    const draft = readDraft()
    // Preview it again once mounted; its corrections came back with the state.
    if (draft)
      queueMicrotask(() => {
        setRestored(true)
        load(draft.name, draft.text, true)
      })
    // Restore once, on arrival.
  }, [])
  useEffect(() => {
    if (!file) return
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          ...file,
          overrides,
          accountFor,
          unflagged: [...unflagged],
          leftOut: [...leftOut],
          keepPossible: [...keepPossible],
        } satisfies Draft)
      )
    } catch {
      // Too big to keep, or storage is off; the draft just won't survive.
    }
  }, [file, overrides, accountFor, unflagged, leftOut, keepPossible])

  /** Drops the upload in progress and its corrections. */
  function discard() {
    try {
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      // Nothing saved to clear.
    }
    setFile(undefined)
    setPreview(undefined)
    setOverrides({})
    setAccountFor({})
    setUnflagged(new Set())
    setKeepPossible(new Set())
    setRestored(false)
    if (fileInput.current) fileInput.current.value = ""
  }

  async function pick(picked: File | undefined) {
    if (picked) load(picked.name, await picked.text())
  }

  /** Adds an account the file names, then points its rows at it. */
  function createAccount(name: string, kind: AccountKind) {
    startTransition(async () => {
      const { data, error } = await actions.createAccount({
        name,
        kind,
        subtype: "",
        institution: "",
        last4: "",
        ownerId: null,
        notes: "",
        balance: null,
      })
      if (error) return setError(error.message)
      setAccounts((list) =>
        [...list, { id: data.id, name: data.name }].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      )
      setAccountFor((current) => ({ ...current, [name]: data.id }))
      toast.success(`Added ${data.name}`)
    })
  }

  function createCategory(name: string) {
    startTransition(async () => {
      const { data, error } = await actions.createCategory({
        name,
        type: "spending",
        hidden: false,
      })
      if (error) return setError(error.message)
      setCategories((list) =>
        [...list, data].sort((a, b) => a.name.localeCompare(b.name))
      )
      if (file) load(file.name, file.text, true)
    })
  }

  const rows = useMemo(
    () =>
      preview?.rows.map((original) => {
        let row = original
        const mapped =
          row.accountId === null ? accountFor[row.account] : undefined
        if (mapped !== undefined) {
          row = {
            ...row,
            accountId: mapped,
            account: accounts.find((a) => a.id === mapped)!.name,
            errors: row.errors.filter((e) => !e.includes("account")),
          }
        }
        const override = overrides[row.line]
        if (override === undefined) return row
        const category = categories.find((c) => c.id === override)!
        return {
          ...row,
          categoryId: override,
          category: category.name,
          errors: row.errors.filter((e) => !e.includes("category")),
          usualCategory:
            row.usualCategory === category.name ? null : row.usualCategory,
        }
      }) ?? [],
    [preview, overrides, categories, accountFor, accounts]
  )
  // Rows with problems block the import until fixed or left out.
  const problems = rows.filter(
    (row) => row.errors.length > 0 && !leftOut.has(row.line)
  )
  // An unknown category stops mattering once every row using it is fixed.
  const unresolvedCategories =
    preview?.unknownCategories.filter((name) =>
      rows.some((row) => row.categoryId === null && row.category === name)
    ) ?? []
  const duplicates = rows.filter(
    (row) => row.duplicate && row.errors.length === 0
  )
  // A possible duplicate is skipped unless someone says to import it anyway.
  const skipped = (row: PreviewRow) =>
    row.duplicate || (row.possibleDuplicate && !keepPossible.has(row.line))
  const possible = rows.filter((row) => row.possibleDuplicate)
  const ready = rows.filter((row) => !skipped(row) && row.errors.length === 0)
  // What the new rows add up to, to catch flipped signs or wrong amounts.
  const readyDates = ready.map((row) => row.date).sort()
  const firstDate = readyDates[0] ?? ""
  const lastDate = readyDates.at(-1) ?? ""
  const moneyIn = ready.reduce((t, r) => t + Math.max(r.amount, 0), 0)
  const moneyOut = ready.reduce((t, r) => t + Math.min(r.amount, 0), 0)
  const flagged = rows.filter(
    (row) => row.errors.length > 0 || row.usualCategory || row.possibleDuplicate
  )
  const listed = showAll ? rows : flagged

  // A category picker only helps when nothing but the category is wrong.
  const categoryHelps = (row: PreviewRow) =>
    row.errors.every((message) => message.includes("category"))
  const categorySelect = (row: PreviewRow) => (
    <NativeSelect
      aria-label={`Category for line ${row.line}`}
      className="w-full"
      value={row.categoryId ?? ""}
      onChange={(event) =>
        setOverrides((current) => ({
          ...current,
          [row.line]: Number(event.target.value),
        }))
      }
    >
      {row.categoryId === null && (
        <NativeSelectOption value="">Choose…</NativeSelectOption>
      )}
      {categories.map((category) => (
        <NativeSelectOption key={category.id} value={category.id}>
          {category.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )

  function importRows() {
    if (!file) return
    startTransition(async () => {
      const { data, error } = await actions.importTransactions({
        fileName: file.name,
        rows: rows
          .filter((row) => row.errors.length === 0 && !skipped(row))
          .map((row) => ({
            date: row.date,
            merchant: row.merchant,
            description: row.description,
            amount: row.amount,
            categoryId: row.categoryId!,
            accountId: row.accountId!,
            notes: row.notes,
            notRecurring: unflagged.has(row.line),
          })),
      })
      if (error) return setError(error.message)
      try {
        sessionStorage.removeItem(DRAFT_KEY)
      } catch {
        // Nothing to clear.
      }
      reloadWith(
        `Imported ${count(data.added, "transaction")}${data.skipped ? `; skipped ${count(data.skipped, "duplicate")}` : ""}`,
        undefined,
        data.importId === null
          ? undefined
          : { action: "undoImport", input: { id: data.importId } }
      )
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        aria-label="CSV file to import"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          pick(event.target.files?.[0])
          event.target.value = ""
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => fileInput.current?.click()} disabled={pending}>
          <IconFileUpload />
          {file ? "Choose another file" : "Choose a CSV file"}
        </Button>
        {file && (
          <>
            <span className="text-sm text-muted-foreground">
              {file.name}
              {restored && ", picked up where you left off"}
            </span>
            <Button variant="ghost" size="sm" onClick={discard}>
              Discard
            </Button>
          </>
        )}
      </div>
      {error && <FieldError>{error}</FieldError>}
      {preview?.fileError && (
        <Alert variant="destructive">
          <IconAlertTriangle />
          <AlertTitle>This file can't be imported</AlertTitle>
          <AlertDescription className="break-words">
            {preview.fileError}
          </AlertDescription>
        </Alert>
      )}
      {preview && !preview.fileError && (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{count(rows.length, "row")}</Badge>
            <Badge>{count(ready.length, "new transaction")}</Badge>
            {possible.length > 0 && (
              <Badge variant="outline">
                {count(possible.length, "possible duplicate")}
              </Badge>
            )}
            {duplicates.length > 0 && (
              <Badge variant="outline">
                {count(duplicates.length, "duplicate")} to skip
              </Badge>
            )}
            {problems.length > 0 && (
              <Badge variant="destructive">
                {count(problems.length, "row")} to fix
              </Badge>
            )}
          </div>
          {ready.length > 0 && (
            <p className="text-sm text-muted-foreground">
              New transactions{" "}
              {firstDate === lastDate
                ? `on ${formatShortDate(firstDate)}`
                : `from ${formatShortDate(firstDate)} to ${formatShortDate(lastDate)}`}
              :{" "}
              {[
                moneyIn > 0 && `${formatMoney(moneyIn)} in`,
                moneyOut < 0 && `${formatMoney(-moneyOut)} out`,
                moneyIn > 0 &&
                  moneyOut < 0 &&
                  `${formatMoney(moneyIn + moneyOut)} net`,
              ]
                .filter(Boolean)
                .join(", ")}
              .
            </p>
          )}
          {unresolvedCategories.length > 0 && (
            <Alert>
              <AlertTitle>Unknown categories</AlertTitle>
              <AlertDescription className="flex flex-col gap-2">
                <span>
                  Create them as Spending categories, or pick an existing
                  category for each row below.
                </span>
                <div className="flex flex-wrap gap-2">
                  {unresolvedCategories.map((name) => (
                    <Button
                      key={name}
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => createCategory(name)}
                    >
                      <IconPlus />
                      {name}
                    </Button>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}
          {preview.unknownAccounts.length > 0 && (
            <Alert>
              <AlertTitle id="unknown-accounts">Unknown accounts</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <span>
                  Pick the account each name means, or add it as a new one here.
                  A new card or loan goes on the <a href="/cards">Cards</a> or{" "}
                  <a href="/loans">Loans</a> page. This upload and your fixes
                  are kept, so come back here and pick the new account.
                </span>
                {preview.unknownAccounts.map((name) => (
                  <div
                    key={name}
                    className="grid gap-2 @xl:grid-cols-[minmax(0,12rem)_1fr] @xl:items-center"
                  >
                    <span className="font-medium text-foreground">
                      “{name}”
                    </span>
                    <NativeSelect
                      aria-label={`Account for “${name}”`}
                      className="w-full"
                      value={accountFor[name] ?? ""}
                      disabled={pending}
                      onChange={(event) => {
                        const choice = event.target.value
                        if (choice.startsWith("new:"))
                          createAccount(name, choice.slice(4) as AccountKind)
                        else
                          setAccountFor((current) => ({
                            ...current,
                            [name]: Number(choice),
                          }))
                      }}
                    >
                      <NativeSelectOption value="">
                        Choose an account
                      </NativeSelectOption>
                      <NativeSelectOptGroup label="Your accounts">
                        {accounts.map((account) => (
                          <NativeSelectOption
                            key={account.id}
                            value={account.id}
                          >
                            {account.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelectOptGroup>
                      <NativeSelectOptGroup label={`Add “${name}” as a new`}>
                        {NEW_KINDS.map((kind) => (
                          <NativeSelectOption key={kind} value={`new:${kind}`}>
                            {ACCOUNT_KIND_LABELS[kind]} account
                          </NativeSelectOption>
                        ))}
                      </NativeSelectOptGroup>
                    </NativeSelect>
                  </div>
                ))}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {showAll
                ? "Every row in the file."
                : flagged.length
                  ? "Rows with problems, and rows categorized differently than usual."
                  : "Nothing needs a look."}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAll(!showAll)
                setShown(PAGE)
              }}
            >
              {showAll ? "Show rows that need a look" : "Show every row"}
            </Button>
          </div>
          {listed.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="hidden w-14 @xl:table-cell">
                    Line
                  </TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="hidden w-56 @2xl:table-cell">
                    Category
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listed.slice(0, shown).map((row: PreviewRow) => (
                  <TableRow key={row.line}>
                    <TableCell className="hidden align-top text-muted-foreground @xl:table-cell">
                      {row.line}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-col gap-1">
                        <span>
                          <span className="text-muted-foreground @xl:hidden">
                            Line {row.line}:{" "}
                          </span>
                          {row.merchant || "—"}
                          <span className="text-muted-foreground">
                            {", "}
                            {/^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
                            !row.errors.some((e) => e.includes("isn't a date"))
                              ? formatShortDate(row.date)
                              : row.date}
                            {", "}
                            {row.account}
                          </span>
                        </span>
                        {(row.description || row.notes) && (
                          <span className="text-sm break-words text-muted-foreground">
                            {[row.description, row.notes]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        )}
                        {row.errors.map((message) => (
                          <span
                            key={message}
                            className="text-sm text-destructive"
                          >
                            {message}
                          </span>
                        ))}
                        {row.errors.length > 0 && (
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={leftOut.has(row.line)}
                              onCheckedChange={(on) =>
                                setLeftOut((current) => {
                                  const next = new Set(current)
                                  if (on) next.add(row.line)
                                  else next.delete(row.line)
                                  return next
                                })
                              }
                            />
                            Leave this row out, or fix line {row.line} in the
                            file and choose it again
                          </label>
                        )}
                        {row.accountId === null &&
                          preview?.unknownAccounts.includes(row.account) && (
                            <a
                              href="#unknown-accounts"
                              className="text-sm text-primary underline"
                            >
                              Choose its account above
                            </a>
                          )}
                        {row.usualCategory && (
                          <span className="text-sm text-muted-foreground">
                            Usually {row.usualCategory}
                          </span>
                        )}
                        {row.recurring && (
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Checkbox
                              checked={!unflagged.has(row.line)}
                              onCheckedChange={(on) =>
                                setUnflagged((current) => {
                                  const next = new Set(current)
                                  if (on) next.delete(row.line)
                                  else next.add(row.line)
                                  return next
                                })
                              }
                            />
                            Recurring: {row.recurring.name}
                          </label>
                        )}
                        {row.duplicate && (
                          <Badge variant="outline">Already imported</Badge>
                        )}
                        {row.possibleDuplicate && (
                          <span className="flex flex-col gap-1 text-sm">
                            <span className="text-muted-foreground">
                              A {row.merchant} charge for this amount on this
                              day is already imported, with a different bank
                              description. It's skipped unless you keep it.
                            </span>
                            <label className="flex items-center gap-2">
                              <Checkbox
                                checked={keepPossible.has(row.line)}
                                onCheckedChange={(on) =>
                                  setKeepPossible((current) => {
                                    const next = new Set(current)
                                    if (on) next.add(row.line)
                                    else next.delete(row.line)
                                    return next
                                  })
                                }
                              />
                              Import it anyway
                            </label>
                          </span>
                        )}
                        <div className="pt-1 @2xl:hidden">
                          {categoryHelps(row) && categorySelect(row)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums">
                      {row.errors.some((e) => e.includes("isn't an amount")) ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        formatMoney(row.amount)
                      )}
                    </TableCell>
                    <TableCell className="hidden align-top @2xl:table-cell">
                      {categoryHelps(row) && categorySelect(row)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {listed.length > shown && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">
                Showing {shown.toLocaleString()} of{" "}
                {listed.length.toLocaleString()} rows.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShown((n) => n + PAGE)}
              >
                Show {Math.min(PAGE, listed.length - shown).toLocaleString()}{" "}
                more
              </Button>
            </div>
          )}
          <Button
            className="self-start"
            // While it can't import yet it's an outline, so it doesn't read as
            // a faded primary.
            variant={
              problems.length > 0 || ready.length === 0 ? "outline" : "default"
            }
            disabled={pending || problems.length > 0 || ready.length === 0}
            onClick={importRows}
          >
            {problems.length > 0
              ? `Fix ${count(problems.length, "row")} to import`
              : ready.length === 0
                ? "Nothing new to import"
                : `Import ${count(ready.length, "transaction")}`}
          </Button>
        </>
      )}
    </div>
  )
}
