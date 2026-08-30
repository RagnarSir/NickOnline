import { useEffect, useState } from 'react'

type Theme = 'auto' | 'light' | 'dark'

const KEY = 'nickonline-theme-v1'
const NEXT: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' }
const ICON: Record<Theme, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' }

const read = (): Theme => {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

/** Auto follows the OS; light and dark stamp the root so they win either way. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(read)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* storage may be unavailable; the theme still applies for this session */
    }
  }, [theme])

  return (
    <button
      className="btn"
      onClick={() => setTheme(NEXT[theme])}
      title="Switch between automatic, light and dark"
      aria-label={`Theme: ${ICON[theme]}. Click to change.`}
    >
      {ICON[theme]}
    </button>
  )
}
