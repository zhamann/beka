import type { DatabaseSync } from "node:sqlite"

import { ActionError } from "astro:actions"
import { z } from "astro/zod"

import { operations } from "@/actions"
import { today } from "@/lib/dates"
import { LATEST_TAX_YEAR } from "@/lib/paycheck/tax-years"

import { listAccounts } from "../accounts"
import { runAs } from "../activity"
import { whichCard } from "../cards"
import { dashboard } from "../dashboard"
import { BekaError } from "../errors"
import { incomeYear, listJobs, listOtherIncome } from "../income"
import { aiInstructions, importTransactions, previewImport } from "../imports"
import { rankDebts } from "../loans"
import { listRecurring } from "../recurring"
import { shiftMonth, spendingTable } from "../spending"
import { QUERY_ROW_LIMIT, queryDatabase } from "./query"

export interface Tool {
  name: string
  description: string
  input: z.ZodType
  /** Read-only tools don't change anything. */
  readOnly: boolean
  run: (input: never, db: DatabaseSync) => unknown | Promise<unknown>
}

const DATABASE_NOTES = `Conventions:
- Money columns are integer cents. Transaction amounts are negative for money out and positive for money in.
- Balances store debts (loans, credit cards) as positive amounts owed. An account's current balance is its newest row in balances by as_of.
- Rates (loans.interest_rate, cards.apr) are yearly fractions: 0.0924 is 9.24%.
- Dates are YYYY-MM-DD text.
- categories.type: 'spending' counts in Spend, 'income' is money in, 'excluded' is transfers, card payments, and investing.
- transactions.recurring_id links a charge to a recurring payment; those charges count in Recurring, not Spend.
- recurring.status: 'suggested' (awaiting a decision), 'active', 'ended', 'dismissed'.
- jobs store pay settings as JSON; use get_income for computed paychecks instead of reading them.
- activity is the log of every change, with actor 'app' or 'agent'.`

const noInput = z.object({})

