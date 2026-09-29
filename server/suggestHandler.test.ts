import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenRouterError, type CompleteFn } from './openrouter.ts'
import { handleSuggest, LIMITS, validateSuggestRequest } from './suggestHandler.ts'

afterEach(() => vi.restoreAllMocks())

const validBody = {
  instruction: 'Make it shorter',
  selection: 'Some text.',
  context: { before: '', after: '' },
  history: [],
}

const deps = (complete: CompleteFn) => ({ apiKey: 'test-key', model: 'test/model', complete })

describe('validateSuggestRequest', () => {
  it('accepts a minimal valid body and trims the instruction', () => {
    const result = validateSuggestRequest({ ...validBody, instruction: '  Shorter  ' })
    expect(result).toEqual({ ok: true, value: { ...validBody, instruction: 'Shorter' } })
  })

  it.each([
    ['non-object body', 'hello'],
    ['blank instruction', { ...validBody, instruction: '   ' }],
    ['blank selection', { ...validBody, selection: '' }],
    ['oversized selection', { ...validBody, selection: 'x'.repeat(LIMITS.selection + 1) }],
    ['missing context', { ...validBody, context: undefined }],
    ['non-string context.before', { ...validBody, context: { before: 1, after: '' } }],
    ['history not an array', { ...validBody, history: 'nope' }],
    ['malformed history turn', { ...validBody, history: [{ instruction: 'x' }] }],
  ])('rejects %s', (_label, body) => {
    expect(validateSuggestRequest(body).ok).toBe(false)
  })
})

describe('handleSuggest', () => {
  it('returns the parsed suggestion on success', async () => {
    const complete = vi.fn<CompleteFn>().mockResolvedValue('{"replacement":"Text.","rationale":"Shorter."}')
    const result = await handleSuggest(validBody, deps(complete))
    expect(result).toEqual({ status: 200, body: { replacement: 'Text.', rationale: 'Shorter.' } })
    expect(complete).toHaveBeenCalledOnce()
  })

  it('retries once when the model output is unparseable', async () => {
    const complete = vi
      .fn<CompleteFn>()
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce('{"replacement":"Text.","rationale":"Shorter."}')
    const result = await handleSuggest(validBody, deps(complete))
    expect(result.status).toBe(200)
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('returns invalid_model_output after the retry also fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const complete = vi.fn<CompleteFn>().mockResolvedValue('still not json')
    const result = await handleSuggest(validBody, deps(complete))
    expect(result.status).toBe(502)
    expect(result.body).toMatchObject({ error: { code: 'invalid_model_output' } })
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('maps upstream failures to 502 without retrying', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const complete = vi.fn<CompleteFn>().mockRejectedValue(new OpenRouterError('timeout', 'timed out'))
    const result = await handleSuggest(validBody, deps(complete))
    expect(result).toEqual({ status: 502, body: { error: { code: 'upstream_error', message: 'timed out' } } })
    expect(complete).toHaveBeenCalledOnce()
  })

  it('returns 400 without calling the model for an invalid body', async () => {
    const complete = vi.fn<CompleteFn>()
    const result = await handleSuggest({}, deps(complete))
    expect(result.status).toBe(400)
    expect(complete).not.toHaveBeenCalled()
  })

  it('returns missing_api_key when no key is configured', async () => {
    const complete = vi.fn<CompleteFn>()
    const result = await handleSuggest(validBody, { ...deps(complete), apiKey: undefined })
    expect(result).toMatchObject({ status: 500, body: { error: { code: 'missing_api_key' } } })
    expect(complete).not.toHaveBeenCalled()
  })
})
