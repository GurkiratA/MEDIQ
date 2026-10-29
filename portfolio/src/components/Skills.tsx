import { projects, skills } from '@/content/site'
import styles from './Skills.module.css'

const bySlug = new Map(projects.map((p) => [p.slug, p]))

export function Skills() {
  return (
    <section id="skills" className="section wrap" aria-labelledby="skills-title">
      <header className="section-head">
        <p className="meta">
          <b>03</b> Skills
        </p>
        <h2 id="skills-title" className="section-title" data-reveal>
          What I’ve used, <em>and where.</em>
        </h2>
      </header>

      <div className={styles.table}>
        {skills.map((group, gi) => (
          <section
            key={group.title}
            className={styles.row}
            aria-labelledby={`skills-${gi}`}
            data-reveal
            style={{ '--d': gi } as React.CSSProperties}
          >
            <h3 id={`skills-${gi}`} className="meta">
              {group.title}
            </h3>
            <ul className={styles.items}>
              {group.items.map((s) => (
                <li key={s.name}>
                  <span className={styles.name}>{s.name}</span>
                  {s.usedIn.length ? (
                    <span className={styles.where}>
                      <span className="visually-hidden">used in </span>
                      {s.usedIn.map((slug, i) => (
                        <span key={slug}>
                          {i ? ', ' : ''}
                          <a href={`/work/${slug}/`} className="link" data-tone={bySlug.get(slug)?.tone}>
                            <span className={styles.dot} aria-hidden="true" />
                            {bySlug.get(slug)?.name ?? slug}
                          </a>
                        </span>
                      ))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className={`${styles.note} meta`}>Each entry names the project where it was used — no ratings.</p>
    </section>
  )
}
