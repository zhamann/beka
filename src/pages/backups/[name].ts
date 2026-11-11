import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import type { APIRoute } from "astro"

import { BACKUP_NAME, backupDir } from "@/server/backups"

/** Downloads one backup file. */
export const GET: APIRoute = ({ params }) => {
  const name = params.name ?? ""
  const path = join(backupDir(), name)
  if (!BACKUP_NAME.test(name) || !existsSync(path))
    return new Response("Not found", { status: 404 })
  return new Response(readFileSync(path), {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  })
}
