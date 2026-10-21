import { links } from '@/content/site'
import { CopyEmail } from './CopyEmail'
import { ArrowOut } from './Icons'
import { filled, isDev, TodoNote } from './Todo'
import styles from './Contact.module.css'

export function Contact() {
  const email = filled(links.email)
  const rows = [
    { label: 'GitHub', href: filled(links.github) },
    { label: 'LinkedIn', href: filled(links.linkedin) },
    { label: 'Résumé (PDF)', href: filled(links.resume) },
  ].flatMap((r) => (r.href ? [{ label: r.label, href: r.href }] : []))

  return (
    <section id="contact" className="section wrap" aria-labelledby="contact-title">
      <header className="section-head">
        <p className="meta">
          <b>05</b> Contact
        </p>
      </header>

      <div className={styles.grid}>
        <h2 id="contact-title" className={styles.title} data-reveal>
          If you’re hiring, building a team, or curious about a project — <em>write to me.</em>
        </h2>

        <div className={styles.side} data-reveal style={{ '--d': 1 } as React.CSSProperties}>
          <p className={styles.lede}>
            Email is the most reliable way to reach me. The links below go to my code and profiles.
          </p>

          {email ? (
            <div className={styles.email}>
              <a href={`mailto:${email}`} className={styles.emailLink}>
                {email.split('@')[0]}
                <wbr />@{email.split('@')[1]}
              </a>
              <CopyEmail email={email} />
            </div>
          ) : null}

          <ul className={styles.rows}>
            {rows.map((r) => (
              <li key={r.label}>
                <a href={r.href} target="_blank" rel="noopener noreferrer" className={styles.row}>
                  <span>{r.label}</span>
                  <span className={styles.url}>{r.href.replace(/^https?:\/\/(www\.)?/, '')}</span>
                  <ArrowOut />
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>

          {isDev ? (
            <p className={styles.todos}>
              <TodoNote value={links.linkedin} /> <TodoNote value={links.resume} />
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
