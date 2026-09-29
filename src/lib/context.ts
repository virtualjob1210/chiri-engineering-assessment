// Pure helpers that turn an editor selection into what the AI request needs.
// No CodeMirror or DOM imports so they stay trivially testable.

import type { SuggestRequest } from '../../shared/api.ts'
import { SUGGEST_LIMITS } from '../../shared/limits.ts'

export interface TextRange {
  from: number
  to: number
}

/** Characters of surrounding text sent on each side of the selection. */
const CONTEXT_CHARS = 1_500

/**
 * Shrinks a selection to exclude leading/trailing whitespace, so a sloppy
 * drag or triple-click (which grabs the newline) doesn't make the AI rewrite
 * line breaks. Returns null if the selection is empty or whitespace-only.
 */
export function trimRange(selectedText: string, from: number): TextRange | null {
  const start = selectedText.search(/\S/)
  if (start === -1) return null
  const end = selectedText.trimEnd().length
  return { from: from + start, to: from + end }
}

/** Text of the nearest ATX heading (`## Title`) that starts before `pos`. */
export function nearestHeading(doc: string, pos: number): string | undefined {
  let heading: string | undefined
  for (const match of doc.slice(0, pos).matchAll(/^#{1,6}[ \t]+(.+)$/gm)) {
    heading = match[1]
  }
  const text = heading?.replace(/[ \t]+#+[ \t]*$/, '').trim()
  return text ? text.slice(0, SUGGEST_LIMITS.heading) : undefined
}

/**
 * Bounded text on each side of a range. When a side is truncated it is cut
 * back to a line boundary so the model never sees half a sentence at the edge.
 */
export function extractContext(
  doc: string,
  from: number,
  to: number,
  maxChars: number = CONTEXT_CHARS,
): SuggestRequest['context'] {
  const beforeStart = Math.max(0, from - maxChars)
  let before = doc.slice(beforeStart, from)
  if (beforeStart > 0) {
    const firstBreak = before.indexOf('\n')
    if (firstBreak !== -1) before = before.slice(firstBreak + 1)
  }

  const afterEnd = Math.min(doc.length, to + maxChars)
  let after = doc.slice(to, afterEnd)
  if (afterEnd < doc.length) {
    const lastBreak = after.lastIndexOf('\n')
    if (lastBreak !== -1) after = after.slice(0, lastBreak)
  }

  const heading = nearestHeading(doc, from)
  return heading ? { heading, before, after } : { before, after }
}
