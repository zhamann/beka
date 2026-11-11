import { IconChevronRight, IconCopy, IconDownload } from "@tabler/icons-react"
import { cn } from "cn"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"

/**
 * Copies or downloads the instructions for the AI that prepares uploads, with
 * a preview so you can see what you're handing over.
 */
export function CopyInstructions({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              toast.success("Copied the instructions.")
            } catch {
              toast.error("Couldn't copy. Download the file instead.")
            }
          }}
        >
          <IconCopy />
          Copy
        </Button>
        <a
          href="/import/instructions.md"
          download
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          <IconDownload />
          Download
        </a>
      </div>
      <details className="group/preview rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <IconChevronRight
            className="size-4 transition-transform group-open/preview:rotate-90"
            aria-hidden="true"
          />
          Preview the instructions
          <span className="font-normal text-muted-foreground">
            ({text.split("\n").length.toLocaleString()} lines)
          </span>
        </summary>
        <pre className="max-h-80 overflow-auto border-t px-4 py-3 text-xs whitespace-pre-wrap">
          {text}
        </pre>
      </details>
    </div>
  )
}
