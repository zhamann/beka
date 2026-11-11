import { IconPencil, IconPlus } from "@tabler/icons-react"

import { JobDialog } from "@/components/job-dialog"
import { OtherIncomeDialog } from "@/components/other-income-dialog"
import { Button } from "@/components/ui/button"
import type { Account } from "@/server/accounts"
import type { Member } from "@/server/household"
import type { Job, OtherIncome } from "@/server/income"

interface Shared {
  members: Member[]
  accounts: Account[]
}

export function AddIncomeButtons({ members, accounts }: Shared) {
  return (
    <>
      <JobDialog
        members={members}
        accounts={accounts}
        trigger={
          <Button>
            <IconPlus />
            Add job
          </Button>
        }
      />
      <OtherIncomeDialog
        members={members}
        accounts={accounts}
        trigger={
          <Button variant="outline">
            <IconPlus />
            Add other income
          </Button>
        }
      />
    </>
  )
}

export function EditJobButton({ job, ...shared }: Shared & { job: Job }) {
  return (
    <JobDialog
      job={job}
      {...shared}
      trigger={
        <Button variant="ghost" size="sm" aria-label={`Edit ${job.employer}`}>
          <IconPencil />
          Edit
        </Button>
      }
    />
  )
}

export function EditOtherIncomeButton({
  income,
  ...shared
}: Shared & { income: OtherIncome }) {
  return (
    <OtherIncomeDialog
      income={income}
      {...shared}
      trigger={
        <Button variant="ghost" size="sm" aria-label={`Edit ${income.name}`}>
          <IconPencil />
          Edit
        </Button>
      }
    />
  )
}
