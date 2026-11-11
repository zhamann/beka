import { actions } from "astro:actions"
import type { ReactElement } from "react"

import { BalanceFields } from "@/components/balance-fields"
import { FormDialog } from "@/components/form-dialog"
import { isDebt } from "@/lib/accounts"
import { optionalNumber, text } from "@/lib/form"
import type { Account } from "@/server/accounts"

/** Records a new balance for an account, keeping the old ones as history. */
export function BalanceDialog({
  account,
  trigger,
  open,
  onOpenChange,
}: {
  account: Account
  trigger: ReactElement
  /** Set these to open it from elsewhere, like a link to the account. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <FormDialog
      compact
      title={`Update ${account.name}`}
      description="The previous balance stays in the account's history."
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      submitLabel="Save balance"
      onSubmit={(form) =>
        actions.recordBalance({
          accountId: account.id,
          amount: optionalNumber(form, "amount") ?? NaN,
          asOf: text(form, "asOf"),
        })
      }
    >
      <BalanceFields
        label={isDebt(account.kind) ? "Amount owed" : "Balance"}
        defaultAmount={account.balance?.amount}
      />
    </FormDialog>
  )
}
