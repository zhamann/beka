import { defineAction } from "astro:actions"
import { z } from "astro/zod"

import { createAgentKey, revokeAgentKey } from "@/server/agent/keys"

import { run } from "./run"
import { id } from "./schemas"

/** Agent keys are managed in the app only; the agent can't make its own. */
export const agentKeys = {
  createAgentKey: defineAction({
    input: z.object({
      name: z.string().trim().min(1, "Name the key, like “Claude”.").max(60),
    }),
    handler: ({ name }) => run((db) => createAgentKey(db, name)),
  }),
  revokeAgentKey: defineAction({
    input: z.object({ id }),
    handler: ({ id }) => run((db) => revokeAgentKey(db, id)),
  }),
}
