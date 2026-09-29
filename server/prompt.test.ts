import { describe, expect, it } from 'vitest'
import type { SuggestRequest } from '../shared/api.ts'
import { buildMessages, parseModelReply } from './prompt.ts'

const request: SuggestRequest = {
  instruction: 'Make it shorter',
  selection: 'The quick brown fox jumps over the lazy dog.',
  context: { heading: 'Intro', before: 'Before text.', after: 'After text.' },
  history: [],
}

describe('parseModelReply', () => {
  it('parses a plain JSON object', () => {
    expect(parseModelReply('{"replacement":"Short.","rationale":"Trimmed."}')).toEqual({
      replacement: 'Short.',
      rationale: 'Trimmed.',
    })
  })

  it('tolerates code fences and surrounding prose', () => {
    const raw = 'Sure!\n```json\n{"replacement": "A", "rationale": "B"}\n```'
    expect(parseModelReply(raw)).toEqual({ replacement: 'A', rationale: 'B' })
  })

  it('allows an empty replacement (deletion)', () => {
    expect(parseModelReply('{"replacement":"","rationale":"Removed redundant sentence."}')?.replacement).toBe('')
  })

  it('preserves replacement whitespace but trims rationale', () => {
    expect(parseModelReply('{"replacement":"  a\\n","rationale":"  why  "}')).toEqual({
      replacement: '  a\n',
      rationale: 'why',
    })
  })

  it.each([
    ['no JSON', 'I cannot help with that'],
    ['invalid JSON', '{"replacement": "a",}'],
    ['missing rationale', '{"replacement":"a"}'],
    ['blank rationale', '{"replacement":"a","rationale":"  "}'],
    ['non-string replacement', '{"replacement":42,"rationale":"x"}'],
  ])('returns null for %s', (_label, raw) => {
    expect(parseModelReply(raw)).toBeNull()
  })
})

describe('buildMessages', () => {
  it('sends system + one user turn on the first ask', () => {
    const messages = buildMessages(request)
    expect(messages.map((m) => m.role)).toEqual(['system', 'user'])
    expect(messages[1].content).toContain('<selection>\nThe quick brown fox')
    expect(messages[1].content).toContain('<heading>Intro</heading>')
    expect(messages[1].content).toContain('Instruction: Make it shorter')
  })

  it('replays refinement history as alternating turns', () => {
    const messages = buildMessages({
      ...request,
      instruction: 'Now more formal',
      history: [{ instruction: 'Make it shorter', replacement: 'Fox jumps dog.', rationale: 'Shortened.' }],
    })
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(messages[1].content).toContain('Instruction: Make it shorter')
    expect(JSON.parse(messages[2].content)).toEqual({ replacement: 'Fox jumps dog.', rationale: 'Shortened.' })
    expect(messages[3].content).toContain('Now more formal')
  })
})