/** Tools that read data, including what the app computes (paychecks, averages). */
const readTools: Tool[] = [
  {
    name: "get_overview",
    description:
      "Start here. The Dashboard's numbers (Income, Recurring, Spend, Net, all monthly), net worth by account type, what's coming up, and every reminder about out-of-date data with today's date. Check the reminders before relying on balances or spending.",
    input: noInput,
    readOnly: true,
    run: (_, db) => ({
      today: today(),
      taxTablesFor: LATEST_TAX_YEAR,
      definitions: {
        income:
          "Household take-home pay plus other income, this year's total ÷ 12.",
        incomeSources:
          "Each job's and other income's share of income, monthly, biggest first.",
        recurring: "Active recurring payments, as monthly equivalents.",
        spend:
          "Spending-category transactions that aren't recurring, averaged over the last 12 complete months.",
        net: "income − recurring − spend: what's left over each month.",
      },
      ...dashboard(db),
      accounts: listAccounts(db).map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        subtype: a.subtype,
        owner: a.ownerName ?? "Joint",
        balance: a.balance?.amount ?? null,
        balanceAsOf: a.balance?.asOf ?? null,
      })),
      amountsAre: "integer cents",
    }),
  },
  {
    name: "describe_database",
    description:
      "The database schema and its conventions, to write query_database queries.",
    input: noInput,
    readOnly: true,
    run: (_, db) => ({
      tables: (
        db
          .prepare(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
          )
          .all() as { sql: string }[]
      ).map((t) => t.sql),
      notes: DATABASE_NOTES,
    }),
  },
  {
    name: "query_database",
    description: `Run one read-only SQL query (SQLite) and get up to ${QUERY_ROW_LIMIT} rows. Use describe_database first. Writes are refused; use the other tools to change data.`,
    input: z.object({ sql: z.string().min(1).max(10_000) }),
    readOnly: true,
    run: ({ sql }: { sql: string }) => queryDatabase(sql),
  },
  {
    name: "get_income",
    description:
      "A year's paychecks and other income, worked out the way payroll does: every deposit with its date, amount, and accounts; each job's typical paycheck broken down into gross pay, pre-tax deductions, taxes, and after-tax deductions; and yearly totals per person and for the household (gross, each tax, retirement, HSA, deposited).",
    input: z.object({ year: z.number().int().min(2000).max(2100).optional() }),
    readOnly: true,
    run: ({ year }: { year?: number }, db) => {
      const result = incomeYear(db, year ?? Number(today().slice(0, 4)))
      return {
        year: result.year,
        taxTablesCurrent: result.taxTablesCurrent,
        monthlyTakeHome: result.monthly,
        household: result.household,
        byMember: result.byMember.map(({ member, totals }) => ({
          member: member.name,
          birthYear: member.birthYear,
          totals,
        })),
        jobs: listJobs(db).map((job) => ({
          ...job,
          typicalPaycheck: result.typical.get(job.id) ?? null,
        })),
        otherIncome: listOtherIncome(db),
        deposits: result.deposits.map((d) => ({
          date: d.date,
          member: d.memberName,
          from: d.source.kind === "job" ? d.source.employer : d.source.name,
          amount: d.amount,
          bonus: d.source.kind === "job" ? d.source.paycheck.bonus : 0,
          accounts: d.parts.map((p) => ({
            account: p.accountName,
            amount: p.amount,
          })),
        })),
      }
    },
  },
  {
    name: "get_spending",
    description:
      "Spending by category and month (spending-type categories; recurring payments left out unless includeRecurring). Months are YYYY-MM; defaults to the last 12 complete months plus the month so far.",
    input: z.object({
      from: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
      includeRecurring: z.boolean().optional(),
    }),
    readOnly: true,
    run: (
      input: { from?: string; to?: string; includeRecurring?: boolean },
      db
    ) => {
      const month = today().slice(0, 7)
      return spendingTable(db, {
        from: input.from ?? shiftMonth(month, -12),
        to: input.to ?? month,
        includeRecurring: input.includeRecurring,
      })
    },
  },
  {
    name: "get_recurring",
    description:
      "Recurring payments with their amounts, monthly equivalents, frequency, last and next charge, and linked charges. Includes suggestions and ended payments when asked.",
    input: z.object({
      statuses: z
        .array(z.enum(["suggested", "active", "ended", "dismissed"]))
        .optional(),
    }),
    readOnly: true,
    run: (
      {
        statuses,
      }: { statuses?: ("suggested" | "active" | "ended" | "dismissed")[] },
      db
    ) =>
      listRecurring(db, { statuses: statuses ?? ["active"] }).map((p) => ({
        ...p,
        charges: p.charges.slice(0, 24),
      })),
  },
  {
    name: "get_debts",
    description:
      "Loans, and credit cards carrying a balance, ranked for extra payments: by highest rate (avalanche) or smallest balance (snowball), with balances, minimum payments, and monthly interest.",
    input: z.object({ order: z.enum(["rate", "balance"]).optional() }),
    readOnly: true,
    run: ({ order }: { order?: "rate" | "balance" }, db) =>
      rankDebts(db, order ?? "rate"),
  },
  {
    name: "which_card",
    description:
      "For each reward category (and everything else), the household's cards ranked by effective return today.",
    input: noInput,
    readOnly: true,
    run: (_, db) => whichCard(db),
  },
  {
    name: "get_import_instructions",
    description:
      "The guide for preparing transaction uploads: the CSV format, rules, categories, accounts, and how each merchant has been categorized before. Read it before categorizing bank exports.",
    input: noInput,
    readOnly: true,
    run: (_, db) => aiInstructions(db),
  },
]

