import Image from 'next/image'
import { projects, type Project } from '@/content/site'
import { ArrowOut } from './Icons'
import { Pipeline } from './Pipeline'
import { filled, isDev, TodoNote } from './Todo'
import styles from './Work.module.css'

const number = (i: number) => String(i + 1).padStart(2, '0')

export function Work() {
  return (
    <section id="work" className="section" aria-labelledby="work-title">
      <div className="wrap">
        <header className="section-head">
          <p className="section-index mono" data-reveal>
            <b>01</b> Selected work
          </p>
          <h2 id="work-title" className="section-title" data-reveal>
            Things I’ve helped build <em>— and how they work.</em>
          </h2>
        </header>

        <ol className={styles.index} aria-label="Project index" data-reveal>
          {projects.map((p, i) => (
            <li key={p.slug}>
              <a href={`#${p.slug}`} className={styles.indexRow}>
                <span className="mono">{number(i)}</span>
                <span className={styles.indexName}>{p.name}</span>
                <span className={styles.indexKind}>{p.kind}</span>
                <span className="mono">{p.year}</span>
              </a>
            </li>
          ))}
        </ol>

        <div className={styles.projects}>
          {projects.map((p, i) => (
            <ProjectBlock key={p.slug} project={p} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}

function ProjectBlock({ project, index }: { project: Project; index: number }) {
  return (
    <article id={project.slug} className={styles.project} data-layout={project.layout} aria-labelledby={`${project.slug}-title`}>
      <header className={styles.head} data-reveal>
        <p className={`${styles.meta} mono`}>
          <span className={styles.num}>{number(index)}</span>
          <span>{project.kind}</span>
          <span>{project.year}</span>
        </p>
        <h3 id={`${project.slug}-title`} className={styles.name}>
          {project.name}
        </h3>
        <p className={styles.tagline}>{project.tagline}</p>
      </header>

      {project.image ? <Shot project={project} /> : null}

      <div className={styles.body}>
        <div className={styles.story} data-reveal>
          <Block title="The problem">
            <p>{project.problem}</p>
          </Block>
          <Block title="What it does">
            <p>{project.description}</p>
          </Block>
          <Block title="Worth noticing">
            <ul className={styles.highlights}>
              {project.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </Block>
        </div>

        <aside className={styles.facts} data-reveal aria-label={`${project.name} details`}>
          <Facts project={project} />
        </aside>
      </div>

      <Pipeline
        steps={project.pipeline}
        orientation={project.layout === 'split' ? 'vertical' : 'horizontal'}
        label={`How ${project.name} fits together`}
      />
    </article>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.block}>
      <h4 className="label">{title}</h4>
      {children}
    </section>
  )
}

function Facts({ project }: { project: Project }) {
  const role = filled(project.role)
  const links = project.links.filter((l) => filled(l.href))

  return (
    <dl className={styles.factList}>
      {role || isDev ? (
        <div>
          <dt className="label">My role</dt>
          <dd>{role ?? <TodoNote value={project.role} />}</dd>
        </div>
      ) : null}
      {project.credit ? (
        <div>
          <dt className="label">Credit</dt>
          <dd className={styles.credit}>{project.credit}</dd>
        </div>
      ) : null}
      <div>
        <dt className="label">Built with</dt>
        <dd>
          <ul className={styles.stack}>
            {project.stack.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </dd>
      </div>
      {links.length ? (
        <div>
          <dt className="label">Links</dt>
          <dd className={styles.links}>
            {links.map((l) => (
              <a key={l.label} href={filled(l.href)!} target="_blank" rel="noopener noreferrer" className={styles.extLink}>
                {l.label}
                <span className="visually-hidden"> for {project.name} (opens in a new tab)</span>
                <ArrowOut className="arrow" />
              </a>
            ))}
          </dd>
        </div>
      ) : null}
    </dl>
  )
}

function Shot({ project }: { project: Project }) {
  const img = project.image!
  return (
    <figure className={styles.shot} data-reveal>
      <div className={styles.frame}>
        <div className={`${styles.frameBar} mono`} aria-hidden="true">
          <span className={styles.lights}>
            <i />
            <i />
            <i />
          </span>
          <span>{project.slug}</span>
        </div>
        <Image
          src={img.src}
          alt={img.alt}
          width={img.width}
          height={img.height}
          sizes={project.layout === 'feature' ? '(min-width: 1360px) 1270px, 94vw' : '(min-width: 1000px) 620px, 94vw'}
          className={styles.img}
          loading="lazy"
        />
      </div>
      <figcaption className={`${styles.caption} mono`}>{img.caption}</figcaption>
    </figure>
  )
}
