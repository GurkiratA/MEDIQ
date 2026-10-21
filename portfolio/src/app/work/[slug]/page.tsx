import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Diagram } from '@/components/Diagram'
import { ArrowLeft, ArrowRight } from '@/components/Icons'
import { Plate } from '@/components/Plate'
import { ProjectFacts } from '@/components/ProjectFacts'
import { filled, isDev, TodoNote } from '@/components/Todo'
import { projectBySlug, projects, type Maybe, type Project } from '@/content/site'
import styles from './case.module.css'

export const dynamicParams = false

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }))
}

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const project = projectBySlug((await params).slug)
  if (!project) return {}
  return {
    title: `${project.name} case study`,
    description: project.summary,
    alternates: { canonical: `/work/${project.slug}/` },
    openGraph: { title: `${project.name} — case study`, description: project.summary, url: `/work/${project.slug}/` },
  }
}

/**
 * A section exists when it has content. Placeholder (todo) content is shown
 * as a note during development and the section is omitted in production.
 */
type Section = { id: string; title: string; body: React.ReactNode }

function sectionsFor(p: Project): Section[] {
  const out: Section[] = []
  const add = (id: string, title: string, body: React.ReactNode | null | undefined) => {
    if (body) out.push({ id, title, body })
  }
  const optional = <T,>(value: Maybe<T> | undefined, render: (v: T) => React.ReactNode) => {
    const v = filled(value)
    if (v) return render(v)
    return isDev && value !== undefined ? <TodoNote value={value} /> : null
  }

  add('problem', 'The problem', <p className={styles.lede}>{p.problem}</p>)
  add(
    'constraints',
    'Constraints',
    p.constraints?.length ? (
      <ul className={styles.bullets}>
        {p.constraints.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    ) : null,
  )
  add('approach', 'Approach', p.approach ? <p>{p.approach}</p> : null)
  add(
    'architecture',
    'Architecture',
    <Diagram steps={p.architecture} caption={`How ${p.name} fits together`} orientation="horizontal" />,
  )
  add(
    'features',
    'What it does',
    p.features?.length ? (
      <ul className={styles.bullets}>
        {p.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    ) : null,
  )
  add(
    'decisions',
    'Engineering decisions',
    p.decisions?.length ? (
      <ol className={styles.decisions}>
        {p.decisions.map((d, i) => (
          <li key={d.title}>
            <span className="meta">{String(i + 1).padStart(2, '0')}</span>
            <h3>{d.title}</h3>
            <p>{d.body}</p>
          </li>
        ))}
      </ol>
    ) : null,
  )
  add(
    'figures',
    'Figures',
    p.gallery?.length ? (
      <div className={styles.gallery}>
        {p.gallery.map((f, i) => (
          <div key={f.src} className={f.height > f.width ? styles.tall : styles.wide}>
            <Plate figure={f} label={`Fig. ${i + 2}`} sizes="(min-width: 1000px) 50vw, 94vw" />
          </div>
        ))}
      </div>
    ) : null,
  )
  add(
    'challenges',
    'Challenges',
    optional(p.challenges, (notes) => (
      <ol className={styles.decisions}>
        {notes.map((d) => (
          <li key={d.title}>
            <h3>{d.title}</h3>
            <p>{d.body}</p>
          </li>
        ))}
      </ol>
    )),
  )
  add(
    'limitations',
    'Trade-offs & limitations',
    p.limitations?.length ? (
      <ul className={styles.bullets}>
        {p.limitations.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    ) : null,
  )
  add(
    'next',
    'What could come next',
    optional(p.next, (items) => (
      <ul className={styles.bullets}>
        {items.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    )),
  )
  add(
    'lessons',
    'What I learned',
    optional(p.lessons, (items) => (
      <ul className={styles.bullets}>
        {items.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    )),
  )
  return out
}

export default async function CaseStudy({ params }: Params) {
  const { slug } = await params
  const project = projectBySlug(slug)
  if (!project) notFound()

  const index = projects.indexOf(project)
  const next = projects[(index + 1) % projects.length]
  const sections = sectionsFor(project)

  return (
    <article className={`wrap ${styles.page}`} aria-labelledby="case-title">
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <a href="/#work" className="arrow-link">
          <ArrowLeft />
          All work
        </a>
        <span className="meta">
          Case study {String(index + 1).padStart(2, '0')} / {String(projects.length).padStart(2, '0')}
        </span>
      </nav>

      <header className={styles.head}>
        <p className="meta">
          {project.kind} · {project.year}
        </p>
        <h1 id="case-title" className={styles.title}>
          {project.name}
        </h1>
        <p className={styles.summary}>{project.summary}</p>
      </header>

      {project.cover ? (
        <div className={styles.cover}>
          <Plate figure={project.cover} label="Fig. 1" sizes="(min-width: 1440px) 1330px, 94vw" priority />
        </div>
      ) : null}

      <div className={styles.layout}>
        <aside className={styles.side}>
          <nav aria-label="On this page" className={styles.toc}>
            <p className="meta">On this page</p>
            <ol>
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.title}</a>
                </li>
              ))}
            </ol>
          </nav>
          <ProjectFacts project={project} />
        </aside>

        <div className={styles.content}>
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className={styles.section} aria-labelledby={`${s.id}-title`}>
              <h2 id={`${s.id}-title`} className={styles.sectionTitle}>
                <span className="meta">{String(i + 1).padStart(2, '0')}</span>
                {s.title}
              </h2>
              <div className={styles.sectionBody}>{s.body}</div>
            </section>
          ))}

          {project.sources?.length ? (
            <section className={styles.sources} aria-labelledby="sources-title">
              <h2 id="sources-title" className="meta">
                Sources
              </h2>
              <p>
                Facts and figures on this page come from the project’s own code and documentation:{' '}
                {project.sources.map((s, i) => (
                  <span key={s.href}>
                    {i ? ', ' : ''}
                    <a href={s.href} className="link" target="_blank" rel="noopener noreferrer">
                      {s.label}
                    </a>
                  </span>
                ))}
                .
              </p>
            </section>
          ) : null}
        </div>
      </div>

      {next && next.slug !== project.slug ? (
        <a href={`/work/${next.slug}/`} className={styles.next}>
          <span className="meta">Next case study</span>
          <span className={styles.nextName}>
            {next.name}
            <ArrowRight size={28} />
          </span>
          <span className={styles.nextSummary}>{next.summary}</span>
        </a>
      ) : null}

    </article>
  )
}
