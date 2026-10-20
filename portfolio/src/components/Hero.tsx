import { links, profile } from '@/content/site'
import { ContourField } from './ContourField'
import { ArrowDown, ArrowOut } from './Icons'
import { filled } from './Todo'
import styles from './Hero.module.css'

export function Hero() {
  const github = filled(links.github)
  const resume = filled(links.resume)

  return (
    <section className={styles.hero} aria-labelledby="hero-name">
      <ContourField coordinates={`${profile.location} · ${profile.coordinates}`} />

      <div className={`wrap ${styles.inner}`}>
        <p className={`${styles.kicker} mono ${styles.rise}`}>
          <span className={styles.dot} aria-hidden="true" />
          <span>{profile.role}</span>
          <span className={styles.sep} aria-hidden="true">/</span>
          <span>{profile.school}</span>
        </p>

        <h1 id="hero-name" className={styles.name}>
          <span className={styles.line}>
            <span className={styles.first}>{profile.firstName}</span>
          </span>
          <span className={styles.line}>
            <span className={styles.last}>{profile.lastName}</span>
          </span>
        </h1>

        <div className={`${styles.copy} ${styles.rise}`} style={{ '--delay': '260ms' } as React.CSSProperties}>
          <p className={styles.headline}>{profile.headline}</p>
          <p className={styles.intro}>{profile.intro}</p>

          <div className={styles.actions}>
            <a className="btn btn--primary" href="#work">
              See the work
              <ArrowDown />
            </a>
            {resume ? (
              <a className="btn" href={resume} target="_blank" rel="noopener">
                Résumé
                <ArrowOut />
              </a>
            ) : null}
            {github ? (
              <a className="btn" href={github} target="_blank" rel="noopener noreferrer">
                GitHub
                <ArrowOut />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
