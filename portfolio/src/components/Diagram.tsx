import type { Step } from '@/content/site'
import styles from './Diagram.module.css'

type Props = {
  steps: Step[]
  caption: string
  /** horizontal falls back to vertical on narrow screens */
  orientation?: 'horizontal' | 'vertical'
  /** Light linework on the project's tone instead of on paper */
  dark?: boolean
}

/**
 * A project's architecture as an ordered sequence of stages. Plain HTML, so
 * it reads correctly to screen readers and reflows on small screens.
 */
export function Diagram({ steps, caption, orientation = 'vertical', dark = false }: Props) {
  return (
    <figure className={styles.figure} data-orientation={orientation} data-dark={dark || undefined}>
      <ol className={styles.list} style={{ '--n': steps.length } as React.CSSProperties}>
        {steps.map((step, i) => (
          <li key={step.label} className={styles.step} data-gate={step.gate || undefined}>
            <span className={styles.node} aria-hidden="true" />
            <span className={`${styles.index} meta`}>{String(i + 1).padStart(2, '0')}</span>
            <span className={styles.label}>
              {step.label}
              {step.gate ? <span className={`${styles.gateTag} meta`}>human step</span> : null}
            </span>
            <span className={styles.detail}>{step.detail}</span>
          </li>
        ))}
      </ol>
      <figcaption className="meta">{caption}</figcaption>
    </figure>
  )
}
