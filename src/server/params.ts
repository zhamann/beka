/** Reads a positive integer id from a route or query parameter. */
export function parseId(value: string | null | undefined): number | undefined {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}
