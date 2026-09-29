import { describe, expect, it } from 'vitest'
import { extractContext, nearestHeading, trimRange } from './context.ts'

describe('trimRange', () => {
  it('excludes surrounding whitespace and newlines', () => {
    // "  Hello world\n" selected starting at offset 10
    expect(trimRange('  Hello world\n', 10)).toEqual({ from: 12, to: 23 })
  })

  it('leaves a clean selection unchanged', () => {
    expect(trimRange('Hello', 5)).toEqual({ from: 5, to: 10 })
  })

  it('returns null for empty or whitespace-only selections', () => {
    expect(trimRange('', 0)).toBeNull()
    expect(trimRange(' \n\t ', 3)).toBeNull()
  })
})

describe('nearestHeading', () => {
  const doc = '# Title\n\nIntro.\n\n## Section A ##\n\nBody A.\n\n### Sub\n\nBody sub.'

  it('finds the closest heading above the position', () => {
    expect(nearestHeading(doc, doc.indexOf('Body A'))).toBe('Section A')
    expect(nearestHeading(doc, doc.indexOf('Body sub'))).toBe('Sub')
    expect(nearestHeading(doc, doc.indexOf('Intro'))).toBe('Title')
  })

  it('returns undefined when there is no heading above', () => {
    expect(nearestHeading('Just text.\n\n# Later', 3)).toBeUndefined()
  })

  it('ignores a heading line the selection starts inside', () => {
    // Selecting "Section A" inside "## Section A" should use the previous heading.
    expect(nearestHeading(doc, doc.indexOf('Section A'))).toBe('Title')
  })

  it('ignores # without a following space (e.g. hashtags)', () => {
    expect(nearestHeading('#hashtag\n\ntext', 12)).toBeUndefined()
  })
})

describe('extractContext', () => {
  it('returns full surroundings when the document is short', () => {
    const doc = '# H\n\nBefore. Target. After.'
    const from = doc.indexOf('Target')
    const to = from + 'Target.'.length
    expect(extractContext(doc, from, to)).toEqual({ heading: 'H', before: '# H\n\nBefore. ', after: ' After.' })
  })

  it('omits heading when there is none', () => {
    expect(extractContext('abc', 1, 2)).toEqual({ before: 'a', after: 'c' })
  })

  it('handles selections at the very start and end', () => {
    expect(extractContext('abc', 0, 3)).toEqual({ before: '', after: '' })
  })

  it('bounds each side and cuts truncated edges back to a line boundary', () => {
    const doc = 'line one\nline two\nTARGET\nline three\nline four'
    const from = doc.indexOf('TARGET')
    const to = from + 'TARGET'.length
    const { before, after } = extractContext(doc, from, to, 12)
    // 12-char window before is "ne\nline two\n"; the partial "ne" line is dropped.
    expect(before).toBe('line two\n')
    // 12-char window after is "\nline three\n"; cut back to the last line break.
    expect(after).toBe('\nline three')
    expect(before.length).toBeLessThanOrEqual(12)
    expect(after.length).toBeLessThanOrEqual(12)
  })

  it('keeps the raw window when a truncated side has no line break', () => {
    const doc = 'x'.repeat(50) + 'T' + 'y'.repeat(50)
    const { before, after } = extractContext(doc, 50, 51, 10)
    expect(before).toBe('x'.repeat(10))
    expect(after).toBe('y'.repeat(10))
  })
})
