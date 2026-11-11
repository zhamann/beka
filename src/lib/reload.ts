const FLASH_KEY = "beka:flash"

/** A change the toast after a reload can take back, as an action and its input. */
export interface Undo {
  action: string
  input: unknown
}

export interface Flash {
  message: string
  undo?: Undo
}

/**
 * Reloads the page so it renders from the database, then shows `message` as a
 * toast once it's back, with an Undo button when `undo` is given. Pass `then`
 * to go to another page instead.
 */
export function reloadWith(message: string, then?: string, undo?: Undo) {
  try {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, undo }))
  } catch {
    // Without storage the change still shows on the reloaded page.
  }
  if (then) window.location.assign(then)
  else window.location.reload()
}

/** The toast `reloadWith` left for this page, removing it so it shows once. */
export function takeFlash(): Flash | undefined {
  try {
    const stored = sessionStorage.getItem(FLASH_KEY)
    sessionStorage.removeItem(FLASH_KEY)
    return stored ? (JSON.parse(stored) as Flash) : undefined
  } catch {
    return undefined
  }
}
