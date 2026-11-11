/** A form field as trimmed text. */
export function text(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim()
}

/** A form field as a number, or null when it's blank. Invalid numbers become NaN for the server to reject. */
export function optionalNumber(form: FormData, name: string): number | null {
  const value = text(form, name).replace(/[$,%\s]/g, "")
  return value === "" ? null : Number(value)
}

/** A form field as a number, with blank meaning 0. */
export function number(form: FormData, name: string): number {
  return optionalNumber(form, name) ?? 0
}

/** A select's id, or null for its "none" option (an empty value). */
export function optionalId(form: FormData, name: string): number | null {
  const value = text(form, name)
  return value === "" ? null : Number(value)
}

export function checked(form: FormData, name: string): boolean {
  return form.get(name) === "on"
}
