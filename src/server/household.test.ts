import { beforeEach, describe, expect, it } from "vitest"
import type { DatabaseSync } from "node:sqlite"

import { listActivity, runAs } from "./activity"
import { openDatabase } from "./database"
import {
  createMember,
  deleteMember,
  listMembers,
  updateMember,
} from "./household"

let db: DatabaseSync
beforeEach(() => {
  db = openDatabase(":memory:")
})

describe("household members", () => {
  it("creates, renames and deletes members, sorted by name", () => {
    const robin = createMember(db, { name: " Robin ", birthYear: 1988 })
    createMember(db, { name: "Casey", birthYear: null })
    expect(listMembers(db).map((m) => m.name)).toEqual(["Casey", "Robin"])

    updateMember(db, robin.id, { name: "Robyn", birthYear: 1988 })
    expect(listMembers(db).map((m) => m.name)).toEqual(["Casey", "Robyn"])

    deleteMember(db, robin.id)
    expect(listMembers(db).map((m) => m.name)).toEqual(["Casey"])
  })

  it("refuses duplicate names, ignoring case", () => {
    createMember(db, { name: "Casey", birthYear: null })
    expect(() => createMember(db, { name: "casey", birthYear: null })).toThrow(
      "already has that name"
    )
  })

  it("logs each change with who made it", () => {
    const member = createMember(db, { name: "Casey", birthYear: null })
    runAs("agent", () =>
      updateMember(db, member.id, { name: "Casey", birthYear: 1990 })
    )
    const [update, create] = listActivity(db)
    expect(create).toMatchObject({ actor: "app", action: "create" })
    expect(update).toMatchObject({
      actor: "agent",
      action: "update",
      before: { birthYear: null },
      after: { birthYear: 1990 },
    })
  })

  it("reports a missing member", () => {
    expect(() => deleteMember(db, 99)).toThrow("no longer exists")
  })
})
