import { defineAction } from "astro:actions"
import { z } from "astro/zod"

import { createBackup, restoreBackup } from "@/server/backups"

import { run } from "./run"

/** Backups are managed in the app only, not by the agent. */
export const backups = {
  createBackup: defineAction({
    handler: () => run(() => createBackup("manual")),
  }),
  restoreBackup: defineAction({
    input: z.object({ name: z.string().max(100) }),
    handler: ({ name }) => run(() => restoreBackup({ name })),
  }),
}
