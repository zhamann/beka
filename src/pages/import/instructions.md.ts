import type { APIRoute } from "astro"

import { getDatabase } from "@/server/database"
import { aiInstructions } from "@/server/imports"

export const GET: APIRoute = () =>
  new Response(aiInstructions(getDatabase()), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="beka-import-instructions.md"',
    },
  })
