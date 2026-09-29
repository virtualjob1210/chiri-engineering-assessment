// TEMPORARY: shows the raw suggestion returned by /api/suggest so the
// request flow can be verified end to end. Replaced by inline diffs next stage.

import type { SuggestResponse } from '../../shared/api.ts'

interface SuggestionDebugPanelProps {
  instruction: string
  original: string
  suggestion: SuggestResponse
  onDismiss: () => void
}

export function SuggestionDebugPanel({ instruction, original, suggestion, onDismiss }: SuggestionDebugPanelProps) {
  return (
    <aside className="debug-panel" aria-label="AI suggestion (debug)">
      <header>
        <strong>Suggestion (debug)</strong>
        <button type="button" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      </header>
      <dl>
        <dt>Instruction</dt>
        <dd>{instruction}</dd>
        <dt>Rationale</dt>
        <dd>{suggestion.rationale}</dd>
        <dt>Original</dt>
        <dd>
          <pre>{original}</pre>
        </dd>
        <dt>Replacement</dt>
        <dd>
          <pre>{suggestion.replacement}</pre>
        </dd>
      </dl>
    </aside>
  )
}
