import { describe, expect, it } from "vitest"

import {
  attemptSignIn,
  checkPassword,
  isSignedIn,
  isTrustedHost,
  safeNext,
  sessionToken,
} from "./auth"

describe("auth", () => {
  it("signs every device out when the password changes", () => {
    const cookie = sessionToken("old")
    expect(isSignedIn("old", cookie)).toBe(true)
    expect(isSignedIn("new", cookie)).toBe(false)
  })

  it("needs no session without a password", () => {
    expect(isSignedIn(undefined, undefined)).toBe(true)
  })

  it("checks the password", () => {
    expect(checkPassword("hunter2", "hunter2")).toBe(true)
    expect(checkPassword("hunter2", "hunter")).toBe(false)
  })

  it("only returns to paths on this site", () => {
    expect(safeNext("/income")).toBe("/income")
    expect(safeNext("//evil.test")).toBe("/")
    expect(safeNext("https://evil.test")).toBe("/")
    expect(safeNext("/\\evil.test/")).toBe("/")
    expect(safeNext("/\t/evil.test")).toBe("/")
    expect(safeNext(null)).toBe("/")
  })

  it("doesn't keep the password in the cookie", () => {
    expect(sessionToken("hunter2")).not.toContain("hunter2")
    expect(sessionToken("hunter2")).toHaveLength(64)
  })

  it("checks sign-in attempts one at a time", async () => {
    const started = Date.now()
    const results = await Promise.all([
      attemptSignIn("hunter2", "guess1", 50),
      attemptSignIn("hunter2", "guess2", 50),
      attemptSignIn("hunter2", "hunter2", 50),
    ])
    expect(results).toEqual(["wrong", "wrong", "ok"])
    expect(Date.now() - started).toBeGreaterThanOrEqual(100)
  })

  it("turns attempts away when too many are waiting", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => attemptSignIn("hunter2", "nope", 5))
    )
    expect(results.filter((r) => r === "busy")).toHaveLength(2)
  })

  it("trusts only hosts that can't belong to another site", () => {
    expect(isTrustedHost("localhost", [])).toBe(true)
    expect(isTrustedHost("10.0.0.5", [])).toBe(true)
    expect(isTrustedHost("[fd00::1]", [])).toBe(true)
    expect(isTrustedHost("nas", [])).toBe(true)
    expect(isTrustedHost("beka.local", [])).toBe(true)
    expect(isTrustedHost("evil.example", [])).toBe(false)
    expect(isTrustedHost("Beka.Example.com", ["beka.example.com"])).toBe(true)
  })
})
