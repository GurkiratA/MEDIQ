Self-hosted Latin subsets of three variable fonts, all under the SIL Open Font
License 1.1 (copied from the Fontsource packages):

- Bricolage Grotesque (weight + width axes) — headings
- Inter (weight axis) — body text
- JetBrains Mono (weight axis) — labels and metadata

They are loaded through `next/font/local` in `src/app/layout.tsx`, which
preloads them and generates size-adjusted system fallbacks so text does not
shift when the fonts arrive.
