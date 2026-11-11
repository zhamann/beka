/** Rule violations the server reports to the app and the agent. */
export type BekaErrorCode =
  "not-found" | "duplicate-name" | "in-use" | "invalid" | "data-full"

export class BekaError extends Error {
  constructor(
    readonly code: BekaErrorCode,
    message: string
  ) {
    super(message)
  }
}

// Extended SQLite result codes for the constraints the schema enforces.
export const SQLITE_CONSTRAINT_FOREIGNKEY = 787
export const SQLITE_CONSTRAINT_UNIQUE = 2067
// What SQLite reports when `ON DELETE RESTRICT` blocks a delete.
export const SQLITE_CONSTRAINT_TRIGGER = 1811

/** Rethrows a SQLite constraint error as the matching `BekaError`. */
export function translate(
  error: unknown,
  errors: Partial<Record<number, BekaError>>
): never {
  throw errors[(error as { errcode?: number }).errcode ?? -1] ?? error
}

export function notFound(what: string): BekaError {
  return new BekaError("not-found", `That ${what} no longer exists.`)
}
