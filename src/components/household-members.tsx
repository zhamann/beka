import { IconPencil, IconUserPlus } from "@tabler/icons-react"

import { MemberDialog } from "@/components/member-dialog"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Member } from "@/server/household"

export function HouseholdMembers({ members }: { members: Member[] }) {
  return (
    <div className="flex flex-col gap-3">
      <MemberDialog
        trigger={
          <Button variant="outline" className="self-start">
            <IconUserPlus />
            Add a person
          </Button>
        }
      />
      {members.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No one yet</EmptyTitle>
            <EmptyDescription>
              Add each person whose income or accounts you track.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead className="text-right">Born</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Edit</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="whitespace-normal">
                  {member.name}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {member.birthYear ?? "—"}
                </TableCell>
                <TableCell>
                  <MemberDialog
                    member={member}
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${member.name}`}
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
      )}
    </div>
  )
}

/** Adds a person from wherever one is needed first, like an empty Income page. */
export function AddPersonButton() {
  return (
    <MemberDialog
      trigger={
        <Button>
          <IconUserPlus />
          Add a person
        </Button>
      }
    />
  )
}
