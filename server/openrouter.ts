// Thin transport around OpenRouter's chat completions API.
// Knows nothing about suggestions: messages in, assistant text out.

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-5.5'
const DEFAULT_TIMEOUT_MS = 30_000
const MAX_OUTPUT_TOKENS = 2_000

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CompletionOptions {
  apiKey: string
  model: string
  messages: ChatMessage[]
  timeoutMs?: number
  /** Aborts the upstream request, e.g. when the browser disconnects. */
  signal?: AbortSignal
}

export type CompleteFn = (options: CompletionOptions) => Promise<string>

export type OpenRouterErrorKind = 'http' | 'timeout' | 'aborted' | 'network' | 'empty'

export class OpenRouterError extends Error {
  readonly kind: OpenRouterErrorKind
  readonly status?: number

  constructor(kind: OpenRouterErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'OpenRouterError'
    this.kind = kind
    this.status = status
  }
}

interface ChatCompletionBody {
  choices?: { message?: { content?: string | null } }[]
}

export const completeChat: CompleteFn = async ({
  apiKey,
  model,
  messages,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
}) => {
  const timeout = AbortSignal.timeout(timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'AI Document Editor',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: 'json_object' },
      }),
      signal: combined,
    })
  } catch (err) {
    if (timeout.aborted) throw new OpenRouterError('timeout', `OpenRouter timed out after ${timeoutMs}ms`)
    if (signal?.aborted) throw new OpenRouterError('aborted', 'Request cancelled by client')
    throw new OpenRouterError('network', `Could not reach OpenRouter: ${(err as Error).message}`)
  }

  if (!response.ok) {
    // OpenRouter error bodies are { error: { message } }; fall back to raw text.
    const text = await response.text().catch(() => '')
    let detail = text
    try {
      detail = JSON.parse(text)?.error?.message ?? text
    } catch {
      // not JSON — keep raw text
    }
    throw new OpenRouterError('http', `OpenRouter responded ${response.status}: ${detail}`.trim(), response.status)
  }

  const body = (await response.json()) as ChatCompletionBody
  const content = body.choices?.[0]?.message?.content
  if (!content) throw new OpenRouterError('empty', 'OpenRouter returned no message content')
  return content
}
