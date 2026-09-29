// Platform-aware names for the Mod key (⌘ on Apple platforms, Ctrl elsewhere).

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

/** Visible label prefix, e.g. `${MOD}K` → "⌘K" or "Ctrl+K". */
export const MOD = IS_MAC ? '⌘' : 'Ctrl+'

/** Key name for `aria-keyshortcuts`, e.g. `${MOD_ARIA}+K`. */
export const MOD_ARIA = IS_MAC ? 'Meta' : 'Control'
