import type { DatabaseSync } from "node:sqlite"

import { isDebt, type AccountKind } from "@/lib/accounts"

import { logChange } from "./activity"
import { transaction } from "./database"
import {
  BekaError,
  notFound,
  SQLITE_CONSTRAINT_FOREIGNKEY,
  SQLITE_CONSTRAINT_TRIGGER,
  SQLITE_CONSTRAINT_UNIQUE,
  translate,
} from "./errors"

export interface AccountInput {
  name: string
  kind: AccountKind
  subtype: string
  institution: string
  last4: string
  /** `null` means the account is joint. */
  ownerId: number | null
  notes: string
}

export interface Balance {
  id: number
  /** Cents. Debts are positive amounts owed. */
  amount: number
  asOf: string
  recordedAt: string
}

export interface Account extends AccountInput {
  id: number
  ownerName: string | null
  archivedAt: string | null
  /** The most recent balance by date, or `null` before one is entered. */
  balance: Balance | null
}

const duplicate = new BekaError(
  "duplicate-name",
  "Another account already has that name."
)

const accountColumns = `
  a.id, a.name, a.kind, a.subtype, a.institution, a.last4,
  a.owner_id AS ownerId, m.name AS ownerName, a.notes, a.archived_at AS archivedAt,
  b.id AS balanceId, b.amount AS balanceAmount, b.as_of AS balanceAsOf,
  b.recorded_at AS balanceRecordedAt`

const accountFrom = `
  FROM accounts a
  LEFT JOIN members m ON m.id = a.owner_id
  LEFT JOIN balances b ON b.id = (
    SELECT id FROM balances WHERE account_id = a.id
    ORDER BY as_of DESC, id DESC LIMIT 1
  )`

type AccountRow = Omit<Account, "balance"> & {
  balanceId: number | null
  balanceAmount: number | null
  balanceAsOf: string | null
  balanceRecordedAt: string | null
}

function toAccount(row: AccountRow): Account {
  const { balanceId, balanceAmount, balanceAsOf, balanceRecordedAt, ...rest } =
    row
  return {
    ...rest,
    balance:
      balanceId === null
        ? null
        : {
            id: balanceId,
            amount: balanceAmount!,
            asOf: balanceAsOf!,
            recordedAt: balanceRecordedAt!,
          },
  }
}

/** Accounts sorted by name, open ones only unless `archived` is set. */
export function listAccounts(
  db: DatabaseSync,
  {
    kinds,
    archived = false,
  }: { kinds?: readonly AccountKind[]; archived?: boolean } = {}
): Account[] {
  const where = [
    archived ? "a.archived_at IS NOT NULL" : "a.archived_at IS NULL",
  ]
  const params: string[] = []
  if (kinds) {
    where.push(`a.kind IN (${kinds.map(() => "?").join(", ")})`)
    params.push(...kinds)
  }
  const rows = db
    .prepare(
      `SELECT ${accountColumns} ${accountFrom}
       WHERE ${where.join(" AND ")} ORDER BY a.name COLLATE NOCASE`
    )
    .all(...params) as unknown as AccountRow[]
  return rows.map(toAccount)
}

export function getAccount(db: DatabaseSync, id: number): Account {
  const row = db
    .prepare(`SELECT ${accountColumns} ${accountFrom} WHERE a.id = ?`)
    .get(id) as AccountRow | undefined
  if (!row) throw notFound("account")
  return toAccount(row)
}

/** Checks that `id` is an account of one of `kinds`, and returns it. */
export function getAccountOfKind(
  db: DatabaseSync,
  id: number,
  kinds: readonly AccountKind[],
  what = "account"
): Account {
  const row = db
    .prepare(`SELECT ${accountColumns} ${accountFrom} WHERE a.id = ?`)
    .get(id) as AccountRow | undefined
  if (!row || !kinds.includes(row.kind)) throw notFound(what)
  return toAccount(row)
}

