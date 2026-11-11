import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react"
import { useState } from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { parseTheme, storeTheme, type Theme } from "@/lib/theme"

const options = [
  { value: "system", label: "System", icon: IconDeviceDesktop },
  { value: "light", label: "Light", icon: IconSun },
  { value: "dark", label: "Dark", icon: IconMoon },
] satisfies { value: Theme; label: string; icon: unknown }[]

/** Picks light, dark, or the device's theme, and applies it right away. */
export function ThemeSetting({ theme: initialTheme }: { theme: Theme }) {
  const [theme, setTheme] = useState(initialTheme)

  function change(value: string[]) {
    // A toggle group lets the pressed item be unpressed; keep a theme picked.
    if (value.length === 0) return
    const next = parseTheme(value[0])
    setTheme(next)
    storeTheme(next)
    // The layout's inline script applies the theme and watches the device.
    document.documentElement.dataset.theme = next
    window.dispatchEvent(new Event("themechange"))
  }

  return (
    <ToggleGroup
      variant="outline"
      spacing={0}
      value={[theme]}
      onValueChange={change}
      aria-label="Theme"
    >
      {options.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem key={value} value={value}>
          <Icon />
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
