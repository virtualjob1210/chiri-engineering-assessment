// Side panel listing accepted AI edits, newest first. View-only: entries
// show what changed and why, but can't be restored (see README).

import { useState, type KeyboardEvent } from 'react'
import { diffText, type DiffSegment } from '../lib/diff.ts'
import type { VersionEntry } from '../lib/history.ts'

interface VersionHistoryProps {
  entries: VersionEntry[]
  onClose: () => void
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  const isToday = date.toDateString() === new Date().toDateString()
  return isToday
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function VersionHistory({ entries, onClose }: VersionHistoryProps) {
  const [openId, setOpenId] = useState<string | null>(null)

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <aside id="version-history" className="history-panel" aria-labelledby="history-title" onKeyDown={handleKeyDown}>
      <div className="history-header">
        <h2 id="history-title">Version history</h2>
        <button type="button" className="btn btn-quiet" onClick={onClose} aria-label="Close version history" autoFocus>
          ✕
        </button>
      </div>
      <p className="history-note">Accepted AI edits, newest first. Undo doesn't remove entries.</p>

      {entries.length === 0 ? (
        <p className="history-empty">No AI edits yet. Accept a suggestion and it will show up here.</p>
      ) : (
        <ol className="history-list">
          {entries.map((entry) => {
            const open = entry.id === openId
            return (
              <li key={entry.id} className={`history-item${open ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="history-summary"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : entry.id)}
                >
                  <span className="history-meta">
                    <strong>Revision {entry.revision}</strong>
                    <time dateTime={entry.createdAt}>{formatTime(entry.createdAt)}</time>
                  </span>
                  <span className="history-instruction">{entry.instructions.join(' → ')}</span>
                  <span className="history-rationale">{entry.rationale}</span>
                </button>
                {open && <EntryDetail entry={entry} />}
              </li>
            )
          })}
        </ol>
      )}
    </aside>
  )
}

/** Before/after text with the changed words marked, like the inline diff. */
function EntryDetail({ entry }: { entry: VersionEntry }) {
  const segments = diffText(entry.originalText, entry.replacementText)
  return (
    <div className="history-detail">
      <h3>Before</h3>
      <DiffSide segments={segments} side="delete" />
      <h3>After</h3>
      <DiffSide segments={segments} side="insert" />
    </div>
  )
}

function DiffSide({ segments, side }: { segments: DiffSegment[]; side: 'delete' | 'insert' }) {
  return (
    <p className="history-text">
      {segments.map((segment, i) => {
        if (segment.kind === 'equal') return <span key={i}>{segment.text}</span>
        if (segment.kind !== side) return null
        return side === 'delete' ? (
          <del key={i} className="history-del">
            {segment.text}
          </del>
        ) : (
          <ins key={i} className="history-ins">
            {segment.text}
          </ins>
        )
      })}
    </p>
  )
}
