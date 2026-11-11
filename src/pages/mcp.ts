import type { APIRoute } from "astro"

import { verifyAgentKey } from "@/server/agent/keys"
import { handleMessage } from "@/server/agent/mcp"
import { readBody } from "@/server/body"
import { getDatabase } from "@/server/database"

/** The largest message the endpoint reads: room for a 15 MB CSV import. */
const LIMIT = 32 * 1024 * 1024

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

/** The MCP endpoint (Streamable HTTP, stateless JSON replies) for the household's agent. */
export const POST: APIRoute = async ({ request }) => {
  const db = getDatabase()
  const key = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!verifyAgentKey(db, key)) {
    return json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32001,
          message:
            "Create an agent key in Beka's Settings and send it as a Bearer token.",
        },
      },
      401
    )
  }
  const body = await readBody(request, LIMIT)
  if (!body) {
    return json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "That message is too big." },
      },
      413
    )
  }
  let message: unknown
  try {
    message = JSON.parse(new TextDecoder().decode(body))
  } catch {
    return json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      },
      400
    )
  }
  if (Array.isArray(message)) {
    const replies = (
      await Promise.all(message.map((m) => handleMessage(db, m)))
    ).filter((r) => r !== null)
    return replies.length ? json(replies) : new Response(null, { status: 202 })
  }
  const reply = await handleMessage(db, message)
  return reply ? json(reply) : new Response(null, { status: 202 })
}

// This server doesn't stream, so there's no event stream to open or session to end.
export const GET: APIRoute = () =>
  new Response(null, { status: 405, headers: { Allow: "POST" } })
export const DELETE: APIRoute = () =>
  new Response(null, { status: 405, headers: { Allow: "POST" } })
