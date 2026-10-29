import type { Project } from '@/content/site'
import { ArrowOut } from './Icons'
import { filled, isDev, TodoNote } from './Todo'
import styles from './ProjectFacts.module.css'

/** Role, credit, stack and links for a project, as a compact definition list. */
export function ProjectFacts({ project, compact = false }: { project: Project; compact?: boolean }) {
  const role = filled(project.role)
  const links = project.links.flatMap((l) => {
    const href = filled(l.href)
    return href ? [{ label: l.label, href }] : []
  })

  return (
    <dl className={styles.facts} data-compact={compact || undefined}>
      {role || isDev ? (
        <div>
          <dt className="meta">My role</dt>
          <dd>{role ?? <TodoNote value={project.role} />}</dd>
        </div>
      ) : null}
      {project.credit ? (
        <div>
          <dt className="meta">Credit</dt>
          <dd className={styles.muted}>{project.credit}</dd>
        </div>
      ) : null}
      <div>
        <dt className="meta">Built with</dt>
        <dd className={styles.stack}>{project.stack.join(', ')}</dd>
      </div>
      {links.length ? (
        <div>
          <dt className="meta">Links</dt>
          <dd className={styles.links}>
            {links.map((l) => (
              <a key={l.label} href={l.href} className="arrow-link" target="_blank" rel="noopener noreferrer">
                {l.label}
                <span className="visually-hidden"> for {project.name} (opens in a new tab)</span>
                <ArrowOut />
              </a>
            ))}
          </dd>
        </div>
      ) : null}
    </dl>
  )
}
