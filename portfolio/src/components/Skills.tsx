import { projects, skills } from '@/content/site'
import styles from './Skills.module.css'

const projectName = new Map(projects.map((p) => [p.slug, p.name]))

export function Skills() {
  return (
    <section id="skills" className="section" aria-labelledby="skills-title">
      <div className="wrap">
        <header className="section-head">
          <p className="section-index mono" data-reveal>
            <b>03</b> Skills
          </p>
          <h2 id="skills-title" className="section-title" data-reveal>
            Tools, with receipts.
          </h2>
          <p className={styles.note} data-reveal>
            Every tool here links to a project where it was actually used. No percentages or star ratings,
            just where to see it.
          </p>
        </header>

        <div className={styles.groups}>
          {skills.map((group, gi) => (
            <section
              key={group.title}
              className={styles.group}
              data-reveal
              style={{ '--reveal-delay': gi } as React.CSSProperties}
              aria-labelledby={`skills-${gi}`}
            >
              <header className={styles.groupHead}>
                <h3 id={`skills-${gi}`}>{group.title}</h3>
                <p className="mono">{group.note}</p>
              </header>
              <ul className={styles.items}>
                {group.items.map((skill) => (
                  <li key={skill.name} className={styles.item}>
                    <span className={styles.skill}>{skill.name}</span>
                    {skill.usedIn.length ? (
                      <span className={`${styles.used} mono`}>
                        <span className="visually-hidden">Used in </span>
                        {skill.usedIn.map((slug, i) => (
                          <span key={slug}>
                            {i > 0 ? ', ' : null}
                            <a href={`#${slug}`} className="link">
                              {projectName.get(slug) ?? slug}
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
      </div>
    </section>
  )
}
