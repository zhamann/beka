import type { z } from "astro/zod"

/**
 * A change or read the app and the agent share: the app calls it as an Astro
 * Action, the agent as an MCP tool. Inputs use dollars and percents as typed.
 */
export interface Operation<S extends z.ZodType = z.ZodType, R = unknown> {
  /** What it does, for the agent. */
  description: string
  input: S
  handler: (input: z.output<S>) => R
}

export const op = <S extends z.ZodType, R>(operation: Operation<S, R>) =>
  operation
