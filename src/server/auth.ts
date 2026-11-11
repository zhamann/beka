import { scryptSync, timingSafeEqual } from "node:crypto"
import { isIP } from "node:net"

/** The cookie that keeps a device signed in when a password is set. */
export const SESSION_COOKIE = "beka_session"

/** The household password, set with `BEKA_PASSWORD`. Unset means no sign-in. */
export function householdPassword(): string | undefined {
  return process.env.BEKA_PASSWORD || undefined
}

/**
 * A slow hash of a password, so a copied session cookie can't be turned
 * back into the password by guessing quickly.
 */
function derive(password: string): Buffer {
  return scryptSync(password, "beka-session-v1", 32)
}

let cached: { password: string; token: string } | undefined

/**
 * The session cookie's value for `password`. It's derived from the password,
 * so changing the password signs every device out.
 */
export function sessionToken(password: string): string {
  if (cached?.password !== password)
    cached = { password, token: derive(password).toString("hex") }
  return cached.token
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function isSignedIn(
  password: string | undefined,
  cookie: string | undefined
): boolean {
  if (!password) return true
  return cookie !== undefined && sameText(cookie, sessionToken(password))
}

export function checkPassword(password: string, attempt: string): boolean {
  return timingSafeEqual(derive(password), derive(attempt))
}

/** How long a wrong password holds up the next attempt. */
export const WRONG_PASSWORD_DELAY = 1000
/** How many sign-in attempts may wait their turn before more are turned away. */
const MAX_WAITING = 10

let waiting = 0
let turn: Promise<unknown> = Promise.resolve()

/**
 * Checks sign-in attempts one at a time, holding the next one up after a
 * wrong password, so guesses can't be sent in parallel to go faster.
 * Returns `busy` when too many attempts are already waiting.
 */
export async function attemptSignIn(
  password: string,
  attempt: string,
  delay = WRONG_PASSWORD_DELAY
): Promise<"ok" | "wrong" | "busy"> {
  if (waiting >= MAX_WAITING) return "busy"
  waiting++
  const result = turn.then(async () => {
    if (checkPassword(password, attempt)) return "ok" as const
    await new Promise((resolve) => setTimeout(resolve, delay))
    return "wrong" as const
  })
  turn = result.catch(() => undefined)
  try {
    return await result
  } finally {
    waiting--
  }
}

/** Paths anyone can load: the sign-in page and the assets it needs. */
export function isPublicPath(path: string): boolean {
  return (
    path === "/login" ||
    // The agent's endpoint checks its own key.
    path === "/mcp" ||
    path === "/favicon.svg" ||
    path.startsWith("/_astro/")
  )
}

/** Where to go after signing in: only paths on this site. */
export function safeNext(next: string | null): string {
  if (!next?.startsWith("/")) return "/"
  const base = "http://beka.invalid"
  const url = new URL(next, base)
  return url.origin === base && !/^\/[/\\]/.test(next) ? next : "/"
}

/** Host names set in `BEKA_HOSTS`, comma-separated. */
export function extraHosts(): string[] {
  return (process.env.BEKA_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
}

/** Endings of names nobody can register publicly, or point at another network. */
const PRIVATE_SUFFIXES = [
  ".localhost",
  ".local",
  ".lan",
  ".home",
  ".internal",
  ".home.arpa",
  ".ts.net",
]

/**
 * Whether Beka answers at `hostname` without a password. A web page on
 * another site can point its own name at a home network's address (DNS
 * rebinding), so only names that can't belong to someone else are trusted:
 * IP addresses, single-word and private names, and `BEKA_HOSTS`.
 */
export function isTrustedHost(hostname: string, hosts = extraHosts()) {
  const name = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  return (
    isIP(name) !== 0 ||
    name === "localhost" ||
    !name.includes(".") ||
    PRIVATE_SUFFIXES.some((suffix) => name.endsWith(suffix)) ||
    hosts.includes(name)
  )
}
