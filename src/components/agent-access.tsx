import { IconCopy, IconKey, IconTrash } from "@tabler/icons-react"
import { actions } from "astro:actions"
import { useId, useState, useTransition } from "react"
import { toast } from "sonner"

import { ConfirmDelete } from "@/components/confirm-delete"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { formatDateTime } from "@/lib/dates"
import type { AgentKey } from "@/server/agent/keys"

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success("Copied.")
  } catch {
    toast.error("Couldn't copy; select it instead.")
  }
}

/** Creates and revokes the keys an AI agent uses to reach Beka over MCP. */
export function AgentAccess({ keys }: { keys: AgentKey[] }) {
  const id = useId()
  const [name, setName] = useState("")
  const [created, setCreated] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const url =
    typeof window === "undefined" ? "/mcp" : `${window.location.origin}/mcp`
  const command = created
    ? `claude mcp add --transport http beka ${url} --header "Authorization: Bearer ${created}"`
    : ""

  return (
    <div className="flex flex-col gap-3">
      {keys.length > 0 && (
        <ItemGroup>
          {keys.map((key) => (
            <Item key={key.id} variant="outline" size="sm" role="listitem">
              <ItemContent>
                <ItemTitle>{key.name}</ItemTitle>
                <ItemDescription>
                  Created {formatDateTime(key.createdAt)},{" "}
                  {key.lastUsedAt
                    ? `last used ${formatDateTime(key.lastUsedAt)}`
                    : "never used"}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <ConfirmDelete
                  title={`Revoke ${key.name}?`}
                  description="Agents using this key lose access right away."
                  confirmLabel="Revoke"
                  onConfirm={() => actions.revokeAgentKey({ id: key.id })}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Revoke ${key.name}`}
                    >
                      <IconTrash />
                    </Button>
                  }
                />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          startTransition(async () => {
            const { data, error } = await actions.createAgentKey({ name })
            if (error) return setError(error.message)
            setError(undefined)
            setCreated(data.key)
          })
        }}
      >
        <Field className="w-56">
          <FieldLabel htmlFor={id}>Key name</FieldLabel>
          <Input
            id={id}
            value={name}
            placeholder="e.g. Claude"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="outline" disabled={pending}>
          <IconKey />
          Create agent key
        </Button>
        {error && <FieldError>{error}</FieldError>}
      </form>
      <Dialog
        open={created !== undefined}
        onOpenChange={(open) => !open && window.location.reload()}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Your agent key</DialogTitle>
            <DialogDescription>
              Copy it now; it won't be shown again. Connect any MCP client to{" "}
              {url} with the key as a Bearer token. In Claude Code, run:
            </DialogDescription>
          </DialogHeader>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs whitespace-pre">
            {command}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => copy(created ?? "")}>
              <IconCopy />
              Copy key
            </Button>
            <Button onClick={() => copy(command)}>
              <IconCopy />
              Copy command
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
