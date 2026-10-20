import { profile } from '@/content/site'
import styles from './About.module.css'

export function About() {
  const [lead, ...rest] = profile.about
  return (
    <section id="about" className="section" aria-labelledby="about-title">
      <div className={`wrap ${styles.grid}`}>
        <header className={styles.head}>
          <p className="section-index mono" data-reveal>
            <b>02</b> About
          </p>
          <h2 id="about-title" className="section-title" data-reveal>
            Hi, I’m {profile.firstName}.
          </h2>
        </header>

        <div className={styles.text}>
          <p className={styles.lead} data-reveal>
            {lead}
          </p>
          {rest.map((para) => (
            <p key={para.slice(0, 24)} data-reveal>
              {para}
            </p>
          ))}
        </div>

        <aside className={styles.now} data-reveal aria-labelledby="now-title">
          <h3 id="now-title" className="label">
            Right now
          </h3>
          <ul>
            {profile.now.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className={`${styles.place} mono`}>
            {profile.location}
            <br />
            {profile.coordinates}
          </p>
        </aside>
      </div>
    </section>
  )
}
