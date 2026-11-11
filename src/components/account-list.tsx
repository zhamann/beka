import { IconChevronRight, IconPlus } from "@tabler/icons-react"

import { AccountDialog } from "@/components/account-dialog"
import { BalanceDialog } from "@/components/balance-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import {
  ACCOUNT_GROUPS,
  ACCOUNT_KIND_LABELS,
  isDebt,
  staleAfterDays,
  type AccountKind,
} from "@/lib/accounts"
import { age, daysBetween, formatDate, today } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import type { Account } from "@/server/accounts"
import type { Member } from "@/server/household"

/** "Roth IRA, Fidelity ··1234, Robin" */
export function accountMeta(account: Account): string {
  return [
    account.subtype || ACCOUNT_KIND_LABELS[account.kind],
    [account.institution, account.last4 && `··${account.last4}`]
      .filter(Boolean)
      .join(" "),
    account.ownerName ?? "Joint",
  ]
    .filter(Boolean)
    .join(", ")
}

/** The latest balance and when it's from, saying how old it is once it's stale. */
export function BalanceSummary({
  account,
  staleAfter,
}: {
  account: Account
  /** Days after which the balance counts as out of date, if that's checked. */
  staleAfter?: number
}) {
  const days = account.balance ? daysBetween(account.balance.asOf, today()) : 0
  return account.balance ? (
    <div className="flex flex-col gap-0.5 @xl:items-end @xl:text-right">
      <span className="font-heading text-xl/tight tabular-nums">
        {formatMoney(account.balance.amount)}
      </span>
      <span className="text-sm text-muted-foreground">
        {isDebt(account.kind) ? "owed, as of " : "as of "}
        {formatDate(account.balance.asOf)}
        {staleAfter !== undefined &&
          days > staleAfterDays(account.kind, staleAfter) && (
            <Badge variant="outline" className="mt-1.5 flex w-fit sm:ml-auto">
              {age(days)} old
            </Badge>
          )}
      </span>
    </div>
  ) : (
    <span className="text-sm text-muted-foreground">No balance yet</span>
  )
}

/** One group of accounts on the Accounts page, with an Add button. */
export function AccountList({
  accounts,
  kinds,
  members,
  emptyText,
  addLabel,
  staleAfter,
}: {
  accounts: Account[]
  kinds: AccountKind[]
  members: Member[]
  emptyText: string
  /** The add button's label, like "Add cash account". */
  addLabel: string
  /** Days after which a balance counts as out of date, if that's checked. */
  staleAfter?: number
}) {
  const total = accounts.reduce(
    (sum, account) => sum + (account.balance?.amount ?? 0),
    0
  )
  return (
    <div className="flex flex-col gap-3">
      {accounts.length === 0 ? (
        <Empty className="border py-6">
          <EmptyHeader>
            <EmptyDescription>{emptyText}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-xl border bg-card">
          <ul className="flex flex-col divide-y">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 @2xl:px-6"
              >
                <div className="flex min-w-48 flex-1 flex-col gap-1">
                  <a
                    href={`/accounts/${account.id}`}
                    className="inline-flex min-h-10 items-center gap-1 self-start font-medium hover:underline @xl:min-h-0"
                  >
                    {account.name}
                    <IconChevronRight
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </a>
                  <span className="text-sm text-muted-foreground">
                    {accountMeta(account)}
                  </span>
                </div>
                <div className="flex w-full items-center justify-between gap-4 @xl:ml-auto @xl:w-auto @xl:justify-end">
                  <BalanceSummary account={account} staleAfter={staleAfter} />
                  <BalanceDialog
                    account={account}
                    trigger={
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Update ${account.name}'s balance`}
                      >
                        Update
                      </Button>
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
          {accounts.length > 1 && (
            <div className="flex items-baseline justify-between gap-4 px-4 py-3 ledger-subtotal @2xl:px-6">
              <span className="font-medium">Total</span>
              <span className="font-heading text-xl/tight tabular-nums">
                {formatMoney(total)}
              </span>
            </div>
          )}
        </div>
      )}
      <AccountDialog
        kinds={kinds}
        members={members}
        trigger={
          <Button variant="ghost" className="self-start">
            <IconPlus />
            {addLabel}
          </Button>
        }
      />
    </div>
  )
}

/** The Accounts page's button for adding any kind of account it lists. */
export function AddAccountButton({ members }: { members: Member[] }) {
  return (
    <AccountDialog
      kinds={ACCOUNT_GROUPS.flatMap((group) => group.kinds)}
      members={members}
      trigger={
        <Button>
          <IconPlus />
          Add account
        </Button>
      }
    />
  )
}

/** An account's Update button, for pages that list it outside `AccountList`. */
export function UpdateBalanceButton({ account }: { account: Account }) {
  return (
    <BalanceDialog
      account={account}
      trigger={
        <Button
          variant="outline"
          size="sm"
          aria-label={`Update ${account.name}'s balance`}
        >
          Update
        </Button>
      }
    />
  )
}
