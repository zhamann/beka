import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it } from "vitest"

import { createAccount } from "./accounts"
import { createCard, type CardTerms } from "./cards"
import { listCategories } from "./categories"
import { openDatabase } from "./database"
import { importTransactions, previewImport, type ImportRow } from "./imports"
import {
  confirmRecurring,
  createRecurring,
  detectFrequency,
  dismissRecurring,
  getRecurring,
  keepRecurring,
  listRecurring,
  recurringMonthly,
  restoreSuggestion,
  setTransactionRecurring,
  stepDate,
} from "./recurring"
import { listTransactions } from "./transactions"

let db: DatabaseSync
let accountId: number
beforeEach(() => {
  db = openDatabase(":memory:")
  accountId = createAccount(db, {
    name: "Checking",
    kind: "checking",
    subtype: "",
    institution: "",
    last4: "",
    ownerId: null,
    notes: "",
  }).id
})

const category = (name: string) =>
  listCategories(db).find((c) => c.name === name)!.id
const charge = (
  merchant: string,
  date: string,
  dollars: number,
  categoryName = "Health & Wellness"
): ImportRow => ({
  date,
  merchant,
  description: merchant.toUpperCase(),
  amount: Math.round(-dollars * 100),
  categoryId: category(categoryName),
  accountId,
  notes: "",
})
const monthly = (
  merchant: string,
  dollars: number[],
  categoryName?: string,
  start = 1
) =>
  dollars.map((amount, i) =>
    charge(
      merchant,
      `2026-${String(start + i).padStart(2, "0")}-05`,
      amount,
      categoryName
    )
  )
const suggestions = (on: string) =>
  listRecurring(db, { statuses: ["suggested"], on })
/** Imports as if it were `on`, so suggestions don't depend on the real date. */
const load = (rows: ImportRow[], on: string) =>
  importTransactions(db, rows, "", on)

describe("dates", () => {
  it("steps by months, clamping to the month's end", () => {
    expect(stepDate("2026-01-31", "monthly")).toBe("2026-02-28")
    expect(stepDate("2026-11-06", "yearly", -1)).toBe("2025-11-06")
    expect(stepDate("2026-11-06", "biweekly")).toBe("2026-11-20")
  })

  it("recognizes regular gaps", () => {
    expect(
      detectFrequency(["2026-01-05", "2026-02-05", "2026-03-06", "2026-04-05"])
    ).toBe("monthly")
    expect(detectFrequency(["2025-06-20", "2026-06-18"])).toBe("yearly")
    expect(
      detectFrequency(["2026-01-05", "2026-01-09", "2026-02-20"])
    ).toBeNull()
  })
})

