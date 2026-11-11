import { describe, expect, it } from "vitest"

import { describeChange } from "@/lib/changes"

describe("describeChange", () => {
  it("lists only what an edit changed, labeled and formatted", () => {
    expect(
      describeChange(
        {
          id: 3,
          merchant: "Kroger",
          amount: -6482,
          categoryId: 1,
          categoryName: "Groceries",
        },
        {
          id: 3,
          merchant: "Kroger",
          amount: -7000,
          categoryId: 2,
          categoryName: "Dining",
        }
      )
    ).toEqual([
      { label: "Amount", before: "−$64.82", after: "−$70.00" },
      { label: "Category name", before: "Groceries", after: "Dining" },
    ])
  })

  it("lists every field of something added", () => {
    expect(describeChange(null, { name: "Gym", hidden: false })).toEqual([
      { label: "Name", before: undefined, after: "Gym" },
      { label: "Hidden", before: undefined, after: "No" },
    ])
  })
})
