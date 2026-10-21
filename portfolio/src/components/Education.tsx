import Link from 'next/link'
import { record } from '@/content/site'
import { ArrowRight } from './Icons'
import { filled, TodoNote } from './Todo'
import styles from './Education.module.css'

export function Education() {
  return (
    <section id="education" className="section wrap" aria-labelledby="education-title">
      <header className="section-head">
        <p className="meta">
          <b>04</b> Education &amp; record
        </p>
        <h2 id="education-title" className="section-title" data-reveal>
          Where I study, <em>and what I’ve built so far.</em>
        </h2>
      </header>

      <ol className={styles.list}>
        {record.map((e) => {
          const period = filled(e.period)
          const place = filled(e.place)
          const detail = filled(e.detail)
          return (
            <li key={`${e.tag}-${e.title}`} className={styles.row} data-reveal>
              <p className={`${styles.period} meta`}>{period ?? <TodoNote value={e.period} />}</p>
              <div className={styles.main}>
                <h3 className={styles.title}>
                  {e.href ? (
                    <Link href={e.href} className={styles.titleLink}>
                      {e.title}
                      <ArrowRight />
                    </Link>
                  ) : (
                    e.title
                  )}
                </h3>
                {place ? <p className={styles.place}>{place}</p> : <TodoNote value={e.place} />}
              </div>
              <div className={styles.detail}>{detail ? <p>{detail}</p> : <TodoNote value={e.detail} />}</div>
              <p className={`${styles.tag} meta`}>{e.tag}</p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
