import { IconArrowBackUp } from "@tabler/icons-react"
import { actions } from "astro:actions"

import { ConfirmDelete } from "@/components/confirm-delete"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate, formatDateTime } from "@/lib/dates"
import type { ImportRecord } from "@/server/imports"

export function ImportHistory({ imports }: { imports: ImportRecord[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Imported</TableHead>
          <TableHead className="hidden @xl:table-cell">File</TableHead>
          <TableHead className="hidden @2xl:table-cell">Covers</TableHead>
          <TableHead className="text-right">Added</TableHead>
          <TableHead className="w-0">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {imports.map((record) => (
          <TableRow key={record.id}>
            <TableCell className="whitespace-normal">
              {formatDateTime(record.importedAt)}
              <span className="block text-sm text-muted-foreground @2xl:hidden">
                {[
                  record.fileName,
                  record.firstDate &&
                    record.lastDate &&
                    `${formatDate(record.firstDate)} – ${formatDate(record.lastDate)}`,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </span>
              {record.actor === "agent" && (
                <Badge className="ml-2" variant="secondary">
                  Agent
                </Badge>
              )}
            </TableCell>
            <TableCell className="hidden whitespace-normal @xl:table-cell">
              {record.fileName || "—"}
            </TableCell>
            <TableCell className="hidden text-muted-foreground @2xl:table-cell">
              {record.firstDate && record.lastDate
                ? `${formatDate(record.firstDate)} – ${formatDate(record.lastDate)}`
                : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {record.remaining.toLocaleString()}
              {record.skipped > 0 && (
                <span className="block text-sm text-muted-foreground">
                  {record.skipped.toLocaleString()} skipped
                </span>
              )}
            </TableCell>
            <TableCell>
              <ConfirmDelete
                title={
                  record.fileName
                    ? `Undo the import of ${record.fileName}?`
                    : `Undo the import from ${formatDateTime(record.importedAt)}?`
                }
                description={`This deletes the ${record.remaining.toLocaleString()} transactions it added, including any changes you made to them.`}
                confirmLabel="Undo import"
                onConfirm={() => actions.undoImport({ id: record.id })}
                trigger={
                  <Button variant="ghost" size="sm">
                    <IconArrowBackUp />
                    Undo
                  </Button>
                }
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
