import { links, profile, sections } from '@/content/site'
import { filled } from './Todo'
import styles from './Footer.module.css'

export function Footer() {
  const year = new Date().getFullYear()
  const github = filled(links.github)
  const linkedin = filled(links.linkedin)
  const email = filled(links.email)

  return (
    <footer className={`wrap ${styles.footer}`}>
      <p className={styles.sign}>{profile.name}</p>
      <nav aria-label="Footer" className={styles.nav}>
        <ul>
          {sections.map(({ id, label }) => (
            <li key={id}>
              <a href={`/#${id}`} className="link">
                {label}
              </a>
            </li>
          ))}
        </ul>
        <ul>
          {github ? (
            <li>
              <a href={github} className="link" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </li>
          ) : null}
          {linkedin ? (
            <li>
              <a href={linkedin} className="link" target="_blank" rel="noopener noreferrer">
                LinkedIn
              </a>
            </li>
          ) : null}
          {email ? (
            <li>
              <a href={`mailto:${email}`} className="link">
                Email
              </a>
            </li>
          ) : null}
        </ul>
      </nav>
      <p className={`${styles.legal} meta`}>
        © {year} {profile.name}
      </p>
    </footer>
  )
}
