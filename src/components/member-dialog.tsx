import { IconTrash } from "@tabler/icons-react"
import { actions } from "astro:actions"
import type { ReactElement } from "react"

import { ConfirmDelete } from "@/components/confirm-delete"
import { FormDialog } from "@/components/form-dialog"
import { TextField } from "@/components/form-fields"
import { Button } from "@/components/ui/button"
import { optionalNumber, text } from "@/lib/form"
import type { Member } from "@/server/household"

/** Adds a household member, or edits `member` when one is given. */
export function MemberDialog({
  member,
  trigger,
}: {
  member?: Member
  trigger: ReactElement
}) {
  return (
    <FormDialog
      compact
      title={member ? `Edit ${member.name}` : "Add a person"}
      trigger={trigger}
      submitLabel={member ? "Save" : "Add"}
      onSubmit={(form) => {
        const input = {
          name: text(form, "name"),
          birthYear: optionalNumber(form, "birthYear"),
        }
        return member
          ? actions.updateMember({ id: member.id, ...input })
          : actions.createMember(input)
      }}
      footer={
        member && (
          <ConfirmDelete
            title={`Remove ${member.name}?`}
            description="Only people with no income or accounts can be removed."
            onConfirm={() => actions.deleteMember({ id: member.id })}
            trigger={
              <Button variant="destructive" className="sm:mr-auto">
                <IconTrash />
                Remove
              </Button>
            }
          />
        )
      }
    >
      <TextField
        name="name"
        label="Name"
        defaultValue={member?.name}
        required
      />
      <TextField
        name="birthYear"
        label="Birth year"
        description="Optional. Raises 401(k) and HSA limits at catch-up ages."
        inputMode="numeric"
        defaultValue={member?.birthYear ?? ""}
      />
    </FormDialog>
  )
}
