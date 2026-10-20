import { links, profile, sections as NAV_ITEMS } from '@/content/site'
import { ArrowUp } from './Icons'
import { filled } from './Todo'
import styles from './Footer.module.css'

export function Footer() {
  const year = new Date().getFullYear()
  const external = [
    { label: 'GitHub', href: filled(links.github) },
    { label: 'LinkedIn', href: filled(links.linkedin) },
    { label: 'Email', href: filled(links.email) && `mailto:${filled(links.email)}` },
  ].filter((l): l is { label: string; href: string } => Boolean(l.href))

  return (
    <footer className={styles.footer}>
      <div className={`wrap ${styles.inner}`}>
        <p className="mono">
          © {year} {profile.name}
        </p>
        <nav aria-label="Footer" className={styles.nav}>
          <ul>
            {NAV_ITEMS.map(({ id, label }) => (
              <li key={id}>
                <a className="link" href={`#${id}`}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <ul>
            {external.map(({ label, href }) => (
              <li key={label}>
                <a className="link" href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <a href="#top" className={`${styles.top} mono`}>
          Back to top <ArrowUp />
        </a>
      </div>
    </footer>
  )
}
