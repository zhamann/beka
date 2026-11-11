/**
 * The color theme the user picked in Settings, kept in a cookie so pages
 * render in that theme from the start. "system" follows the device.
 */
export const THEMES = ["system", "light", "dark"] as const
export type Theme = (typeof THEMES)[number]

export const THEME_COOKIE = "theme"

export function parseTheme(value: string | undefined): Theme {
  return THEMES.find((theme) => theme === value) ?? "system"
}

export function storeTheme(theme: Theme) {
  const maxAge = 60 * 60 * 24 * 365
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${maxAge}`
}
