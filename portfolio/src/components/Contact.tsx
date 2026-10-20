'use client'

import { useState } from 'react'
import { links, profile } from '@/content/site'
import { ContourField } from './ContourField'
import { ArrowOut, Check, Copy, GitHub, LinkedIn } from './Icons'
import { filled, isDev, TodoNote } from './Todo'
import styles from './Contact.module.css'

export function Contact() {
  const email = filled(links.email)
  const github = filled(links.github)
  const linkedin = filled(links.linkedin)
  const resume = filled(links.resume)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!email) return
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      window.location.href = `mailto:${email}`
    }
  }

  const socials = [
    github && { label: 'GitHub', href: github, handle: github.replace(/^https?:\/\/(www\.)?/, ''), Icon: GitHub },
    linkedin && { label: 'LinkedIn', href: linkedin, handle: linkedin.replace(/^https?:\/\/(www\.)?/, ''), Icon: LinkedIn },
  ].filter(Boolean) as { label: string; href: string; handle: string; Icon: typeof GitHub }[]

  return (
    <section id="contact" className={`section ${styles.contact}`} aria-labelledby="contact-title">
      <ContourField coordinates={profile.coordinates} seed={23} />
      <div className="wrap">
        <p className="section-index mono" data-reveal>
          <b>05</b> Contact
        </p>

        <h2 id="contact-title" className={styles.title} data-reveal>
          Got a problem worth building for?
          <span className={styles.titleSub}>I’d like to hear about it.</span>
        </h2>

        <p className={styles.lede} data-reveal>
          I’m looking for internships and teams where I can learn by shipping real things. If you’re hiring,
          running a hackathon team, or just want to talk about one of these projects — email is the fastest way to
          reach me.
        </p>

        {email ? (
          <div className={styles.emailRow} data-reveal>
            <a href={`mailto:${email}`} className={styles.email}>
              {email}
            </a>
            <button type="button" className={`btn ${styles.copy}`} onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? 'Copied' : 'Copy'}
              <span className="visually-hidden"> email address</span>
            </button>
            <span className="visually-hidden" role="status" aria-live="polite">
              {copied ? 'Email address copied to clipboard' : ''}
            </span>
          </div>
        ) : null}

        <ul className={styles.socials} data-reveal>
          {socials.map(({ label, href, handle, Icon }) => (
            <li key={label}>
              <a href={href} target="_blank" rel="noopener noreferrer" className={styles.social}>
                <Icon />
                <span className={styles.socialLabel}>{label}</span>
                <span className={`${styles.handle} mono`}>{handle}</span>
                <ArrowOut className={`arrow ${styles.socialArrow}`} />
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
          {resume ? (
            <li>
              <a href={resume} target="_blank" rel="noopener" className={styles.social}>
                <span className={styles.socialLabel}>Résumé</span>
                <span className={`${styles.handle} mono`}>PDF</span>
                <ArrowOut className={`arrow ${styles.socialArrow}`} />
              </a>
            </li>
          ) : null}
          {isDev && (!linkedin || !resume) ? (
            <li className={styles.todos}>
              <TodoNote value={links.linkedin} />
              <TodoNote value={links.resume} />
            </li>
          ) : null}
        </ul>

        <p className={`${styles.sign} mono`} data-reveal>
          — {profile.name}, {profile.location}
        </p>
      </div>
    </section>
  )
}
