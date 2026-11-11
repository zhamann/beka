import { IconEye, IconEyeOff } from "@tabler/icons-react"
import { useState } from "react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"

/** A password field with a button to show what's typed. */
export function PasswordInput(
  props: Omit<React.ComponentProps<typeof InputGroupInput>, "type">
) {
  const [shown, setShown] = useState(false)
  return (
    <InputGroup>
      <InputGroupInput {...props} type={shown ? "text" : "password"} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          onClick={() => setShown(!shown)}
        >
          {shown ? <IconEyeOff /> : <IconEye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
