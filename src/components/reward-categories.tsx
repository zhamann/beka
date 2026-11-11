import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react"
import { actions } from "astro:actions"
import type { ReactElement } from "react"

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
import { text } from "@/lib/form"
import type { RewardCategory } from "@/server/cards"

function RewardCategoryDialog({
  category,
  trigger,
}: {
  category?: RewardCategory
  trigger: ReactElement
}) {
  return (
    <FormDialog
      compact
      title={category ? `Edit ${category.name}` : "Add a reward category"}
      description="Categories card issuers pay bonuses on, or a specific merchant like Amazon."
      trigger={trigger}
      submitLabel={category ? "Save" : "Add"}
      onSubmit={(form) => {
        const name = text(form, "name")
        return category
          ? actions.renameRewardCategory({ id: category.id, name })
          : actions.createRewardCategory({ name })
      }}
      footer={
        category && (
          <ConfirmDelete
            title={`Delete ${category.name}?`}
            description="Categories that cards still earn bonuses on can't be deleted."
            onConfirm={() => actions.deleteRewardCategory({ id: category.id })}
            trigger={
              <Button
                type="button"
                variant="destructive"
                className="sm:mr-auto"
              >
                <IconTrash />
                Delete
              </Button>
            }
          />
        )
      }
    >
      <TextField
        name="name"
        label="Name"
        defaultValue={category?.name}
        required
      />
    </FormDialog>
  )
}

/** Settings list of reward categories used by card bonuses. */
export function RewardCategories({
  categories,
  earnedBy = {},
}: {
  categories: RewardCategory[]
  /** The cards that earn a bonus in each category, by its id. */
  earnedBy?: Record<number, string[]>
}) {
  return (
    <div className="flex flex-col gap-3">
      <RewardCategoryDialog
        trigger={
          <Button variant="outline" className="self-start">
            <IconPlus />
            Add reward category
          </Button>
        }
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reward category</TableHead>
            <TableHead className="hidden @xl:table-cell">Bonus on</TableHead>
            <TableHead className="w-0">
              <span className="sr-only">Edit</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((category) => (
            <TableRow key={category.id}>
              <TableCell className="whitespace-normal">
                {category.name}
                <span className="block text-sm text-muted-foreground @xl:hidden">
                  {earnedBy[category.id]?.join(", ") || "No card yet"}
                </span>
              </TableCell>
              <TableCell className="hidden whitespace-normal text-muted-foreground @xl:table-cell">
                {earnedBy[category.id]?.join(", ") || "No card yet"}
              </TableCell>
              <TableCell>
                <RewardCategoryDialog
                  category={category}
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
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
