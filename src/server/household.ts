import type { DatabaseSync } from "node:sqlite"

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

export interface MemberInput {
  name: string
  birthYear: number | null
}

export interface Member extends MemberInput {
  id: number
}

const duplicate = new BekaError(
  "duplicate-name",
  "Someone in the household already has that name."
)

/** Household members, sorted by name. */
export function listMembers(db: DatabaseSync): Member[] {
  return db
    .prepare(
      "SELECT id, name, birth_year AS birthYear FROM members ORDER BY name COLLATE NOCASE"
    )
    .all() as unknown as Member[]
}

export function getMember(db: DatabaseSync, id: number): Member {
  const member = db
    .prepare(
      "SELECT id, name, birth_year AS birthYear FROM members WHERE id = ?"
    )
    .get(id) as Member | undefined
  if (!member) throw notFound("person")
  return member
}

export function createMember(db: DatabaseSync, input: MemberInput): Member {
  return transaction(db, () => {
    let id: number
    try {
      id = Number(
        db
          .prepare("INSERT INTO members (name, birth_year) VALUES (?, ?)")
          .run(input.name.trim(), input.birthYear).lastInsertRowid
      )
    } catch (error) {
      translate(error, { [SQLITE_CONSTRAINT_UNIQUE]: duplicate })
    }
    const member = getMember(db, id)
    logChange(db, {
      action: "create",
      entity: "member",
      entityId: id,
      summary: `Added ${member.name} to the household`,
      after: member,
    })
    return member
  })
}

export function updateMember(
  db: DatabaseSync,
  id: number,
  input: MemberInput
): Member {
  return transaction(db, () => {
    const before = getMember(db, id)
    try {
      db.prepare(
        "UPDATE members SET name = ?, birth_year = ? WHERE id = ?"
      ).run(input.name.trim(), input.birthYear, id)
    } catch (error) {
      translate(error, { [SQLITE_CONSTRAINT_UNIQUE]: duplicate })
    }
    const after = getMember(db, id)
    logChange(db, {
      action: "update",
      entity: "member",
      entityId: id,
      summary: `Updated ${after.name}`,
      before,
      after,
    })
    return after
  })
}

/** Deletes a member who has no income, accounts, or other records. */
export function deleteMember(db: DatabaseSync, id: number) {
  transaction(db, () => {
    const before = getMember(db, id)
    try {
      db.prepare("DELETE FROM members WHERE id = ?").run(id)
    } catch (error) {
      const inUse = new BekaError(
        "in-use",
        `Move or delete ${before.name}'s income and accounts first.`
      )
      translate(error, {
        [SQLITE_CONSTRAINT_FOREIGNKEY]: inUse,
        [SQLITE_CONSTRAINT_TRIGGER]: inUse,
      })
    }
    logChange(db, {
      action: "delete",
      entity: "member",
      entityId: id,
      summary: `Removed ${before.name} from the household`,
      before,
    })
  })
}
