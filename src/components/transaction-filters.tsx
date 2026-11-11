import { IconAdjustmentsHorizontal } from "@tabler/icons-react"
import { cn } from "cn"
import { useId, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { formatMonth } from "@/lib/months"

interface Option {
  id: number
  name: string
}

/**
 * Search and filter menus for Transactions. Menus apply as soon as they
 * change; on phones they fold behind a Filters button. Range and recurring
 * filters that came from another page ride along as hidden fields.
 */
export function TransactionFilters({
  search,
  month,
  categoryId,
  accountId,
  months,
  categories,
  accounts,
  hidden,
}: {
  search?: string
  month?: string
  categoryId?: number
  accountId?: number
  months: string[]
  categories: Option[]
  accounts: Option[]
  /** Other filters to keep, by query parameter. */
  hidden: Record<string, string>
}) {
  const form = useRef<HTMLFormElement>(null)
  const active = [month, categoryId, accountId].filter(
    (v) => v !== undefined
  ).length
  const [open, setOpen] = useState(active > 0)
  const menusId = useId()
  const apply = () => form.current?.requestSubmit()
  const menus = (
    <>
      <NativeSelect
        name="month"
        aria-label="Month"
        className="w-full"
        defaultValue={month ?? ""}
        onChange={apply}
      >
        <NativeSelectOption value="">All months</NativeSelectOption>
        {months.map((m) => (
          <NativeSelectOption key={m} value={m}>
            {formatMonth(m, "long")}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect
        name="category"
        aria-label="Category"
        className="w-full"
        defaultValue={categoryId ?? ""}
        onChange={apply}
      >
        <NativeSelectOption value="">All categories</NativeSelectOption>
        {categories.map((c) => (
          <NativeSelectOption key={c.id} value={c.id}>
            {c.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect
        name="account"
        aria-label="Account"
        className="w-full"
        defaultValue={accountId ?? ""}
        onChange={apply}
      >
        <NativeSelectOption value="">All accounts</NativeSelectOption>
        {accounts.map((a) => (
          <NativeSelectOption key={a.id} value={a.id}>
            {a.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </>
  )
  return (
    <form
      ref={form}
      method="get"
      role="search"
      aria-label="Filter transactions"
      className="flex flex-col gap-2 @5xl:flex-row"
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="flex min-w-0 gap-2 @5xl:flex-1">
        <Input
          className="min-w-0 flex-1"
          name="q"
          type="search"
          aria-label="Search"
          placeholder="Search transactions"
          defaultValue={search ?? ""}
        />
        <Button type="submit">Search</Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative @2xl:hidden"
          aria-label={active > 0 ? `Filters, ${active} on` : "Filters"}
          aria-expanded={open}
          aria-controls={menusId}
          onClick={() => setOpen(!open)}
        >
          <IconAdjustmentsHorizontal />
          {active > 0 && (
            <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {active}
            </span>
          )}
        </Button>
      </div>
      <div className="flex flex-col gap-2 @5xl:w-[36rem]">
        {/* Folded on phones only; CSS hides it, so it never flashes open. */}
        <div
          id={menusId}
          className={cn(
            "grid gap-2 @2xl:grid-cols-3",
            !open && "@max-2xl:hidden"
          )}
        >
          {menus}
        </div>
      </div>
    </form>
  )
}
