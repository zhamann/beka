import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it } from "vitest"

import {
  createCard,
  createRewardCategory,
  deleteRewardCategory,
  getCard,
  listRewardCategories,
  whichCard,
  type CardTerms,
} from "./cards"
import { openDatabase } from "./database"
import { rankDebts } from "./loans"

let db: DatabaseSync
beforeEach(() => {
  db = openDatabase(":memory:")
})

const account = {
  subtype: "",
  institution: "",
  last4: "",
  ownerId: null,
  notes: "",
}

const plain: CardTerms = {
  rewardsCurrency: "cash",
  pointValue: 1,
  baseRate: 1.5,
  annualFee: 0,
  annualFeeMonth: null,
  foreignTransactionFee: false,
  creditLimit: null,
  apr: null,
  statementDueDay: null,
  carriesBalance: false,
  bonuses: [],
  credits: [],
}

const category = (name: string) =>
  listRewardCategories(db).find((c) => c.name === name)!.id

describe("cards", () => {
  it("starts with common reward categories", () => {
    expect(listRewardCategories(db).map((c) => c.name)).toContain("Dining")
  })

  it("stores rewards, forcing cash back to one cent per point", () => {
    const card = createCard(
      db,
      { ...account, name: "Everyday Cash" },
      {
        ...plain,
        pointValue: 5,
        bonuses: [
          {
            rewardCategoryId: category("Gas"),
            rate: 2,
            cap: 1_000_00,
            capPeriod: "quarter",
            condition: "Gas and restaurants combined",
            year: null,
            quarter: null,
          },
        ],
        credits: [{ name: "Streaming credit", annualValue: 60_00 }],
      }
    )
    expect(getCard(db, card.id)).toMatchObject({
      kind: "credit_card",
      pointValue: 1,
      bonuses: [
        { rewardCategoryName: "Gas", cap: 1_000_00, capPeriod: "quarter" },
      ],
      credits: [{ name: "Streaming credit", annualValue: 60_00 }],
    })
  })

  it("ranks cards per category by effective return, counting rotating ones in their quarter", () => {
    createCard(db, { ...account, name: "Everyday Cash" }, plain)
    createCard(
      db,
      { ...account, name: "Travel Miles" },
      {
        ...plain,
        rewardsCurrency: "points",
        pointValue: 1.3,
        baseRate: 1,
        bonuses: [
          {
            rewardCategoryId: category("Transit"),
            rate: 2,
            cap: null,
            capPeriod: null,
            condition: "",
            year: null,
            quarter: null,
          },
        ],
      }
    )
    createCard(
      db,
      { ...account, name: "Rotating Five" },
      {
        ...plain,
        baseRate: 1,
        bonuses: [
          {
            rewardCategoryId: category("Groceries"),
            rate: 5,
            cap: 1_500_00,
            capPeriod: "quarter",
            condition: "Activate each quarter",
            year: 2026,
            quarter: 4,
          },
        ],
      }
    )

    const guide = whichCard(db, "2026-11-06")
    const pick = (name: string) => guide.find((g) => g.name === name)!.picks
    expect(pick("Transit")[0]).toMatchObject({
      cardName: "Travel Miles",
      rate: "2x",
      effective: 2.6,
    })
    expect(pick("Groceries")[0]).toMatchObject({
      cardName: "Rotating Five",
      rate: "5%",
      notes: [
        "Up to $1,500 a quarter, then 1%",
        "Activate each quarter",
        "This quarter only",
      ],
    })
    expect(pick("Everything else").map((p) => p.cardName)).toEqual([
      "Everyday Cash",
      "Travel Miles",
      "Rotating Five",
    ])
    // Next quarter, the rotating bonus no longer applies.
    expect(
      whichCard(db, "2027-01-02").find((g) => g.name === "Groceries")!.picks[0]
        .cardName
    ).toBe("Everyday Cash")
  })

  it("ranks cards that carry a balance with loans", () => {
    createCard(db, { ...account, name: "Paid off" }, { ...plain, apr: 0.29 })
    createCard(
      db,
      { ...account, name: "Carried" },
      { ...plain, apr: 0.2999, carriesBalance: true },
      { amount: 1_200_00, asOf: "2026-11-01" }
    )
    expect(rankDebts(db)).toMatchObject([
      {
        name: "Carried",
        kind: "credit_card",
        rate: 0.2999,
        monthlyInterest: 29_99,
      },
    ])
  })

  it("keeps reward categories with bonuses from being deleted", () => {
    const amazon = createRewardCategory(db, "Amazon")
    createCard(
      db,
      { ...account, name: "Store Card" },
      {
        ...plain,
        bonuses: [
          {
            rewardCategoryId: amazon.id,
            rate: 5,
            cap: null,
            capPeriod: null,
            condition: "",
            year: null,
            quarter: null,
          },
        ],
      }
    )
    expect(() => deleteRewardCategory(db, amazon.id)).toThrow("first")
    expect(() => createRewardCategory(db, "amazon")).toThrow("already exists")
  })
})
