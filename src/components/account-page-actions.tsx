import { AccountActions } from "@/components/account-actions"
import { AccountDialog } from "@/components/account-dialog"
import { CardDialog } from "@/components/card-dialog"
import { LoanDialog } from "@/components/loan-dialog"
import type { AccountKind } from "@/lib/accounts"
import type { Account } from "@/server/accounts"
import type { Card, RewardCategory } from "@/server/cards"
import type { Member } from "@/server/household"
import type { Loan } from "@/server/loans"

/** Actions on an account's page, with the edit dialog for its kind. */
export function AccountPageActions({
  account,
  loan,
  card,
  rewardCategories = [],
  kinds,
  members,
}: {
  account: Account
  /** The loan's terms, when the account is a loan. */
  loan?: Loan
  /** The card's rewards and terms, when the account is a credit card. */
  card?: Card
  rewardCategories?: RewardCategory[]
  kinds: AccountKind[]
  members: Member[]
}) {
  return (
    <AccountActions
      account={account}
      backTo={loan ? "/loans" : card ? "/cards" : "/accounts"}
      editDialog={(trigger) =>
        card ? (
          <CardDialog
            card={card}
            members={members}
            rewardCategories={rewardCategories}
            trigger={trigger}
          />
        ) : loan ? (
          <LoanDialog loan={loan} members={members} trigger={trigger} />
        ) : (
          <AccountDialog
            account={account}
            kinds={kinds}
            members={members}
            trigger={trigger}
          />
        )
      }
    />
  )
}
