import { links, profile, projects } from '@/content/site'
import { ArrowDown, ArrowOut, ArrowRight } from './Icons'
import { filled } from './Todo'
import styles from './Hero.module.css'

export function Hero() {
  const github = filled(links.github)
  const resume = filled(links.resume)

  return (
    <section className={`wrap ${styles.hero}`} aria-labelledby="hero-name">
      <div className={`${styles.strip} meta`}>
        <span>Portfolio</span>
        <span>
          {profile.field}, {profile.school}
        </span>
        <span className={styles.stripEnd}>Selected work, {projects[0]?.year}</span>
      </div>

      <h1 id="hero-name" className={styles.name}>
        <span className={styles.nameLine}>{profile.name}</span>
      </h1>

      <div className={styles.body}>
        <p className={`${styles.label} meta`} aria-hidden="true">
          ¶ Approach
        </p>

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

        <nav className={styles.contents} aria-labelledby="contents-title">
          <h2 id="contents-title" className="meta">
            Contents
          </h2>
          <ol>
            {projects.map((p, i) => (
              <li key={p.slug}>
                <a href={`#${p.slug}`} className={styles.entry}>
                  <span className={styles.entryNum}>{String(i + 1).padStart(2, '0')}</span>
                  <span className={styles.entryName}>{p.name}</span>
                  <span className={`${styles.entryKind} meta`}>{p.kind}</span>
                  <ArrowRight className={`arrow arrow--right ${styles.entryArrow}`} />
                </a>
              </li>
            ))}
            <li>
              <a href="#about" className={styles.entry}>
                <span className={styles.entryNum}>{String(projects.length + 1).padStart(2, '0')}</span>
                <span className={styles.entryName}>About &amp; skills</span>
                <span className={`${styles.entryKind} meta`}>Who’s building this</span>
                <ArrowRight className={`arrow arrow--right ${styles.entryArrow}`} />
              </a>
            </li>
          </ol>
        </nav>
      </div>
    </section>
  )
}
