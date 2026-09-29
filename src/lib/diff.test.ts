import { describe, expect, it } from 'vitest'
import { diffText, isUnchanged, type DiffSegment } from './diff.ts'

const rebuild = (segments: DiffSegment[], side: 'original' | 'replacement') =>
  segments
    .filter((s) => s.kind === 'equal' || s.kind === (side === 'original' ? 'delete' : 'insert'))
    .map((s) => s.text)
    .join('')

// Each segment rendered as a compact string, e.g. "=same", "-old", "+new".
const compact = (segments: DiffSegment[]) =>
  segments.map((s) => ({ equal: '=', delete: '-', insert: '+' })[s.kind] + s.text)

describe('diffText', () => {
  it('returns a single equal segment for identical text', () => {
    expect(diffText('Hello world', 'Hello world')).toEqual([{ kind: 'equal', text: 'Hello world' }])
  })

  it('reports a pure deletion', () => {
    expect(compact(diffText('one two three', 'one three'))).toEqual(['=one ', '-two ', '=three'])
  })

  it('reports a pure insertion', () => {
    expect(compact(diffText('one three', 'one two three'))).toEqual(['=one ', '+two ', '=three'])
  })

  it('orders a replacement as delete then insert', () => {
    expect(compact(diffText('a cat sat', 'a dog sat'))).toEqual(['=a ', '-cat', '+dog', '= sat'])
  })

  it('groups a multi-word rewrite into one delete and one insert', () => {
    const segments = diffText(
      'Slack is kind of a mess right now and stuff gets lost.',
      'Slack is disorganized and information gets lost.',
    )
    expect(compact(segments)).toEqual([
      '=Slack is ',
      '-kind of a mess right now',
      '+disorganized',
      '= and ',
      '-stuff',
      '+information',
      '= gets lost.',
    ])
  })

  it('does not merge changes across a paragraph break', () => {
    const segments = diffText('Old one.\n\nOld two.', 'New one.\n\nNew two.')
    expect(segments).toContainEqual({ kind: 'equal', text: ' one.\n\n' })
  })

  it.each([
    ['whitespace-only changes', 'a  b\nc', 'a b\n\nc'],
    ['markdown markup changes', 'The **bold** word.', 'The *bold* word!'],
    ['full rewrite', 'In order to be able to start', 'To start'],
    ['deletion of everything', 'Remove me entirely.', ''],
    ['insertion into empty', '', 'Brand new text.'],
    ['trailing newline added', 'Line', 'Line\n'],
  ])('rebuilds both sides exactly for %s', (_label, original, replacement) => {
    const segments = diffText(original, replacement)
    expect(rebuild(segments, 'original')).toBe(original)
    expect(rebuild(segments, 'replacement')).toBe(replacement)
  })
})

describe('isUnchanged', () => {
  it('detects no-op suggestions', () => {
    expect(isUnchanged(diffText('Same.', 'Same.'))).toBe(true)
    expect(isUnchanged(diffText('Same.', 'Different.'))).toBe(false)
  })
})
