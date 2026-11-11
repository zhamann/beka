import type { APIRoute } from "astro"

import { restoreBackup } from "@/server/backups"
import { readBody } from "@/server/body"
import { BekaError } from "@/server/errors"

/** The largest backup file a restore accepts. */
const LIMIT = 200 * 1024 * 1024

/** Restores the database from an uploaded backup file (the raw bytes). */
export const POST: APIRoute = async ({ request, url }) => {
  const origin = request.headers.get("origin")
  if (origin && origin !== url.origin)
    return new Response("Wrong origin.", { status: 403 })
  const bytes = await readBody(request, LIMIT)
  if (!bytes) return new Response("That file is too big.", { status: 413 })
  if (bytes.length === 0)
    return new Response("Choose a backup file.", { status: 400 })
  try {
    restoreBackup({
      bytes,
      fileName: url.searchParams.get("name") ?? "an uploaded file",
    })
  } catch (error) {
    if (error instanceof BekaError)
      return new Response(error.message, { status: 400 })
    throw error
  }
  return new Response(null, { status: 204 })
}
