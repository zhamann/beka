import { afterEach, describe, expect, it } from "vitest"

import { onRequest, securityHeaders } from "./middleware"
import { sessionToken } from "./server/auth"

function context(
  path: string,
  { method = "GET", cookie = "", origin = "http://localhost:4321" } = {}
) {
  const url = new URL(path, origin)
  return {
    url,
    request: new Request(url, { method }),
    cookies: { get: () => (cookie ? { value: cookie } : undefined) },
    redirect: (to: string) =>
      new Response(null, { status: 302, headers: { Location: to } }),
  } as unknown as Parameters<typeof onRequest>[0]
}

const run = async (ctx: Parameters<typeof onRequest>[0]) =>
  (await onRequest(ctx, async () => new Response("ok"))) as Response

describe("middleware", () => {
  afterEach(() => {
    delete process.env.BEKA_PASSWORD
    delete process.env.BEKA_HOSTS
  })

  it("adds the security headers to every response", async () => {
    const response = await run(context("/"))
    for (const [name, value] of Object.entries(securityHeaders)) {
      expect(response.headers.get(name)).toBe(value)
    }
  })

  it("lets everyone in when no password is set", async () => {
    expect((await run(context("/settings"))).status).toBe(200)
  })

  it("answers only at private addresses without a password", async () => {
    for (const origin of [
      "http://192.168.1.20:4321",
      "http://[::1]:4321",
      "http://nas:4321",
      "http://beka.home.arpa",
      "https://beka.tail1234.ts.net",
    ]) {
      expect((await run(context("/", { origin }))).status).toBe(200)
    }
    const outside = { origin: "http://rebind.example.com:4321" }
    expect((await run(context("/", outside))).status).toBe(403)

    process.env.BEKA_HOSTS = "rebind.example.com, other.example.com"
    expect((await run(context("/", outside))).status).toBe(200)

    delete process.env.BEKA_HOSTS
    process.env.BEKA_PASSWORD = "hunter2"
    expect((await run(context("/", outside))).status).toBe(302)
  })

  it("sends signed-out visitors to the sign-in page", async () => {
    process.env.BEKA_PASSWORD = "hunter2"
    const response = await run(context("/settings?tab=1"))
    expect(response.status).toBe(302)
    expect(response.headers.get("Location")).toBe(
      "/login?next=%2Fsettings%3Ftab%3D1"
    )
    expect(response.headers.get("X-Frame-Options")).toBe("DENY")
  })

  it("refuses signed-out changes", async () => {
    process.env.BEKA_PASSWORD = "hunter2"
    const response = await run(
      context("/_actions/createMember", { method: "POST" })
    )
    expect(response.status).toBe(401)
  })

  it("lets signed-in devices and the sign-in page through", async () => {
    process.env.BEKA_PASSWORD = "hunter2"
    const cookie = sessionToken("hunter2")
    expect((await run(context("/", { cookie }))).status).toBe(200)
    expect((await run(context("/login"))).status).toBe(200)
    expect((await run(context("/", { cookie: "stale" }))).status).toBe(302)
  })
})
