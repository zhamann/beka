import type { MiddlewareHandler } from "astro"

import {
  householdPassword,
  isPublicPath,
  isSignedIn,
  isTrustedHost,
  SESSION_COOKIE,
} from "@/server/auth"
import { scheduleBackups } from "@/server/backups"

// Daily backups run alongside the server.
if (!process.env.VITEST) scheduleBackups()

/**
 * Headers sent with every page. Stop other sites from framing the app, where
 * a click could confirm a restore or delete.
 */
export const securityHeaders = {
  "Content-Security-Policy":
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
}

/** Asks for the household password, when one is set, before anything else. */
const requireSignIn = async (
  context: Parameters<MiddlewareHandler>[0],
  next: () => Promise<Response>
): Promise<Response> => {
  const { hostname, pathname, search } = context.url
  const password = householdPassword()
  if (!password && !isTrustedHost(hostname)) {
    return new Response(
      `Without a password, Beka only answers at private addresses. To use ${hostname}, add it to BEKA_HOSTS or set BEKA_PASSWORD.`,
      { status: 403 }
    )
  }
  const signedIn = isSignedIn(
    password,
    context.cookies.get(SESSION_COOKIE)?.value
  )
  if (signedIn || isPublicPath(pathname)) return next()
  if (context.request.method !== "GET" || pathname.startsWith("/_actions/")) {
    return new Response("Sign in first.", { status: 401 })
  }
  return context.redirect(
    `/login?next=${encodeURIComponent(pathname + search)}`
  )
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  const response = await requireSignIn(context, next)
  for (const [name, value] of Object.entries(securityHeaders)) {
    response.headers.set(name, value)
  }
  return response
}
