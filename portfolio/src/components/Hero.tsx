import { links, profile, projects } from '@/content/site'
import { ArrowDown, ArrowOut, ArrowRight } from './Icons'
import { filled } from './Todo'
import styles from './Hero.module.css'

export function Hero() {
  const github = filled(links.github)
  const resume = filled(links.resume)
  const [first, ...rest] = profile.name.split(' ')

  return (
    <section className={`wrap ${styles.hero}`} aria-labelledby="hero-name">
      <div className={styles.main}>
        <p className={`${styles.strip} meta`}>
          <span>Portfolio</span>
          <span>
            {profile.field}, {profile.school}
          </span>
        </p>

        <h1 id="hero-name" className={styles.name}>
          <span className={styles.line}>
            <span className={styles.word}>{first}</span>
          </span>
          <span className={styles.line}>
            <em className={styles.word}>{rest.join(' ')}</em>
          </span>
        </h1>

        <div className={styles.copy}>
          <p className={styles.headline}>{profile.headline}</p>
          <p className={styles.intro}>{profile.intro}</p>
          <div className={styles.actions}>
            <a className="btn btn--solid" href="#work">
              Selected work
              <ArrowDown />
            </a>
            {resume ? (
              <a className="btn btn--line" href={resume} target="_blank" rel="noopener">
                Résumé (PDF)
                <ArrowOut />
              </a>
            ) : null}
            {github ? (
              <a className="btn btn--line" href={github} target="_blank" rel="noopener noreferrer">
                GitHub
                <ArrowOut />
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {/* The cover: a cobalt plate with contour linework and the contents */}
      <aside className={styles.cover} aria-labelledby="contents-title">
        <div className={styles.coverHead}>
          <h2 id="contents-title" className="meta">
            Contents
          </h2>
          <span className="meta" aria-hidden="true">
            Nº {String(projects.length).padStart(2, '0')}
          </span>
        </div>
        <ol className={styles.entries}>
          {projects.map((p, i) => (
            <li key={p.slug} data-tone={p.tone}>
              <a href={`#${p.slug}`} className={styles.entry}>
                <span className={styles.entryNum}>{String(i + 1).padStart(2, '0')}</span>
                <span className={styles.entryName}>{p.name}</span>
                <span className={`${styles.entryKind} meta`}>{p.kind}</span>
                <ArrowRight className={`arrow arrow--right ${styles.entryArrow}`} />
              </a>
            </li>
          ))}
        </ol>
        <p className={`${styles.coverCaption} meta`}>Contours traced with marching squares</p>
      </aside>
    </section>
  )
}
