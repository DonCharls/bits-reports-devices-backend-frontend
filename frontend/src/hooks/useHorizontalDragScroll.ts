"use client"

import { useRef, useEffect } from 'react'

/**
 * Hook that converts vertical mouse wheel into horizontal scroll on a container.
 * - Scrolls the table horizontally first until it reaches the edge.
 * - After reaching the edge, waits briefly then allows vertical page scrolling.
 * - Prevents simultaneous horizontal + vertical scrolling.
 */
export function useHorizontalDragScroll<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const scrollLeft = useRef(0)
  const atEdgeCount = useRef(0)
  const edgeThreshold = 5 // Increased for better vertical scroll release

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // ── Wheel Handler (Better horizontal support) ───────────────────────────
    const onWheel = (e: WheelEvent) => {
      // If no horizontal overflow, let the page scroll normally
      if (el.scrollWidth <= el.clientWidth) return

      // If user is already providing horizontal delta (trackpad/horizontal wheel),
      // let the browser handle it natively.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return

      const maxScrollLeft = el.scrollWidth - el.clientWidth
      const atStart = el.scrollLeft <= 0
      const atEnd = el.scrollLeft >= maxScrollLeft - 1

      const scrollingRight = e.deltaY > 0
      const scrollingLeft = e.deltaY < 0
      const atEdge = (scrollingRight && atEnd) || (scrollingLeft && atStart)

      if (atEdge) {
        atEdgeCount.current++
        if (atEdgeCount.current >= edgeThreshold) {
          return // release to vertical scroll
        }
      } else {
        atEdgeCount.current = 0
      }

      // Convert vertical wheel to horizontal scroll
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }

    // ── Drag Handler (Click and Grab) ──────────────────────────────────────
    const onMouseDown = (e: MouseEvent) => {
      // Only drag if it's the primary mouse button
      if (e.button !== 0) return
      
      isDragging.current = true
      el.style.cursor = 'grabbing'
      el.style.userSelect = 'none'
      
      startX.current = e.pageX - el.offsetLeft
      scrollLeft.current = el.scrollLeft
    }

    const onMouseLeave = () => {
      isDragging.current = false
      el.style.cursor = ''
      el.style.userSelect = ''
    }

    const onMouseUp = () => {
      isDragging.current = false
      el.style.cursor = ''
      el.style.userSelect = ''
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      e.preventDefault()
      const x = e.pageX - el.offsetLeft
      const walk = (x - startX.current) * 2 // Scroll speed multiplier
      el.scrollLeft = scrollLeft.current - walk
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('mouseleave', onMouseLeave)
    el.addEventListener('mouseup', onMouseUp)
    el.addEventListener('mousemove', onMouseMove)

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('mouseleave', onMouseLeave)
      el.removeEventListener('mouseup', onMouseUp)
      el.removeEventListener('mousemove', onMouseMove)
    }
  }, [])

  return ref
}
