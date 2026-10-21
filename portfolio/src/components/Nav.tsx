'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { profile, sections } from '@/content/site'
import styles from './Nav.module.css'

export function Nav() {
  const pathname = usePathname()
  const onHome = pathname === '/'
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Section links are plain anchors: hash-only on the home page (smooth
  // scroll, no navigation), absolute from case-study pages.
  const href = (id: string) => (onHome ? `#${id}` : `/#${id}`)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Mark the section in the middle of the viewport (home page only).
  useEffect(() => {
    if (!onHome) return
    const els = sections.map(({ id }) => document.getElementById(id)).filter((el): el is HTMLElement => !!el)
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [onHome])

  // Mobile menu: lock scroll, trap focus, close on Escape or when widening.
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
      const items = [toggle, ...panel.querySelectorAll<HTMLElement>('a')]
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    const onResize = () => window.innerWidth >= 820 && setOpen(false)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.documentElement.style.overflow = ''
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  return (
    <header className={styles.bar} data-scrolled={scrolled || open}>
      <nav className={`wrap ${styles.inner}`} aria-label="Primary">
        <a href={onHome ? '#top' : '/'} className={styles.mark} onClick={() => setOpen(false)}>
          <span className={styles.name}>{profile.name}</span>
          <span className={`meta ${styles.sub}`}>{profile.field}</span>
        </a>

        <ul className={styles.links}>
          {sections.map(({ id, label }) => (
            <li key={id}>
              <a href={href(id)} className={styles.link} aria-current={active === id ? 'true' : undefined}>
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
          {open ? 'Close' : 'Menu'}
          <span className="visually-hidden"> navigation</span>
        </button>
      </nav>

      <div id="mobile-menu" ref={panelRef} className={styles.panel} hidden={!open}>
        <ol className={`wrap ${styles.panelList}`}>
          {sections.map(({ id, label }, i) => (
            <li key={id} style={{ '--i': i } as React.CSSProperties}>
              <a href={href(id)} onClick={() => setOpen(false)}>
                <span className="meta">{String(i + 1).padStart(2, '0')}</span>
                {label}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </header>
  )
}
