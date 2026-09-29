// Browser-side caller for POST /api/suggest.
// Normalises every failure (network, abort, server error, bad body) into one
// result shape so UI code never has to try/catch.

import type { ApiError, SuggestRequest, SuggestResponse } from '../../shared/api.ts'

export type SuggestResult =
  | { ok: true; suggestion: SuggestResponse }
  | { ok: false; aborted: boolean; message: string }

const isApiError = (v: unknown): v is ApiError =>
  typeof v === 'object' && v !== null && typeof (v as ApiError).error?.message === 'string'

const isSuggestResponse = (v: unknown): v is SuggestResponse =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as SuggestResponse).replacement === 'string' &&
  typeof (v as SuggestResponse).rationale === 'string'

export async function fetchSuggestion(request: SuggestRequest, signal?: AbortSignal): Promise<SuggestResult> {
  let response: Response
  try {
    response = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
  } catch {
    if (signal?.aborted) return { ok: false, aborted: true, message: 'Cancelled' }
    return { ok: false, aborted: false, message: "Can't reach the local server. Is npm run dev still running?" }
  }

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message = isApiError(body) ? body.error.message : `Something went wrong (error ${response.status}). Try again.`
    return { ok: false, aborted: false, message }
  }
  if (!isSuggestResponse(body)) {
    return { ok: false, aborted: false, message: 'The server sent an unexpected reply. Try again.' }
  }
  return { ok: true, suggestion: body }
}
