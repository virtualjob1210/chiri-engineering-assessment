// Pins a floating element (toolbar, suggestion card) to a document range.
// Position is read from CodeMirror and written straight to the element's
// style, so scrolling never triggers React renders.

import { BlockType, type EditorView } from '@codemirror/view'
import { useLayoutEffect, type RefObject } from 'react'
import type { TextRange } from '../lib/context.ts'

const GAP = 8
const EDGE = 8

/**
 * Bottom of the text line containing `pos`, in document coordinates. A line
 * block also includes block widgets attached to it (such as the suggestion
 * card's reserved space), which must not count as part of the text.
 */
function textBottom(view: EditorView, pos: number): number {
  const block = view.lineBlockAt(pos)
  if (!Array.isArray(block.type)) return block.bottom
  const textBlocks = block.type.filter((b) => b.type === BlockType.Text && b.from <= pos)
  return textBlocks.length ? textBlocks[textBlocks.length - 1].bottom : block.bottom
}

/**
 * Places `elementRef` below the range and keeps it there while the editor
 * scrolls or the window resizes. Hidden when the range is scrolled out of
 * the editor's visible area.
 *
 * With `flip`, the element moves above the range when there's no room below
 * (used by the transient command panel). Without it, it always stays below
 * (used by the suggestion card, which reserves its own space in the document).
 *
 * Vertical placement uses the range's line blocks rather than character
 * coordinates, so inline decorations (e.g. inserted diff text that wraps onto
 * extra lines) are never covered.
 */
export function useAnchoredPosition(
  view: EditorView,
  range: TextRange,
  elementRef: RefObject<HTMLElement | null>,
  layoutKey: string,
  { flip = true }: { flip?: boolean } = {},
) {
  useLayoutEffect(() => {
    const el = elementRef.current
    if (!el) return
    let frame = 0

    const place = () => {
      frame = 0
      const start = view.coordsAtPos(range.from, 1)
      const end = view.coordsAtPos(range.to, -1)
      const rangeTop = view.documentTop + view.lineBlockAt(range.from).top
      const rangeBottom = view.documentTop + textBottom(view, range.to)
      const visible = view.scrollDOM.getBoundingClientRect()
      const { offsetWidth: width, offsetHeight: height } = el

      let top = rangeBottom + GAP
      if (flip && top + height > visible.bottom - EDGE) top = rangeTop - height - GAP
      // Hide rather than float over the header or past the editor's edges.
      if (!start || !end || top < visible.top || top > visible.bottom - GAP) {
        el.style.visibility = 'hidden'
        return
      }
      const left = Math.max(EDGE, Math.min(Math.min(start.left, end.left), window.innerWidth - width - EDGE))

      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
      el.style.visibility = 'visible'
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }

    place()
    view.scrollDOM.addEventListener('scroll', schedule, { passive: true })
    // Also covers window resizes and side panels narrowing the editor.
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(view.scrollDOM)
    return () => {
      cancelAnimationFrame(frame)
      view.scrollDOM.removeEventListener('scroll', schedule)
      resizeObserver.disconnect()
    }
  }, [view, range.from, range.to, elementRef, layoutKey, flip])
}
