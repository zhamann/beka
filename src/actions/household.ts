import { z } from "astro/zod"

import { createMember, deleteMember, updateMember } from "@/server/household"

import { op } from "./operation"
import { run } from "./run"

const member = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(100),
  birthYear: z
    .number()
    .int()
    .min(1900, "Enter a four-digit year.")
    .max(2100, "Enter a four-digit year.")
    .nullable(),
})

export const household = {
  createMember: op({
    description: "Add a person to the household.",
    input: member,
    handler: (input) => run((db) => createMember(db, input)),
  }),
  updateMember: op({
    description: "Change a household member's name or birth year.",
    input: member.extend({ id: z.number().int() }),
    handler: ({ id, ...input }) => run((db) => updateMember(db, id, input)),
  }),
  deleteMember: op({
    description: "Remove a household member who has no income or accounts.",
    input: z.object({ id: z.number().int() }),
    handler: ({ id }) => run((db) => deleteMember(db, id)),
  }),
}
