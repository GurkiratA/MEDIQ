Self-hosted Latin subsets of three variable fonts, all under the SIL Open Font
License 1.1 (taken from the Fontsource packages):

- Newsreader (weight axis, roman + italic) — headlines and editorial type
- Inter (weight axis) — body text and interface
- JetBrains Mono (weight axis) — labels and technical metadata

They are loaded through `next/font/local` in `src/app/layout.tsx`, which
generates size-adjusted system fallbacks (Times New Roman / Arial) so text
does not jump when the fonts arrive. The site still works if they fail to
load.
