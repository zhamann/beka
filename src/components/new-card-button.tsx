import { IconPlus } from "@tabler/icons-react"

import { CardDialog } from "@/components/card-dialog"
import { Button } from "@/components/ui/button"
import type { RewardCategory } from "@/server/cards"
import type { Member } from "@/server/household"

export function NewCardButton({
  members,
  rewardCategories,
}: {
  members: Member[]
  rewardCategories: RewardCategory[]
}) {
  return (
    <CardDialog
      members={members}
      rewardCategories={rewardCategories}
      trigger={
        <Button>
          <IconPlus />
          Add card
        </Button>
      }
    />
  )
}
