import {
  IconDatabaseExport,
  IconDownload,
  IconHistory,
  IconUpload,
} from "@tabler/icons-react"
import { actions } from "astro:actions"
import { cn } from "cn"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { ConfirmDelete } from "@/components/confirm-delete"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDateTime } from "@/lib/dates"
import type { Backup } from "@/server/backups"
import { reloadWith } from "@/lib/reload"

const KIND_LABELS: Record<Backup["kind"], string> = {
  daily: "Daily",
  manual: "Manual",
  "before-restore": "Before a restore",
}

const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** Lists backups, makes one now, and restores from a backup or an uploaded file. */
export function BackupSettings({ backups }: { backups: Backup[] }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File>()
  const [pending, startTransition] = useTransition()

  function backUpNow() {
    startTransition(async () => {
      const { error } = await actions.createBackup()
      if (error) toast.error(error.message)
      else reloadWith("Backed up")
    })
  }

  function restoreFile() {
    if (!file) return
    startTransition(async () => {
      const response = await fetch(
        `/backups/restore?name=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
        }
      )
      if (response.ok) return window.location.assign("/")
      setFile(undefined)
      toast.error(await response.text())
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={backUpNow} disabled={pending}>
          <IconDatabaseExport />
          Back up now
        </Button>
        <Button
          variant="outline"
          onClick={() => fileInput.current?.click()}
          disabled={pending}
        >
          <IconUpload />
          Restore from a file
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".db,application/vnd.sqlite3"
          aria-label="Backup file to restore"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            setFile(event.target.files?.[0])
            event.target.value = ""
          }}
        />
      </div>
      {backups.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Backup</TableHead>
              <TableHead className="hidden sm:table-cell">Size</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {backups.map((backup) => (
              <TableRow key={backup.name}>
                <TableCell className="whitespace-normal">
                  {formatDateTime(backup.createdAt)}{" "}
                  <Badge
                    variant={backup.kind === "daily" ? "secondary" : "outline"}
                  >
                    {KIND_LABELS[backup.kind]}
                  </Badge>
                  <span className="block text-sm text-muted-foreground sm:hidden">
                    {size(backup.bytes)}
                  </span>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {size(backup.bytes)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                    <a
                      href={`/backups/${backup.name}`}
                      download
                      aria-label={`Download the backup from ${formatDateTime(backup.createdAt)}`}
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" })
                      )}
                    >
                      <IconDownload />
                      Download
                    </a>
                    <ConfirmDelete
                      title="Restore this backup?"
                      description="Everything is replaced with this backup. Your current data is backed up first, so you can switch back."
                      confirmLabel="Restore"
                      then="/"
                      onConfirm={() =>
                        actions.restoreBackup({ name: backup.name })
                      }
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                        >
                          <IconHistory />
                          Restore
                        </Button>
                      }
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <AlertDialog
        open={file !== undefined}
        onOpenChange={(open) => !open && setFile(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore {file?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything is replaced with this backup. Your current data is
              backed up first, so you can switch back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={restoreFile}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
