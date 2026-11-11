import { IconPlus } from "@tabler/icons-react"

import { LoanDialog } from "@/components/loan-dialog"
import { Button } from "@/components/ui/button"
import type { Member } from "@/server/household"

export function NewLoanButton({ members }: { members: Member[] }) {
  return (
    <LoanDialog
      members={members}
      trigger={
        <Button>
          <IconPlus />
          Add loan
        </Button>
      }
    />
  )
}
