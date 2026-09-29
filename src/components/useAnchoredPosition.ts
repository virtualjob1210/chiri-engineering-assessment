// Pins a floating element (toolbar, suggestion card) to a document range.
// Position is read from CodeMirror and written straight to the element's
// style, so scrolling never triggers React renders.

import type { EditorView } from '@codemirror/view'
import { useLayoutEffect, type RefObject } from 'react'
import type { TextRange } from '../lib/context.ts'

const GAP = 8
const EDGE = 8

/**
 * Places `elementRef` below the range (or above it if there's no room) and
 * keeps it there while the editor scrolls or the window resizes. Hidden when
 * the range is scrolled out of the editor's visible area.
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
      const rangeBottom = view.documentTop + view.lineBlockAt(range.to).bottom
      const visible = view.scrollDOM.getBoundingClientRect()
      if (!start || !end || rangeBottom < visible.top || rangeTop > visible.bottom) {
        el.style.visibility = 'hidden'
        return
      }

      const { offsetWidth: width, offsetHeight: height } = el
      let top = rangeBottom + GAP
      if (top + height > window.innerHeight - EDGE) top = rangeTop - height - GAP
      top = Math.max(EDGE, top)
      const left = Math.max(EDGE, Math.min(Math.min(start.left, end.left), window.innerWidth - width - EDGE))

      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
      el.style.visibility = 'visible'
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }

    place()
    view.scrollDOM.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      view.scrollDOM.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [view, range.from, range.to, elementRef, layoutKey])
}
