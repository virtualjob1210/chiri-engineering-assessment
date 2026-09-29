// Version history: a log of accepted AI edits, newest first, kept in
// localStorage next to (but separate from) the document.
//
// It records what the AI changed and why at the moment each suggestion was
// accepted. It is a log of events, not a mirror of the current document:
// undoing an accepted edit doesn't remove its entry.

import type { Transaction } from '@codemirror/state'
import { suggestionAccepted, type ReadySuggestion } from '../editor/suggestionField.ts'
import { browserStore, type KeyValueStore } from './storage.ts'

const HISTORY_KEY = 'ai-doc-editor:history'
export const HISTORY_LIMIT = 50

export interface VersionEntry {
  id: string
  /** ISO timestamp of the accept. */
  createdAt: string
  /** 1, 2, 3… in accept order; keeps counting after old entries are dropped. */
  revision: number
  /** The instruction behind the accepted proposal (the last refinement, if any). */
  instruction: string
  /** Every instruction in the chain, oldest first, e.g. ["Make clearer", "Shorter"]. */
  instructions: string[]
  rationale: string
  originalText: string
  replacementText: string
  /** Full document right after the accept. */
  document: string
}

/** What gets recorded about one accept, before id/time/revision are assigned. */
export type AcceptedEdit = Pick<
  VersionEntry,
  'instructions' | 'rationale' | 'originalText' | 'replacementText' | 'document'
>

/**
 * Describes an accepted suggestion. Uses the final proposal on screen, so a
 * suggestion refined three times yields one edit with the last round's text
 * and rationale, plus the whole instruction chain.
 */
export function acceptedEdit(suggestion: ReadySuggestion, documentAfter: string): AcceptedEdit {
  return {
    instructions: suggestion.rounds.map((round) => round.instruction),
    rationale: suggestion.rationale,
    originalText: suggestion.original,
    replacementText: suggestion.replacement,
    document: documentAfter,
  }
}

/** Returns a new history with `edit` added as the newest entry, capped at HISTORY_LIMIT. */
export function recordEdit(
  history: VersionEntry[],
  edit: AcceptedEdit,
  { now = new Date(), id = crypto.randomUUID() }: { now?: Date; id?: string } = {},
): VersionEntry[] {
  const entry: VersionEntry = {
    id,
    createdAt: now.toISOString(),
    revision: (history[0]?.revision ?? 0) + 1,
    instruction: edit.instructions[edit.instructions.length - 1] ?? '',
    ...edit,
  }
  return [entry, ...history].slice(0, HISTORY_LIMIT)
}

/**
 * Records an entry for every accept among `transactions`; anything else
 * (typing, reject, refinement, undo/redo) is ignored. Returns the same array
 * when nothing was accepted, so callers can cheaply skip updates.
 */
export function recordAccepts(history: VersionEntry[], transactions: readonly Transaction[]): VersionEntry[] {
  let next = history
  for (const tr of transactions) {
    const accepted = tr.annotation(suggestionAccepted)
    if (accepted) next = recordEdit(next, acceptedEdit(accepted, tr.state.doc.toString()))
  }
  return next
}

// ---- Persistence ---------------------------------------------------------------

const isString = (v: unknown): v is string => typeof v === 'string'

function isVersionEntry(v: unknown): v is VersionEntry {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return (
    isString(e.id) &&
    isString(e.createdAt) &&
    typeof e.revision === 'number' &&
    isString(e.instruction) &&
    Array.isArray(e.instructions) &&
    e.instructions.every(isString) &&
    isString(e.rationale) &&
    isString(e.originalText) &&
    isString(e.replacementText) &&
    isString(e.document)
  )
}

/** Saved history, newest first. Unreadable or malformed data yields an empty history. */
export function loadHistory(store: KeyValueStore | null = browserStore()): VersionEntry[] {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(HISTORY_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isVersionEntry)
      .sort((a, b) => b.revision - a.revision)
      .slice(0, HISTORY_LIMIT)
  } catch {
    return []
  }
}

/** Persists the history. Returns false if it could not be saved. */
export function saveHistory(history: VersionEntry[], store: KeyValueStore | null = browserStore()): boolean {
  if (!store) return false
  try {
    store.setItem(HISTORY_KEY, JSON.stringify(history))
    return true
  } catch {
    return false
  }
}
