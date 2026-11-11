import { describe, expect, it } from "vitest"

import { parseTheme } from "./theme"

describe("parseTheme", () => {
  it("accepts each theme", () => {
    expect(parseTheme("system")).toBe("system")
    expect(parseTheme("light")).toBe("light")
    expect(parseTheme("dark")).toBe("dark")
  })

  it("follows the device when the cookie is missing or unknown", () => {
    expect(parseTheme(undefined)).toBe("system")
    expect(parseTheme("")).toBe("system")
    expect(parseTheme("sepia")).toBe("system")
  })
})
