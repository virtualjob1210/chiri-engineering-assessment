// Framework-agnostic handler for POST /api/suggest.
// Takes an already-parsed body and returns { status, body }; the HTTP
// adapter (suggestPlugin.ts) owns reading requests and writing responses.

import type { ApiError, ApiErrorCode, RefinementTurn, SuggestRequest, SuggestResponse } from '../shared/api.ts'
import { SUGGEST_LIMITS } from '../shared/limits.ts'
import { OpenRouterError, type CompleteFn } from './openrouter.ts'
import { buildMessages, parseModelReply } from './prompt.ts'

export const LIMITS = SUGGEST_LIMITS

export interface HandlerResult {
  status: number
  body: SuggestResponse | ApiError
}

export interface SuggestDeps {
  apiKey: string | undefined
  model: string
  complete: CompleteFn
  signal?: AbortSignal
}

type Validation = { ok: true; value: SuggestRequest } | { ok: false; message: string }

const isString = (v: unknown): v is string => typeof v === 'string'
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function isRefinementTurn(v: unknown): v is RefinementTurn {
  return isRecord(v) && isString(v.instruction) && isString(v.replacement) && isString(v.rationale)
}

export function validateSuggestRequest(body: unknown): Validation {
  const fail = (message: string): Validation => ({ ok: false, message })

  if (!isRecord(body)) return fail('Body must be a JSON object')
  const { instruction, selection, context, history } = body

  if (!isString(instruction) || instruction.trim() === '') return fail('`instruction` must be a non-empty string')
  if (instruction.length > LIMITS.instruction) return fail(`\`instruction\` exceeds ${LIMITS.instruction} characters`)

  if (!isString(selection) || selection.trim() === '') return fail('`selection` must be a non-empty string')
  if (selection.length > LIMITS.selection) return fail(`\`selection\` exceeds ${LIMITS.selection} characters`)

  if (!isRecord(context)) return fail('`context` must be an object')
  const { before, after, heading } = context
  if (!isString(before) || !isString(after)) return fail('`context.before` and `context.after` must be strings')
  if (before.length > LIMITS.contextSide || after.length > LIMITS.contextSide) {
    return fail(`\`context.before\`/\`context.after\` exceed ${LIMITS.contextSide} characters`)
  }
  if (heading !== undefined && (!isString(heading) || heading.length > LIMITS.heading)) {
    return fail(`\`context.heading\` must be a string under ${LIMITS.heading} characters`)
  }

  if (!Array.isArray(history) || !history.every(isRefinementTurn)) {
    return fail('`history` must be an array of { instruction, replacement, rationale }')
  }
  if (history.length > LIMITS.historyTurns) return fail(`\`history\` exceeds ${LIMITS.historyTurns} turns`)

  return {
    ok: true,
    value: {
      instruction: instruction.trim(),
      selection,
      context: { before, after, ...(heading ? { heading } : {}) },
      history,
    },
  }
}

const errorResult = (status: number, code: ApiErrorCode, message: string): HandlerResult => ({
  status,
  body: { error: { code, message } },
})

/**
 * User-facing wording for upstream failures. Technical detail goes to the
 * server log; the UI gets a short sentence that says what to do next.
 */
export function describeUpstreamError(err: unknown): string {
  if (!(err instanceof OpenRouterError)) return 'Something went wrong talking to the AI. Try again.'
  if (err.kind === 'timeout') return 'The AI took too long to respond. Try again.'
  if (err.kind === 'network') return "Couldn't reach OpenRouter. Check your connection and try again."
  if (err.kind === 'empty') return 'The AI sent back an empty reply. Try again.'
  if (err.status === 401 || err.status === 403) return 'OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env.'
  if (err.status === 402) return 'The OpenRouter account is out of credit.'
  if (err.status === 429) return 'Too many requests right now. Wait a moment and try again.'
  return 'The AI service had a problem. Try again.'
}

/** Model attempts per request: one retry when the output is unparseable. */
const MAX_ATTEMPTS = 2

export async function handleSuggest(body: unknown, deps: SuggestDeps): Promise<HandlerResult> {
  if (!deps.apiKey) {
    return errorResult(500, 'missing_api_key', 'OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key.')
  }

  const validation = validateSuggestRequest(body)
  if (!validation.ok) return errorResult(400, 'bad_request', validation.message)

  const messages = buildMessages(validation.value)

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw: string
    try {
      raw = await deps.complete({ apiKey: deps.apiKey, model: deps.model, messages, signal: deps.signal })
    } catch (err) {
      console.error('[suggest] upstream failure:', err)
      return errorResult(502, 'upstream_error', describeUpstreamError(err))
    }

    const parsed = parseModelReply(raw)
    if (parsed) return { status: 200, body: parsed }
    console.warn(`[suggest] unparseable model output (attempt ${attempt}/${MAX_ATTEMPTS}):`, raw.slice(0, 300))
  }

  return errorResult(502, 'invalid_model_output', "The AI's reply couldn't be read. Try again.")
}
