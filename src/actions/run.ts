import { ActionError, type ActionErrorCode } from "astro:actions"
import type { DatabaseSync } from "node:sqlite"

import { getDatabase } from "@/server/database"
import { BekaError, type BekaErrorCode } from "@/server/errors"

const actionCodes: Record<BekaErrorCode, ActionErrorCode> = {
  "not-found": "NOT_FOUND",
  "duplicate-name": "CONFLICT",
  "in-use": "CONFLICT",
  invalid: "BAD_REQUEST",
  "data-full": "CONTENT_TOO_LARGE",
}

/** Runs a server call, reporting rule violations as action errors. */
export function run<T>(work: (db: DatabaseSync) => T): T {
  try {
    return work(getDatabase())
  } catch (error) {
    if (error instanceof BekaError) {
      throw new ActionError({
        code: actionCodes[error.code],
        message: error.message,
      })
    }
    throw error
  }
}
