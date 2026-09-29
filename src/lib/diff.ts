// Word-level diff between the original selection and the AI's replacement.
// Output segments are exact: concatenating equal+delete segments rebuilds the
// original, and equal+insert rebuilds the replacement. Editor decorations
// rely on that to map segments back to document offsets.

import { diffWordsWithSpace } from 'diff'

export type DiffSegment = { kind: 'equal' | 'insert' | 'delete'; text: string }

// Whitespace between two changes, but not a paragraph break.
const isJoinableSpace = (text: string) => /^\s+$/.test(text) && !/\n\s*\n/.test(text)

/**
 * Diffs two strings into readable tracked-change segments.
 *
 * Uses `diffWordsWithSpace` rather than `diffWords`: the latter treats
 * whitespace-only differences as equal and reports the *new* text for them,
 * which breaks offset mapping into the original. The raw output is then
 * cleaned up so "~~kind~~ ~~of a mess~~" becomes one "~~kind of a mess~~".
 */
export function diffText(original: string, replacement: string): DiffSegment[] {
  const raw: DiffSegment[] = diffWordsWithSpace(original, replacement).map((change) => ({
    kind: change.added ? 'insert' : change.removed ? 'delete' : 'equal',
    text: change.value,
  }))

  // 1. Whitespace sandwiched between changes becomes part of the change.
  const absorbed = raw.flatMap((segment, i): DiffSegment[] => {
    const prev = raw[i - 1]
    const next = raw[i + 1]
    const betweenChanges = prev && next && prev.kind !== 'equal' && next.kind !== 'equal'
    if (segment.kind === 'equal' && betweenChanges && isJoinableSpace(segment.text)) {
      return [
        { kind: 'delete', text: segment.text },
        { kind: 'insert', text: segment.text },
      ]
    }
    return [segment]
  })

  // 2. Each run of consecutive changes becomes one delete followed by one
  //    insert. Whitespace both sides end with moves back out to equal text.
  const result: DiffSegment[] = []
  const pushEqual = (text: string) => {
    const last = result[result.length - 1]
    if (last?.kind === 'equal') last.text += text
    else if (text) result.push({ kind: 'equal', text })
  }
  let deleted = ''
  let inserted = ''
  const flush = () => {
    let shared = ''
    while (deleted && inserted && deleted.at(-1) === inserted.at(-1) && /\s/.test(deleted.at(-1)!)) {
      shared = deleted.at(-1) + shared
      deleted = deleted.slice(0, -1)
      inserted = inserted.slice(0, -1)
    }
    if (deleted) result.push({ kind: 'delete', text: deleted })
    if (inserted) result.push({ kind: 'insert', text: inserted })
    pushEqual(shared)
    deleted = ''
    inserted = ''
  }
  for (const segment of absorbed) {
    if (segment.kind === 'delete') deleted += segment.text
    else if (segment.kind === 'insert') inserted += segment.text
    else {
      flush()
      pushEqual(segment.text)
    }
  }
  flush()
  return result
}

/** True when the diff contains no insertions or deletions. */
export const isUnchanged = (segments: DiffSegment[]) => segments.every((s) => s.kind === 'equal')