function writeAccount(db: DatabaseSync, input: AccountInput, id?: number) {
  const values = [
    input.name.trim(),
    input.kind,
    input.subtype.trim(),
    input.institution.trim(),
    input.last4.trim(),
    input.ownerId,
    input.notes.trim(),
  ]
  try {
    if (id === undefined) {
      return Number(
        db
          .prepare(
            `INSERT INTO accounts (name, kind, subtype, institution, last4, owner_id, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(...values).lastInsertRowid
      )
    }
    db.prepare(
      `UPDATE accounts SET name = ?, kind = ?, subtype = ?, institution = ?,
       last4 = ?, owner_id = ?, notes = ? WHERE id = ?`
    ).run(...values, id)
    return id
  } catch (error) {
    translate(error, {
      [SQLITE_CONSTRAINT_UNIQUE]: duplicate,
      [SQLITE_CONSTRAINT_FOREIGNKEY]: notFound("person"),
    })
  }
}

/** Adds an account, with its first balance when one is given. */
export function createAccount(
  db: DatabaseSync,
  input: AccountInput,
  balance?: { amount: number; asOf: string }
): Account {
  return transaction(db, () => {
    const id = writeAccount(db, input)
    if (balance) insertBalance(db, id, balance.amount, balance.asOf)
    const account = getAccount(db, id)
    logChange(db, {
      action: "create",
      entity: "account",
      entityId: id,
      summary: `Added the account ${account.name}`,
      after: account,
    })
    return account
  })
}

/** Updates an account's details. Its kind can only change within debts or within non-debts. */
export function updateAccount(
  db: DatabaseSync,
  id: number,
  input: AccountInput
): Account {
  return transaction(db, () => {
    const before = getAccount(db, id)
    if (
      isDebt(before.kind) !== isDebt(input.kind) ||
      (isDebt(input.kind) && input.kind !== before.kind)
    ) {
      throw new BekaError(
        "invalid",
        "An account can't change into a loan or card, or back."
      )
    }
    writeAccount(db, input, id)
    const after = getAccount(db, id)
    logChange(db, {
      action: "update",
      entity: "account",
      entityId: id,
      summary: `Updated the account ${after.name}`,
      before,
      after,
    })
    return after
  })
}

/** Archives a closed account, or brings an archived one back. */
export function setArchived(
  db: DatabaseSync,
  id: number,
  archived: boolean
): Account {
  return transaction(db, () => {
    const before = getAccount(db, id)
    db.prepare("UPDATE accounts SET archived_at = ? WHERE id = ?").run(
      archived ? (before.archivedAt ?? new Date().toISOString()) : null,
      id
    )
    const after = getAccount(db, id)
    logChange(db, {
      action: "update",
      entity: "account",
      entityId: id,
      summary: archived
        ? `Archived the account ${after.name}`
        : `Restored the archived account ${after.name}`,
      before,
      after,
    })
    return after
  })
}

/** Deletes an account that nothing else refers to; archive it otherwise. */
export function deleteAccount(db: DatabaseSync, id: number) {
  transaction(db, () => {
    const before = getAccount(db, id)
    try {
      db.prepare("DELETE FROM accounts WHERE id = ?").run(id)
    } catch (error) {
      const inUse = new BekaError(
        "in-use",
        `${before.name} has transactions or income linked to it. Archive it instead.`
      )
      translate(error, {
        [SQLITE_CONSTRAINT_FOREIGNKEY]: inUse,
        [SQLITE_CONSTRAINT_TRIGGER]: inUse,
      })
    }
    logChange(db, {
      action: "delete",
      entity: "account",
      entityId: id,
      summary: `Deleted the account ${before.name}`,
      before,
    })
  })
}

function insertBalance(
  db: DatabaseSync,
  accountId: number,
  amount: number,
  asOf: string
): number {
  return Number(
    db
      .prepare(
        "INSERT INTO balances (account_id, amount, as_of, recorded_at) VALUES (?, ?, ?, ?)"
      )
      .run(accountId, amount, asOf, new Date().toISOString()).lastInsertRowid
  )
}

/** Records a new balance. Earlier balances stay in the account's history. */
export function recordBalance(
  db: DatabaseSync,
  accountId: number,
  amount: number,
  asOf: string
): Account {
  return transaction(db, () => {
    const before = getAccount(db, accountId)
    insertBalance(db, accountId, amount, asOf)
    const after = getAccount(db, accountId)
    logChange(db, {
      action: "create",
      entity: "balance",
      entityId: accountId,
      summary: `Updated the balance of ${after.name}`,
      before: before.balance,
      after: { amount, asOf },
    })
    return after
  })
}

/** Deletes one entry from an account's balance history. */
export function deleteBalance(db: DatabaseSync, balanceId: number) {
  transaction(db, () => {
    const before = db
      .prepare(
        "SELECT b.id, b.account_id AS accountId, b.amount, b.as_of AS asOf, a.name FROM balances b JOIN accounts a ON a.id = b.account_id WHERE b.id = ?"
      )
      .get(balanceId) as
      | {
          id: number
          accountId: number
          amount: number
          asOf: string
          name: string
        }
      | undefined
    if (!before) throw notFound("balance")
    db.prepare("DELETE FROM balances WHERE id = ?").run(balanceId)
    logChange(db, {
      action: "delete",
      entity: "balance",
      entityId: before.accountId,
      summary: `Deleted a balance of ${before.name}`,
      before,
    })
  })
}

/** Corrects a recorded balance's amount or date, keeping it in the history. */
export function updateBalance(
  db: DatabaseSync,
  balanceId: number,
  { amount, asOf }: { amount: number; asOf: string }
) {
  return transaction(db, () => {
    const select = db.prepare(
      "SELECT b.id, b.account_id AS accountId, b.amount, b.as_of AS asOf, a.name FROM balances b JOIN accounts a ON a.id = b.account_id WHERE b.id = ?"
    )
    type Row = {
      id: number
      accountId: number
      amount: number
      asOf: string
      name: string
    }
    const before = select.get(balanceId) as Row | undefined
    if (!before) throw notFound("balance")
    db.prepare("UPDATE balances SET amount = ?, as_of = ? WHERE id = ?").run(
      amount,
      asOf,
      balanceId
    )
    const after = select.get(balanceId) as Row
    logChange(db, {
      action: "update",
      entity: "balance",
      entityId: before.accountId,
      summary: `Corrected a balance of ${before.name}`,
      before,
      after,
    })
    return after
  })
}

/** Every balance recorded for an account, newest first. */
export function balanceHistory(db: DatabaseSync, accountId: number): Balance[] {
  return db
    .prepare(
      `SELECT id, amount, as_of AS asOf, recorded_at AS recordedAt FROM balances
       WHERE account_id = ? ORDER BY as_of DESC, id DESC`
    )
    .all(accountId) as unknown as Balance[]
}

export interface NetWorth {
  /** Cents held across open accounts and assets. */
  assets: number
  /** Cents owed across open loans and cards. */
  debts: number
  net: number
  byKind: Partial<Record<AccountKind, number>>
}

/** Net worth from each open account's latest balance. */
export function netWorth(db: DatabaseSync): NetWorth {
  const byKind: Partial<Record<AccountKind, number>> = {}
  let assets = 0
  let debts = 0
  for (const account of listAccounts(db)) {
    const amount = account.balance?.amount ?? 0
    byKind[account.kind] = (byKind[account.kind] ?? 0) + amount
    if (isDebt(account.kind)) debts += amount
    else assets += amount
  }
  return { assets, debts, net: assets - debts, byKind }
}
