import {
  IconChevronRight,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"
import { actions } from "astro:actions"
import { useId, useState, type ReactElement } from "react"

import { FormDialog } from "@/components/form-dialog"
import { SelectField, TextField } from "@/components/form-fields"
import { ConfirmDelete } from "@/components/confirm-delete"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  CATEGORY_COLORS,
  CATEGORY_TYPE_DESCRIPTIONS,
  CATEGORY_TYPE_LABELS,
  CATEGORY_TYPES,
  categoryFill,
  type CategoryType,
} from "@/lib/categories"
import { checked, text } from "@/lib/form"
import type { Category } from "@/server/categories"

function CategoryDialog({
  category,
  categories,
  trigger,
}: {
  category?: Category
  categories: Category[]
  trigger: ReactElement
}) {
  const id = useId()
  const [hidden, setHidden] = useState(category?.hidden ?? false)
  // A new category gets the least-used color unless one is picked.
  const [color, setColor] = useState<number | null>(category?.color ?? null)
  return (
    <FormDialog
      compact
      title={category ? `Edit ${category.name}` : "Add a category"}
      trigger={trigger}
      submitLabel={category ? "Save" : "Add"}
      onSubmit={(form) => {
        const input = {
          name: category?.builtin ? category.name : text(form, "name"),
          type: text(form, "type") as CategoryType,
          hidden: checked(form, "hidden") || hidden,
          ...(color === null ? {} : { color }),
        }
        return category
          ? actions.updateCategory({ id: category.id, ...input })
          : actions.createCategory(input)
      }}
      footer={
        category &&
        !category.builtin && (
          <DeleteCategory category={category} categories={categories} />
        )
      }
    >
      {!category?.builtin && (
        <TextField
          name="name"
          label="Name"
          defaultValue={category?.name}
          required
        />
      )}
      <SelectField
        name="type"
        label="Type"
        defaultValue={category?.type ?? "spending"}
        options={CATEGORY_TYPES.map((type) => ({
          value: type,
          label: `${CATEGORY_TYPE_LABELS[type]}: ${CATEGORY_TYPE_DESCRIPTIONS[type]}`,
        }))}
      />
      <Field>
        <FieldLabel id={`${id}-color`}>Color</FieldLabel>
        <ToggleGroup
          aria-labelledby={`${id}-color`}
          value={color === null ? [] : [String(color)]}
          onValueChange={(value: string[]) => {
            if (value[0]) setColor(Number(value[0]))
          }}
          spacing={1}
          className="flex-wrap"
        >
          {CATEGORY_COLORS.map((option) => (
            <ToggleGroupItem
              key={option.color}
              value={String(option.color)}
              aria-label={option.name}
              className="size-10 rounded-full p-0 data-[pressed]:ring-2 data-[pressed]:ring-ring"
            >
              <span
                className={`size-5 rounded-full ${option.fill}`}
                aria-hidden="true"
              />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldDescription>
          {category
            ? "How it's marked in spending lists."
            : "How it's marked in spending lists. Left unpicked, it gets the color fewest categories use."}
        </FieldDescription>
      </Field>
      <Field orientation="horizontal">
        <Switch
          id={id}
          aria-labelledby={`${id}-label`}
          checked={hidden}
          onCheckedChange={setHidden}
        />
        <FieldLabel htmlFor={id} id={`${id}-label`}>
          Hide from category lists and AI instructions
        </FieldLabel>
      </Field>
    </FormDialog>
  )
}

function DeleteCategory({
  category,
  categories,
}: {
  category: Category
  categories: Category[]
}) {
  const [moveTo, setMoveTo] = useState("")
  const id = useId()
  return (
    <ConfirmDelete
      title={`Delete ${category.name}?`}
      description={
        category.transactionCount > 0
          ? `Its ${category.transactionCount.toLocaleString()} transactions move to the category you choose below.`
          : "No transactions use it."
      }
      onConfirm={() =>
        actions.deleteCategory({
          id: category.id,
          moveTo: moveTo === "" ? null : Number(moveTo),
        })
      }
      trigger={
        <Button type="button" variant="destructive" className="sm:mr-auto">
          <IconTrash />
          Delete
        </Button>
      }
    >
      {category.transactionCount > 0 && (
        <Field>
          <FieldLabel htmlFor={id} id={`${id}-label`}>
            Move transactions to
          </FieldLabel>
          <NativeSelect
            id={id}
            className="w-full"
            value={moveTo}
            onChange={(e) => setMoveTo(e.target.value)}
          >
            <NativeSelectOption value="">Choose a category</NativeSelectOption>
            {categories
              .filter((c) => c.id !== category.id)
              .map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </Field>
      )}
    </ConfirmDelete>
  )
}

function CategoryRow({
  category,
  categories,
  showType = false,
}: {
  category: Category
  categories: Category[]
  showType?: boolean
}) {
  return (
    <TableRow>
      <TableCell className="whitespace-normal">
        <span className="flex flex-wrap items-center gap-2">
          {category.type === "spending" && (
            <span
              className={`size-2.5 shrink-0 rounded-full ${categoryFill(category.color)}`}
              aria-hidden="true"
            />
          )}
          {category.name}
          {category.hidden && <Badge variant="outline">Hidden</Badge>}
        </span>
        {showType && (
          <span className="block text-sm text-muted-foreground">
            {CATEGORY_TYPE_LABELS[category.type]}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {category.transactionCount > 0 ? (
          <a
            href={`/transactions?category=${category.id}`}
            className="inline-flex min-h-10 min-w-11 items-center justify-end underline decoration-border underline-offset-4 hover:decoration-current"
          >
            {category.transactionCount.toLocaleString()}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <CategoryDialog
          category={category}
          categories={categories}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Edit ${category.name}`}
            >
              <IconPencil />
            </Button>
          }
        />
      </TableCell>
    </TableRow>
  )
}

function CategoryTable({ children }: { children: React.ReactNode }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Transactions</TableHead>
          <TableHead className="w-0">
            <span className="sr-only">Edit</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  )
}

/**
 * Settings list of transaction categories, grouped by type, with the ones no
 * transaction uses yet set apart so the lists show what's in use.
 */
export function CategorySettings({ categories }: { categories: Category[] }) {
  const unused = categories.filter((c) => c.transactionCount === 0)
  return (
    <div className="flex flex-col gap-8">
      <CategoryDialog
        categories={categories}
        trigger={
          <Button variant="outline" className="self-start">
            <IconPlus />
            Add category
          </Button>
        }
      />
      {CATEGORY_TYPES.map((type) => {
        const used = categories.filter(
          (c) => c.type === type && c.transactionCount > 0
        )
        if (used.length === 0) return null
        return (
          <div key={type} className="flex flex-col gap-2">
            <h3 className="font-medium">
              {CATEGORY_TYPE_LABELS[type]}
              <span className="block text-sm font-normal text-muted-foreground">
                {CATEGORY_TYPE_DESCRIPTIONS[type]}
              </span>
            </h3>
            <CategoryTable>
              {used.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  categories={categories}
                />
              ))}
            </CategoryTable>
          </div>
        )
      })}
      {unused.length > 0 && (
        <details className="group/unused flex flex-col gap-2">
          <summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
            <IconChevronRight
              className="mt-0.5 size-4 shrink-0 transition-transform group-open/unused:rotate-90"
              aria-hidden="true"
            />
            <span className="font-medium">
              Not used yet ({unused.length})
              <span className="block text-sm font-normal text-muted-foreground">
                Ready for transactions that need them, or to delete.
              </span>
            </span>
          </summary>
          <div className="pt-2">
            <CategoryTable>
              {unused.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  categories={categories}
                  showType
                />
              ))}
            </CategoryTable>
          </div>
        </details>
      )}
    </div>
  )
}