describe("finding recurring payments", () => {
  it("suggests a steady charge, leaving one-off charges from the same merchant out", () => {
    load(
      [
        ...monthly(
          "Club Fitness",
          [27.99, 27.99, 27.99, 27.99, 27.99, 27.99, 27.99, 27.99, 27.99, 27.99]
        ),
        charge("Club Fitness", "2026-02-15", 39.99),
      ],
      "2026-11-01"
    )
    const [suggestion] = suggestions("2026-11-01")
    expect(suggestion).toMatchObject({
      merchant: "Club Fitness",
      frequency: "monthly",
      matchMode: "near",
      referenceAmount: 27_99,
    })

    confirmRecurring(db, suggestion.id)
    const payment = getRecurring(db, suggestion.id, "2026-11-01")
    expect(payment).toMatchObject({
      status: "active",
      amount: 27_99,
      monthly: 27_99,
      nextCharge: "2026-11-05",
    })
    expect(payment.charges).toHaveLength(10)

    // New charges link on import; the one-off stays plain spending.
    load(
      [
        charge("Club Fitness", "2026-11-05", 27.99),
        charge("Club Fitness", "2026-11-20", 39.99),
      ],
      "2026-11-21"
    )
    expect(getRecurring(db, suggestion.id).charges).toHaveLength(11)
  })

  it("treats a bill that swings as one payment, counting its average", () => {
    const amounts = [
      129.56, 141.89, 227.03, 112.49, 119.14, 479.36, 300.1, 210.3, 150.0,
      140.0,
    ]
    load(monthly("Ameren", amounts, "Bills & Utilities"), "2026-11-01")
    const [suggestion] = suggestions("2026-11-01")
    expect(suggestion).toMatchObject({ frequency: "monthly", matchMode: "any" })
    confirmRecurring(db, suggestion.id)
    const total = amounts.reduce((sum, a) => sum + Math.round(a * 100), 0)
    expect(getRecurring(db, suggestion.id, "2026-11-01")).toMatchObject({
      amountMode: "average",
      amount: Math.round(total / amounts.length),
    })
  })

  it("counts yearly payments a twelfth at a time", () => {
    load(
      [
        charge("Peacock", "2025-10-03", 109.99, "Entertainment & Rec."),
        charge("Peacock", "2026-10-02", 129.99, "Entertainment & Rec."),
      ],
      "2026-11-01"
    )
    const [suggestion] = suggestions("2026-11-01")
    expect(suggestion.frequency).toBe("yearly")
    confirmRecurring(db, suggestion.id)
    expect(getRecurring(db, suggestion.id, "2026-11-01")).toMatchObject({
      amount: 129_99,
      monthly: 10_83,
    })
  })

  it("ignores irregular shopping and stops suggesting what was dismissed", () => {
    load(
      [
        charge("Walmart", "2026-10-01", 52.1, "Groceries"),
        charge("Walmart", "2026-10-04", 18.4, "Groceries"),
        charge("Walmart", "2026-10-19", 101.2, "Groceries"),
        ...monthly("Spotify", [11.99, 11.99, 11.99], "Entertainment & Rec.", 8),
      ],
      "2026-11-01"
    )
    expect(suggestions("2026-11-01").map((s) => s.merchant)).toEqual([
      "Spotify",
    ])
    dismissRecurring(db, suggestions("2026-11-01")[0].id)
    load(
      [charge("Spotify", "2026-11-05", 11.99, "Entertainment & Rec.")],
      "2026-11-06"
    )
    expect(suggestions("2026-11-06")).toEqual([])
  })

  it("keeps a bill one payment when one month's charge comes early", () => {
    load(
      [
        charge("Ameren", "2026-01-13", 224.84, "Bills & Utilities"),
        charge("Ameren", "2026-02-11", 220.83, "Bills & Utilities"),
        charge("Ameren", "2026-03-12", 192.83, "Bills & Utilities"),
        charge("Ameren", "2026-04-10", 246.41, "Bills & Utilities"),
        charge("Ameren", "2026-05-12", 204.49, "Bills & Utilities"),
        charge("Ameren", "2026-06-11", 141.89, "Bills & Utilities"),
        charge("Ameren", "2026-07-24", 187.21, "Bills & Utilities"),
        charge("Ameren", "2026-08-12", 465.46, "Bills & Utilities"),
        charge("Ameren", "2026-09-09", 479.36, "Bills & Utilities"),
        charge("Ameren", "2026-10-08", 455.71, "Bills & Utilities"),
      ],
      "2026-11-01"
    )
    expect(suggestions("2026-11-01")).toMatchObject([
      { merchant: "Ameren", matchMode: "any" },
    ])
  })

  it("doesn't call two matching charges a year apart at a busy store yearly", () => {
    load(
      [
        charge("Casey's", "2025-08-01", 14.6, "Auto & Transport"),
        charge("Casey's", "2026-08-02", 14.6, "Auto & Transport"),
        charge("Casey's", "2026-03-01", 40.12, "Auto & Transport"),
        charge("Casey's", "2026-05-20", 52.9, "Auto & Transport"),
        charge("Casey's", "2026-09-14", 31.0, "Auto & Transport"),
      ],
      "2026-11-01"
    )
    expect(suggestions("2026-11-01")).toEqual([])
  })

  it("never treats transfers or card payments as recurring", () => {
    load(
      monthly("Chase", [500, 500, 500, 500], "Credit Card Payment"),
      "2026-05-01"
    )
    expect(suggestions("2026-05-01")).toEqual([])
  })

  it("doesn't suggest payments that stopped long ago", () => {
    load(monthly("Old gym", [30, 30, 30, 30]), "2026-11-01")
    expect(suggestions("2026-11-01")).toEqual([])
  })
})

