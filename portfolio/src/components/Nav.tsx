'use client'

import { useEffect, useRef, useState } from 'react'
import { profile, sections as NAV_ITEMS } from '@/content/site'
import styles from './Nav.module.css'

export function Nav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Solid bar once the page has scrolled past the very top.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Highlight the section currently in the middle of the viewport.
  useEffect(() => {
    const sections = NAV_ITEMS.map(({ id }) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    )
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id)
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    sections.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // Mobile menu: lock scroll, close on Escape, keep focus inside the panel.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const toggle = toggleRef.current
    document.documentElement.style.overflow = 'hidden'
    panel?.querySelector<HTMLElement>('a')?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        toggle?.focus()
        return
      }
      if (e.key !== 'Tab' || !panel || !toggle) return
      const focusables = [toggle, ...panel.querySelectorAll<HTMLElement>('a')]
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    const onResize = () => {
      if (window.innerWidth >= 760) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.documentElement.style.overflow = ''
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  return (
    <header className={styles.bar} data-scrolled={scrolled || open} data-open={open}>
      <nav className={`wrap ${styles.inner}`} aria-label="Primary">
        <a href="#top" className={styles.mark} onClick={() => setOpen(false)}>
          <span className={styles.monogram} aria-hidden="true">
            {profile.initials}
          </span>
          <span className={styles.wordmark}>{profile.name}</span>
        </a>

        <ul className={styles.links}>
          {NAV_ITEMS.map(({ id, label }, i) => (
            <li key={id}>
              <a href={`#${id}`} className={styles.link} aria-current={active === id ? 'true' : undefined}>
                <span className={styles.num} aria-hidden="true">
                  0{i + 1}
                </span>
                {label}
              </a>
            </li>
          ))}
        </ul>

        <button
          ref={toggleRef}
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="visually-hidden">{open ? 'Close menu' : 'Open menu'}</span>
          <span className={styles.toggleLabel} aria-hidden="true">
            {open ? 'Close' : 'Menu'}
          </span>
          <span className={styles.burger} aria-hidden="true" />
        </button>
      </nav>

      <div id="mobile-menu" ref={panelRef} className={styles.panel} hidden={!open}>
        <ol className={`wrap ${styles.panelList}`}>
          {NAV_ITEMS.map(({ id, label }, i) => (
            <li key={id} style={{ '--i': i } as React.CSSProperties}>
              <a href={`#${id}`} onClick={() => setOpen(false)}>
                <span className="mono">0{i + 1}</span>
                {label}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </header>
  )
}
