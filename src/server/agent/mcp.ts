import type { DatabaseSync } from "node:sqlite"

import { version } from "../../../package.json"
import { callTool, inputSchema, tools } from "./tools"

/** MCP protocol versions this server speaks, newest first. */
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"]

export const SERVER_INSTRUCTIONS = `Beka holds one household's current finances: income worked out from each job's pay and Form W-4, accounts and balances, loans, credit cards and their rewards, categorized transactions, and recurring payments. It shows current state only; planning and advice are your job.

Before answering, call get_overview. Its reminders list data that's out of date (old balances, transactions not imported, payments that may have ended); tell the person what to update, and use the as-of dates when you rely on a number.

Amounts in results and in the database are integer cents. Tool inputs take dollars and percents, the way a person types them. Transaction amounts are negative for money out.

Every change you make is logged as the agent's in the app's activity log, and daily backups are kept, but confirm with the person before deleting anything or making large changes.`

interface Request {
  jsonrpc: "2.0"
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

const result = (id: Request["id"], value: unknown) => ({
  jsonrpc: "2.0",
  id,
  result: value,
})
const failure = (
  id: Request["id"] | undefined,
  code: number,
  message: string
) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
})

/**
 * Handles one JSON-RPC message for the MCP endpoint. Returns `null` for
 * notifications, which get no reply.
 */
export async function handleMessage(
  db: DatabaseSync,
  message: unknown
): Promise<object | null> {
  const request = message as Request
  if (
    !request ||
    typeof request !== "object" ||
    request.jsonrpc !== "2.0" ||
    typeof request.method !== "string"
  ) {
    return failure(null, -32600, "Invalid request")
  }
  if (request.id === undefined) return null
  switch (request.method) {
    case "initialize": {
      const asked = String(request.params?.protocolVersion ?? "")
      return result(request.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked)
          ? asked
          : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "beka", title: "Beka", version },
        instructions: SERVER_INSTRUCTIONS,
      })
    }
    case "ping":
      return result(request.id, {})
    case "tools/list":
      return result(request.id, {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: inputSchema(tool),
          annotations: {
            readOnlyHint: tool.readOnly,
            destructiveHint:
              !tool.readOnly && /delete|undo|revoke/.test(tool.name),
          },
        })),
      })
    case "tools/call": {
      const name = String(request.params?.name ?? "")
      return result(
        request.id,
        await callTool(db, name, request.params?.arguments)
      )
    }
    default:
      return failure(request.id, -32601, `Method not found: ${request.method}`)
  }
}
