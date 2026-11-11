import { useId } from "react"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

/** A switch that turns a page's option on or off by going to `href`. */
export function LinkSwitch({
  label,
  checked,
  href,
}: {
  label: string
  checked: boolean
  /** The page with the option flipped. */
  href: string
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={id}
        aria-labelledby={`${id}-label`}
        checked={checked}
        onCheckedChange={() => window.location.assign(href)}
      />
      <Label htmlFor={id} id={`${id}-label`} className="text-sm">
        {label}
      </Label>
    </div>
  )
}
