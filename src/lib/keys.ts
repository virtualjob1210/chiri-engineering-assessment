// Platform-aware labels for keyboard shortcuts shown in the UI.

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

/** Prefix for Mod-key shortcuts: "⌘" on Apple platforms, "Ctrl+" elsewhere. */
export const MOD = IS_MAC ? '⌘' : 'Ctrl+'
