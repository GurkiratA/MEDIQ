import Image from 'next/image'
import type { Figure } from '@/content/site'
import styles from './Plate.module.css'

type Props = {
  figure: Figure
  /** "Fig. 1" style label shown before the caption */
  label?: string
  sizes: string
  priority?: boolean
}

/** A captioned image on a paper mat. Dimensions are fixed, so nothing shifts. */
export function Plate({ figure, label, sizes, priority }: Props) {
  return (
    <figure className={styles.plate}>
      <div className={styles.mat} data-reveal="image">
        <Image
          src={figure.src}
          alt={figure.alt}
          width={figure.width}
          height={figure.height}
          sizes={sizes}
          className={styles.img}
          priority={priority}
          loading={priority ? undefined : 'lazy'}
        />
      </div>
      <figcaption className={styles.caption}>
        {label ? <span className="meta">{label}</span> : null}
        <span>{figure.caption}</span>
      </figcaption>
    </figure>
  )
}
