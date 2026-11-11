import { actions } from "astro:actions"
import type { ReactElement } from "react"

import {
  AccountFields,
  NotesField,
  readAccountFields,
} from "@/components/account-fields"
import { BalanceFields, readBalance } from "@/components/balance-fields"
import { FormDialog } from "@/components/form-dialog"
import type { AccountKind } from "@/lib/accounts"
import type { Account } from "@/server/accounts"
import type { Member } from "@/server/household"

/** Adds an account (with its first balance), or edits `account`. */
export function AccountDialog({
  account,
  kinds,
  members,
  trigger,
}: {
  account?: Account
  kinds: readonly AccountKind[]
  members: Member[]
  trigger: ReactElement
}) {
  return (
    <FormDialog
      title={account ? `Edit ${account.name}` : "Add an account"}
      trigger={trigger}
      submitLabel={account ? "Save" : "Add account"}
      onSubmit={(form) => {
        const input = readAccountFields(form)
        return account
          ? actions.updateAccount({ id: account.id, ...input })
          : actions.createAccount({ ...input, balance: readBalance(form) })
      }}
    >
      <AccountFields
        account={account}
        kinds={
          account
            ? [account.kind, ...kinds.filter((k) => k !== account.kind)]
            : kinds
        }
        members={members}
        namePlaceholder="e.g. Everyday checking"
      />
      {!account && (
        <BalanceFields
          description="Optional. You can update it any time."
          required={false}
        />
      )}
      <NotesField account={account} />
    </FormDialog>
  )
}
