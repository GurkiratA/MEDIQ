import next from 'eslint-config-next/core-web-vitals'
import ts from 'eslint-config-next/typescript'

const config = [
  ...next,
  ...ts,
  { ignores: ['.next/**', 'out/**', 'next-env.d.ts'] },
  {
    // A small fully static site: internal links are plain anchors, so every
    // page also works when the export is hosted under a sub-path.
    rules: { '@next/next/no-html-link-for-pages': 'off' },
  },
]

export default config
