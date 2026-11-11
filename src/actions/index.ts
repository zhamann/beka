import { defineAction } from "astro:actions"

import { household } from "./household"

/** Every operation, shared by the app's actions and the agent's tools. */
export const operations = {
  ...household,
}

// Each operation becomes an Astro Action, keeping its input and output types.
export const server = {
  createMember: defineAction(household.createMember),
  updateMember: defineAction(household.updateMember),
  deleteMember: defineAction(household.deleteMember),
}