const importCsv: Tool = {
  name: "import_transactions_csv",
  description:
    "Import transactions from CSV text in the format get_import_instructions describes. Nothing is saved if any row has a problem; the problems are returned. Already-imported transactions are skipped. Set dryRun to only check.",
  input: z.object({
    csv: z
      .string()
      .min(1)
      .max(15 * 1024 * 1024),
    fileName: z.string().max(200).optional(),
    dryRun: z.boolean().optional(),
  }),
  readOnly: false,
  run: (
    {
      csv,
      fileName,
      dryRun,
    }: { csv: string; fileName?: string; dryRun?: boolean },
    db
  ) => {
    const preview = previewImport(db, csv)
    if (preview.fileError) return { saved: false, fileError: preview.fileError }
    const problems = preview.rows
      .filter((r) => r.errors.length)
      .map((r) => ({ line: r.line, errors: r.errors }))
    const summary = {
      rows: preview.rows.length,
      duplicates: preview.rows.filter((r) => r.duplicate).length,
      unknownCategories: preview.unknownCategories,
      unknownAccounts: preview.unknownAccounts,
      differentFromUsual: preview.rows
        .filter((r) => r.usualCategory)
        .map((r) => ({
          line: r.line,
          merchant: r.merchant,
          category: r.category,
          usually: r.usualCategory,
        })),
    }
    if (problems.length || dryRun) return { saved: false, ...summary, problems }
    const result = importTransactions(
      db,
      preview.rows.map((r) => ({
        date: r.date,
        merchant: r.merchant,
        description: r.description,
        amount: r.amount,
        categoryId: r.categoryId!,
        accountId: r.accountId!,
        notes: r.notes,
      })),
      fileName ?? "agent import"
    )
    return { saved: true, ...summary, ...result }
  },
}

const snakeCase = (name: string) =>
  name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

/** Operations the agent reaches through other tools instead. */
const HIDDEN = new Set(["previewImport", "importTransactions"])

/** Every tool the agent can call: the read tools, then each change the app can make. */
export const tools: Tool[] = [
  ...readTools,
  importCsv,
  ...Object.entries(operations)
    .filter(([name]) => !HIDDEN.has(name))
    .map(([name, operation]) => ({
      name: snakeCase(name),
      description: `${operation.description} Money inputs are dollars and rates are percents (9.24 for 9.24%); results use integer cents.`,
      input: operation.input,
      readOnly: false,
      run: (input: never) => operation.handler(input as never),
    })),
]

/** A tool's input as JSON Schema, for `tools/list`. */
export function inputSchema(tool: Tool): Record<string, unknown> {
  const schema = z.toJSONSchema(tool.input, {
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>
  delete schema.$schema
  return schema
}

export type ToolResult = {
  content: { type: "text"; text: string }[]
  isError?: boolean
}

const MAX_RESULT = 200_000

const text = (value: unknown, isError = false): ToolResult => {
  let body = typeof value === "string" ? value : JSON.stringify(value, null, 2)
  if (body.length > MAX_RESULT)
    body = `${body.slice(0, MAX_RESULT)}\n… (cut off; ask for less, or use query_database)`
  return {
    content: [{ type: "text", text: body }],
    ...(isError ? { isError: true } : {}),
  }
}

/** Runs a tool as the agent, so its changes are logged as the agent's. */
export async function callTool(
  db: DatabaseSync,
  name: string,
  args: unknown
): Promise<ToolResult> {
  const tool = tools.find((t) => t.name === name)
  if (!tool) return text(`There's no tool named ${name}.`, true)
  const parsed = tool.input.safeParse(args ?? {})
  if (!parsed.success) {
    return text(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
        .join("\n"),
      true
    )
  }
  try {
    return text(
      (await runAs("agent", () => tool.run(parsed.data as never, db))) ?? {
        ok: true,
      }
    )
  } catch (error) {
    if (error instanceof BekaError || error instanceof ActionError)
      return text(error.message, true)
    if (error instanceof Error && /SQLITE|readonly|syntax/i.test(error.message))
      return text(error.message, true)
    throw error
  }
}
