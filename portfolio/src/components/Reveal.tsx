'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Fades [data-reveal] elements in as they enter the viewport. The hidden
 * starting state lives in CSS behind `html.js` and a motion media query, so
 * content stays visible without JavaScript or with reduced motion.
 */
export function Reveal() {
  // Re-run on client-side navigation so case-study pages reveal too.
  const pathname = usePathname()
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)')
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-in')
          io.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [pathname])
  return null
}
