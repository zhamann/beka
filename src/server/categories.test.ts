import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it } from "vitest"

import { CATEGORY_COLORS } from "@/lib/categories"

import { createCategory, listCategories, updateCategory } from "./categories"
import { openDatabase } from "./database"

let db: DatabaseSync
beforeEach(() => {
  db = openDatabase(":memory:")
})

const colorOf = (name: string) =>
  listCategories(db).find((c) => c.name === name)!.color

describe("category colors", () => {
  it("starts the usual big categories on different colors", () => {
    const big = [
      "Auto & Transport",
      "Dining & Drinks",
      "Groceries",
      "Bills & Utilities",
      "Shopping",
      "Home & Garden",
      "Travel & Vacation",
      "Health & Wellness",
    ]
    expect(big.map(colorOf)).toEqual(CATEGORY_COLORS.map((c) => c.color))
  })

  it("gives a new category the color the fewest spending categories wear", () => {
    const counts = new Map<number, number>()
    for (const c of listCategories(db).filter((c) => c.type === "spending"))
      counts.set(c.color, (counts.get(c.color) ?? 0) + 1)
    const fewest = CATEGORY_COLORS.map((c) => c.color).reduce((best, color) =>
      (counts.get(color) ?? 0) < (counts.get(best) ?? 0) ? color : best
    )
    expect(
      createCategory(db, { name: "Hobbies", type: "spending", hidden: false })
        .color
    ).toBe(fewest)
    expect(
      createCategory(db, {
        name: "Garden",
        type: "spending",
        hidden: false,
        color: 4,
      }).color
    ).toBe(4)
  })

  it("keeps a category's color unless a new one is given", () => {
    const id = listCategories(db).find((c) => c.name === "Groceries")!.id
    const before = colorOf("Groceries")
    updateCategory(db, id, {
      name: "Groceries",
      type: "spending",
      hidden: true,
    })
    expect(colorOf("Groceries")).toBe(before)
    updateCategory(db, id, {
      name: "Groceries",
      type: "spending",
      hidden: false,
      color: 8,
    })
    expect(colorOf("Groceries")).toBe(8)
  })

  it("refuses a color the theme doesn't have", () => {
    expect(() =>
      createCategory(db, {
        name: "Odd",
        type: "spending",
        hidden: false,
        color: 9,
      })
    ).toThrow()
  })
})
