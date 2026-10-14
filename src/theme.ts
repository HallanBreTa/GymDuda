import { useCallback, useEffect, useState } from 'react'

/** Preferência do usuário; 'system' segue o tema do aparelho. */
export type ThemePref = 'dark' | 'light' | 'system'

// Mesmo nome usado pelo script em index.html, que aplica o tema antes de o app carregar.
const STORAGE_KEY = 'gymduda:theme'
const STATUS_BAR = { dark: '#0b0d10', light: '#f3f5f8' }

const media = () => window.matchMedia('(prefers-color-scheme: light)')

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'dark' || v === 'light' || v === 'system') return v
  } catch {
    // ignora
  }
  return 'dark'
}

function apply(pref: ThemePref) {
  const theme = pref === 'system' ? (media().matches ? 'light' : 'dark') : pref
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', STATUS_BAR[theme])
}

export function useTheme() {
  const [pref, setPref] = useState(readPref)

  useEffect(() => {
    apply(pref)
    if (pref !== 'system') return
    const mq = media()
    const onChange = () => apply('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [pref])

  const change = useCallback((next: ThemePref) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // modo privado: vale só nesta sessão
    }
    setPref(next)
  }, [])

  return [pref, change] as const
}
