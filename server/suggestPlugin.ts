// Vite plugin that mounts POST /api/suggest on the dev and preview servers.
// This file is only the HTTP adapter; all logic lives in suggestHandler.ts.

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import type { ApiError } from '../shared/api.ts'
import { completeChat, DEFAULT_MODEL } from './openrouter.ts'
import { handleSuggest } from './suggestHandler.ts'

const ROUTE = '/api/suggest'
const MAX_BODY_BYTES = 64 * 1024

export interface SuggestApiOptions {
  apiKey: string | undefined
  model: string | undefined
}

class BodyTooLargeError extends Error {}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new BodyTooLargeError())
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

const badRequest = (message: string): ApiError => ({ error: { code: 'bad_request', message } })

export function suggestApi({ apiKey, model }: SuggestApiOptions): Plugin {
  const middleware: Connect.NextHandleFunction = async (req, res) => {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return sendJson(res, 405, badRequest('Use POST'))
    }

    let body: unknown
    try {
      body = JSON.parse(await readBody(req))
    } catch (err) {
      if (err instanceof BodyTooLargeError) return sendJson(res, 413, badRequest('Request body too large'))
      return sendJson(res, 400, badRequest('Body must be valid JSON'))
    }

    // If the browser goes away (e.g. user rejects a pending suggestion),
    // cancel the upstream call so we stop paying for tokens.
    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })

    const result = await handleSuggest(body, {
      apiKey,
      model: model || DEFAULT_MODEL,
      complete: completeChat,
      signal: controller.signal,
    })
    if (!res.writableEnded && !controller.signal.aborted) sendJson(res, result.status, result.body)
  }

  return {
    name: 'suggest-api',
    configureServer(server) {
      server.middlewares.use(ROUTE, middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(ROUTE, middleware)
    },
  }
}
