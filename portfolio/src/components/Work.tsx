import { projects, type Project } from '@/content/site'
import { Diagram } from './Diagram'
import { ArrowRight } from './Icons'
import { Plate } from './Plate'
import { ProjectFacts } from './ProjectFacts'
import styles from './Work.module.css'

const num = (i: number) => String(i + 1).padStart(2, '0')

export function Work() {
  return (
    <section id="work" className="section wrap" aria-labelledby="work-title">
      <header className="section-head">
        <p className="meta">
          <b>01</b> Selected work
        </p>
        <h2 id="work-title" className="section-title" data-reveal>
          Projects, with the reasoning <em>left in.</em>
        </h2>
      </header>

      <div className={styles.list}>
        {projects.map((p, i) => {
          const Layout = p.layout === 'lead' ? Lead : p.layout === 'split' ? Split : Brief
          return <Layout key={p.slug} project={p} index={i} total={projects.length} />
        })}
      </div>
    </section>
  )
}

type Props = { project: Project; index: number; total: number }

function Heading({ project, index, total, size = 'large' }: Props & { size?: 'large' | 'small' }) {
  return (
    <header className={styles.heading} data-reveal>
      <p className="meta">
        <span className={styles.num}>
          {num(index)} / {num(total - 1)}
        </span>
        <span>{project.kind}</span>
        <span>{project.year}</span>
      </p>
      <h3 id={`${project.slug}-title`} className={styles.title} data-size={size}>
        <a href={`/work/${project.slug}/`}>{project.name}</a>
      </h3>
      <p className={styles.summary}>{project.summary}</p>
    </header>
  )
}

function CaseLink({ project }: { project: Project }) {
  return (
    <a href={`/work/${project.slug}/`} className={`arrow-link ${styles.caseLink}`}>
      Read the {project.name} case study
      <ArrowRight />
    </a>
  )
}

/** The primary project: full-width plate, then a three-column spread. */
function Lead({ project, index, total }: Props) {
  const firstDecisions = project.decisions?.slice(0, 2) ?? []
  return (
    <article id={project.slug} className={styles.lead} data-tone={project.tone} aria-labelledby={`${project.slug}-title`}>
      <Heading project={project} index={index} total={total} />

      {project.cover ? (
        <div className={styles.leadPlate}>
          <Plate figure={project.cover} label={`Fig. ${num(index)}`} sizes="(min-width: 1440px) 1330px, 94vw" />
        </div>
      ) : null}

      <div className={styles.spread}>
        <div className={styles.col} data-reveal>
          <h4 className="meta">The problem</h4>
          <p>{project.problem}</p>
        </div>
        <div className={styles.col} data-reveal style={{ '--d': 1 } as React.CSSProperties}>
          <h4 className="meta">The approach</h4>
          {project.approach ? <p>{project.approach}</p> : null}
          {firstDecisions.length ? (
            <ul className={styles.notes}>
              {firstDecisions.map((d) => (
                <li key={d.title}>
                  <strong>{d.title}.</strong> {d.body}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <aside className={styles.colFacts} data-reveal style={{ '--d': 2 } as React.CSSProperties}>
          <ProjectFacts project={project} />
        </aside>
      </div>

      <CaseLink project={project} />
    </article>
  )
}

/** Diagram-led: architecture on one side, story on the other. */
function Split({ project, index, total }: Props) {
  return (
    <article id={project.slug} className={styles.split} data-tone={project.tone} aria-labelledby={`${project.slug}-title`}>
      <div className={styles.splitText}>
        <Heading project={project} index={index} total={total} />
        <div className={styles.splitBody} data-reveal>
          <p>{project.problem}</p>
          {project.decisions?.[0] ? (
            <blockquote className={styles.pull}>
              <p>{project.decisions[0].body}</p>
            </blockquote>
          ) : null}
        </div>
        <div data-reveal>
          <ProjectFacts project={project} />
        </div>
        <CaseLink project={project} />
      </div>
      <div className={styles.splitFigure} data-reveal>
        <Diagram steps={project.architecture} caption={`Fig. ${num(index)} — How ${project.name} fits together`} dark />
      </div>
    </article>
  )
}

/** A smaller entry: text, screenshot and facts on one row. */
function Brief({ project, index, total }: Props) {
  return (
    <article id={project.slug} className={styles.brief} data-tone={project.tone} aria-labelledby={`${project.slug}-title`}>
      <div className={styles.briefText}>
        <Heading project={project} index={index} total={total} size="small" />
        <p className={styles.briefBody} data-reveal>
          {project.approach}
        </p>
        <CaseLink project={project} />
      </div>
      {project.cover ? (
        <div className={styles.briefPlate}>
          <Plate figure={project.cover} label={`Fig. ${num(index)}`} sizes="(min-width: 1000px) 34vw, 94vw" />
        </div>
      ) : null}
      <aside className={styles.briefFacts} data-reveal>
        <ProjectFacts project={project} compact />
      </aside>
    </article>
  )
}