describe("recurring payments", () => {
  const gym = () => {
    load(monthly("Gym", [30, 30, 30, 30]), "2026-05-01")
    const [suggestion] = suggestions("2026-05-01")
    confirmRecurring(db, suggestion.id)
    return suggestion.id
  }

  it("asks whether a payment ended after missed charges", () => {
    const id = gym()
    expect(getRecurring(db, id, "2026-05-20").overdue).toBe(false)
    expect(getRecurring(db, id, "2026-07-20").overdue).toBe(true)
    keepRecurring(db, id, "2026-07-20")
    expect(getRecurring(db, id, "2026-08-01").overdue).toBe(false)
  })

  it("adds a card's annual fee and links the fee charge", () => {
    const terms: CardTerms = {
      rewardsCurrency: "points",
      pointValue: 1.3,
      baseRate: 1,
      annualFee: 99_00,
      annualFeeMonth: 2,
      foreignTransactionFee: true,
      creditLimit: null,
      apr: null,
      statementDueDay: null,
      carriesBalance: false,
      bonuses: [],
      credits: [],
    }
    const card = createCard(
      db,
      {
        name: "Travel Miles",
        subtype: "",
        institution: "Chase",
        last4: "7817",
        ownerId: null,
        notes: "",
      },
      terms
    )
    load(
      [
        {
          ...charge("Coffee shop", "2026-03-01", 99, "Dining & Drinks"),
          description: "COFFEE",
          accountId: card.id,
        },
        {
          ...charge("Gym", "2026-03-02", 99, "Health & Wellness"),
          description: "CLUB FEES",
          accountId: card.id,
        },
        {
          ...charge("Chase", "2025-02-01", 69, "Bills & Utilities"),
          description: "ANNUAL MEMBERSHIP FEE",
          accountId: card.id,
        },
        {
          ...charge("Chase", "2026-02-01", 99, "Bills & Utilities"),
          description: "ANNUAL MEMBERSHIP FEE",
          accountId: card.id,
        },
      ],
      "2026-02-02"
    )
    const [fee] = listRecurring(db, { on: "2026-11-06" })
    expect(fee).toMatchObject({
      name: "Travel Miles annual fee",
      amount: 99_00,
      monthly: 8_25,
      nextCharge: "2027-02-01",
    })
    // Last year's lower fee belongs too; coffee and club fees don't.
    expect(fee.charges).toHaveLength(2)
    expect(recurringMonthly(db, "2026-11-06")).toBe(8_25)
  })

  it("keeps a charge unflagged by hand from being linked again", () => {
    gym()
    const [latest] = listTransactions(db).transactions
    expect(latest.recurringName).toBe("Gym")
    setTransactionRecurring(db, latest.id, null)
    createRecurring(db, {
      name: "Gym again",
      merchant: "Gym",
      frequency: "monthly",
      amountMode: "latest",
      matchMode: "any",
      manualAmount: null,
      anchorDate: null,
      categoryId: null,
      accountId: null,
    })
    expect(listTransactions(db).transactions[0].recurringId).toBeNull()
  })

  it("shows in the import preview which charges will be recurring", () => {
    gym()
    const preview = previewImport(
      db,
      "date,merchant,description,amount,category,account\n2026-05-05,Gym,GYM,-30,Health & Wellness,Checking\n2026-05-06,Walmart,WALMART,-120,Groceries,Checking"
    )
    expect(preview.rows.map((r) => r.recurring?.name ?? null)).toEqual([
      "Gym",
      null,
    ])
  })

  it("counts manual payments without transactions", () => {
    createRecurring(db, {
      name: "Casey's car loan",
      merchant: "",
      frequency: "monthly",
      amountMode: "latest",
      matchMode: "any",
      manualAmount: 288_00,
      anchorDate: "2026-11-15",
      categoryId: category("Loan Payment"),
      accountId: null,
    })
    expect(listRecurring(db, { on: "2026-11-06" })[0]).toMatchObject({
      monthly: 288_00,
      nextCharge: "2026-11-15",
      categoryName: "Loan Payment",
    })
  })
})

describe("restoreSuggestion", () => {
  it("puts a dismissed suggestion back", () => {
    const payment = createRecurring(db, {
      name: "Gym",
      merchant: "Gym",
      frequency: "monthly",
      amountMode: "latest",
      matchMode: "any",
      manualAmount: 40_00,
      anchorDate: null,
      categoryId: null,
      accountId: null,
    })
    dismissRecurring(db, payment.id)
    restoreSuggestion(db, payment.id)
    expect(
      listRecurring(db, { statuses: ["suggested"] }).map((p) => p.id)
    ).toContain(payment.id)
  })
})
