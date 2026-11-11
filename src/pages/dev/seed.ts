import type { APIRoute } from "astro"

import { loadSeed, type Seed } from "@/server/seed"

/**
 * Loads a seed file into the database, for `pnpm seed`. Only the dev server
 * has it; production builds answer 404.
 */
export const POST: APIRoute = async ({ request, url }) => {
  if (!import.meta.env.DEV) return new Response("Not found", { status: 404 })
  const seed = (await request.json()) as Seed
  try {
    const result = loadSeed(seed, {
      replace: url.searchParams.get("replace") === "1",
    })
    return Response.json(result)
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : String(error),
      { status: 400 }
    )
  }
}
