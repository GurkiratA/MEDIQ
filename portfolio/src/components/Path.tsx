import { timeline } from '@/content/site'
import { filled, TodoNote } from './Todo'
import styles from './Path.module.css'

export function Path() {
  return (
    <section id="path" className="section" aria-labelledby="path-title">
      <div className="wrap">
        <header className="section-head">
          <p className="section-index mono" data-reveal>
            <b>04</b> Path
          </p>
          <h2 id="path-title" className="section-title" data-reveal>
            Education &amp; experience <em>so far.</em>
          </h2>
        </header>

        <ol className={styles.list}>
          {timeline.map((entry) => {
            const period = filled(entry.period)
            const place = filled(entry.place)
            const detail = filled(entry.detail)
            return (
              <li key={`${entry.title}-${entry.tag}`} className={styles.row} data-reveal>
                <p className={`${styles.period} mono`}>{period ?? <TodoNote value={entry.period} />}</p>
                <div className={styles.main}>
                  <h3 className={styles.title}>{entry.title}</h3>
                  {place ? <p className={styles.place}>{place}</p> : <TodoNote value={entry.place} />}
                </div>
                <div className={styles.detail}>
                  {detail ? <p>{detail}</p> : <TodoNote value={entry.detail} />}
                </div>
                <p className={`${styles.tag} mono`}>{entry.tag}</p>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
