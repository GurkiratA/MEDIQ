import { profile } from '@/content/site'
import styles from './About.module.css'

export function About() {
  return (
    <section id="about" className="section wrap" aria-labelledby="about-title">
      <header className="section-head">
        <p className="meta">
          <b>02</b> About
        </p>
        <h2 id="about-title" className="section-title" data-reveal>
          {profile.about.lead}
        </h2>
      </header>

      <div className={styles.grid}>
        <div className={`${styles.body} prose`} data-reveal>
          {profile.about.body.map((p) => (
            <p key={p.slice(0, 32)}>{p}</p>
          ))}
        </div>
        <dl className={styles.card} data-reveal style={{ '--d': 1 } as React.CSSProperties}>
          <div>
            <dt className="meta">Studying</dt>
            <dd>
              {profile.field}, {profile.school}
            </dd>
          </div>
          <div>
            <dt className="meta">Working toward</dt>
            <dd>Software engineering</dd>
          </div>
          <div>
            <dt className="meta">Drawn to</dt>
            <dd>Tools that are useful, checkable and finished properly</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
