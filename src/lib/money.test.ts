import { describe, expect, it } from "vitest"

import { formatMoney, formatPercent } from "@/lib/money"

describe("formatMoney", () => {
  it("formats cents as dollars", () => {
    expect(formatMoney(123456)).toBe("$1,234.56")
    expect(formatMoney(123456, { whole: true })).toBe("$1,235")
  })

  it("writes money out with a true minus sign", () => {
    expect(formatMoney(-6482)).toBe("−$64.82")
    expect(formatMoney(-31162200, { whole: true })).toBe("−$311,622")
  })

  it("never shows a negative zero", () => {
    expect(formatMoney(-0)).toBe("$0.00")
    expect(formatMoney(-40, { whole: true })).toBe("$0")
  })
})

describe("formatPercent", () => {
  it("always shows the same number of decimals, so rates line up", () => {
    expect(formatPercent(0.068)).toBe("6.80%")
    expect(formatPercent(0.0613)).toBe("6.13%")
  })
})
