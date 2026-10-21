// A handful of inline arrows — no icon library.

type IconProps = { className?: string; size?: number }

const svg = (size: number, className: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
  className,
})

export const ArrowRight = ({ className = 'arrow arrow--right', size = 14 }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" />
  </svg>
)

export const ArrowLeft = ({ className = 'arrow arrow--left', size = 14 }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="M13.5 8h-11M7 3.5 2.5 8 7 12.5" />
  </svg>
)

export const ArrowOut = ({ className = 'arrow arrow--out', size = 13 }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="M4.5 11.5 11.5 4.5M5.5 4.5h6v6" />
  </svg>
)

export const ArrowDown = ({ className = 'arrow arrow--down', size = 14 }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="M8 2.5v11M3.5 9 8 13.5 12.5 9" />
  </svg>
)

export const ArrowUp = ({ className = 'arrow arrow--up', size = 13 }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="M8 13.5v-11M3.5 7 8 2.5 12.5 7" />
  </svg>
)
