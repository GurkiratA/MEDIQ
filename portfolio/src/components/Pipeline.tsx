import type { PipelineStep } from '@/content/site'
import styles from './Pipeline.module.css'

type Props = {
  steps: PipelineStep[]
  /** horizontal collapses to vertical on narrow screens */
  orientation?: 'horizontal' | 'vertical'
  label: string
}

/** A project's architecture as a sequence of stages, with a signal that runs through it. */
export function Pipeline({ steps, orientation = 'horizontal', label }: Props) {
  return (
    <figure className={styles.wrap} data-orientation={orientation} data-reveal>
      <figcaption className="label">{label}</figcaption>
      <div className={styles.track} style={{ '--n': steps.length } as React.CSSProperties}>
        <span className={styles.signal} aria-hidden="true" />
        <ol className={styles.list}>
        {steps.map((step, i) => (
          <li key={step.label} className={styles.step} data-gate={step.gate || undefined}>
            <span className={styles.node} aria-hidden="true" />
            <span className={`${styles.index} mono`}>{String(i + 1).padStart(2, '0')}</span>
            <span className={styles.name}>{step.label}</span>
            <span className={`${styles.detail} mono`}>{step.detail}</span>
          </li>
        ))}
        </ol>
      </div>
    </figure>
  )
}
