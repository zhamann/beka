import { useId, useState } from "react"

import { SelectField, TextField } from "@/components/form-fields"
import {
  ACCOUNT_KIND_LABELS,
  SUBTYPE_SUGGESTIONS,
  type AccountKind,
} from "@/lib/accounts"
import { optionalId, text } from "@/lib/form"
import type { Account } from "@/server/accounts"
import type { Member } from "@/server/household"

/** The details every account shares, for account, loan, and card forms. */
export function AccountFields({
  account,
  kinds,
  members,
  namePlaceholder,
}: {
  account?: Account
  /** The kinds this form can choose between; one kind hides the choice. */
  kinds: readonly AccountKind[]
  members: Member[]
  namePlaceholder?: string
}) {
  const listId = useId()
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? kinds[0])
  const suggestions = SUBTYPE_SUGGESTIONS[kind] ?? []

  return (
    <>
      <TextField
        name="name"
        label="Name"
        defaultValue={account?.name}
        placeholder={namePlaceholder}
        required
      />
      {kinds.length > 1 ? (
        <SelectField
          name="kind"
          label="Type"
          value={kind}
          onChange={(event) => setKind(event.target.value as AccountKind)}
          options={kinds.map((value) => ({
            value,
            label: ACCOUNT_KIND_LABELS[value],
          }))}
        />
      ) : (
        <input type="hidden" name="kind" value={kinds[0]} />
      )}
      {suggestions.length > 0 && (
        <>
          <TextField
            name="subtype"
            label="Kind"
            description="Optional, like “Roth IRA” or “Home”."
            list={listId}
            defaultValue={account?.subtype}
          />
          <datalist id={listId}>
            {suggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="institution"
          label="Institution (optional)"
          defaultValue={account?.institution}
        />
        <TextField
          name="last4"
          label="Last 4 digits (optional)"
          inputMode="numeric"
          maxLength={4}
          defaultValue={account?.last4}
        />
      </div>
      <SelectField
        name="ownerId"
        label="Owner"
        defaultValue={account?.ownerId ?? ""}
        options={[
          { value: "", label: "Joint" },
          ...members.map((member) => ({
            value: member.id,
            label: member.name,
          })),
        ]}
      />
    </>
  )
}

export function NotesField({ account }: { account?: Account }) {
  return (
    <TextField
      name="notes"
      label="Notes (optional)"
      defaultValue={account?.notes}
    />
  )
}

/** Reads `AccountFields` and `NotesField` from a submitted form. */
export function readAccountFields(form: FormData) {
  return {
    name: text(form, "name"),
    kind: text(form, "kind") as AccountKind,
    subtype: text(form, "subtype"),
    institution: text(form, "institution"),
    last4: text(form, "last4"),
    ownerId: optionalId(form, "ownerId"),
    notes: text(form, "notes"),
  }
}
