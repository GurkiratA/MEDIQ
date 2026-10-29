# Krish Shah — Portfolio

A personal portfolio site, kept in its own folder inside this repository. It
has nothing to do with the MEDIQ app around it and shares no code or
dependencies with it.

- **Home page:** hero, selected work, about, skills, education and contact.
- **Case studies:** one page per project at `/work/<slug>/`.
- **Stack:** Next.js 16 (static export), React 19, TypeScript, and plain CSS
  with design tokens and CSS Modules. No UI kit, icon library, analytics,
  backend, database or API keys.

## Commands

```bash
cd portfolio
npm install
npm run dev         # http://localhost:3000 — placeholders are visible here
npm run build       # static site → ./out
npm start           # serve ./out locally
npm run lint        # ESLint (next/core-web-vitals + TypeScript rules)
npm run typecheck   # tsc --noEmit
```

There is no unit-test suite; `lint`, `typecheck` and `build` are the checks.

---

## Editing your details — `src/content/site.ts`

Every word, link, project and skill on the site lives in **one file**:
[`src/content/site.ts`](src/content/site.ts). Components only read from it.

### Placeholders: `todo('…')`

A value wrapped in `todo('…')` is something only you can fill in.

- During `npm run dev` it shows as a dashed amber note, so you can see what's
  missing.
- In the production build it is **hidden**. A case-study section whose
  content is a todo is left out entirely, including from "On this page".

Replace `todo('…')` with a real string or array once you have it. Still open:

| Field | What to add |
|---|---|
| `links.linkedin` | Your LinkedIn URL |
| `links.resume` | Put your PDF at `public/resume.pdf`, then set this to `'/resume.pdf'`. Résumé buttons appear on their own. |
| `runofflab.role` | Your role. **Read the note below.** |
| `mediq.role`, `mediq.lessons` | What you built, and what you learned |
| `challenges`, `next`, `lessons` | Optional per project, in your own words |
| `record` → Computer Science | Program years and degree name |
| `record` → MEDIQ `place` | The hackathon's name |

> **About RunoffLab.** The public repository and its contribution record
> (`AI-USE.md`) credit **Rishik Rontala** and name no other contributors. The
> site credits Rishik on the project and leaves your role blank. Describe your
> contribution accurately before publishing. If you weren't substantially
> involved, change its `layout` and move it down the `projects` array.

### Writing rules the content follows

- Every technical claim in a project comes from its code or its own
  documentation. Each case study lists its `sources`.
- No invented roles, metrics, users or outcomes. RunoffLab's numbers are
  modelled results, and the copy says so.
- Read the About text and hero copy (`profile`) and rewrite anything that
  doesn't sound like you.

### Adding a project

Add an object to `projects`. The home page, hero contents, case-study route,
sitemap and "next case study" link all update automatically.

- `layout`: `'lead'` (full-width image and three-column spread), `'split'`
  (architecture diagram beside the story) or `'brief'` (compact row). Vary
  them so the page doesn't repeat itself.
- `architecture`: 3–6 `{ label, detail }` steps, drawn as a diagram. Add
  `gate: true` to the step a person must approve.
- Case-study fields (all optional except `problem`): `constraints`,
  `approach`, `features`, `decisions`, `challenges`, `limitations`, `next`,
  `lessons`, `gallery`, `sources`.
- Images: put WebP screenshots in `public/projects/` (about 1600 px wide)
  and give their real `width` and `height`, so the layout never shifts.

### Skills, education, links

- `skills`: groups of `{ name, usedIn }`. `usedIn` lists project slugs and
  renders as links to those case studies. Leave it empty for coursework.
- `record`: education, hackathons, projects, experience and awards, newest
  first. Only add verifiable entries.
- `links`: GitHub, LinkedIn, email and résumé. A link left as `todo()` is
  never rendered, so there are no dead buttons. The email address comes from
  your Git commit history; change it if you prefer another inbox.

### Site URL

Canonical URLs and social previews use `NEXT_PUBLIC_SITE_URL`. On Vercel,
the production URL is picked up automatically.

```bash
NEXT_PUBLIC_SITE_URL=https://your-domain.dev npm run build
```

The share image is generated from `src/app/opengraph-image.tsx`, and the
favicon is `src/app/icon.svg`.

---

## Deploying

`npm run build` writes a fully static site to `out/`.

- **Vercel:** import the repository and set **Root Directory** to
  `portfolio`. Nothing else needs configuring.
- **Netlify / Cloudflare Pages:** base directory `portfolio`, build command
  `npm run build`, publish directory `portfolio/out`.
- **GitHub Pages:** publish `out/`. If it's served from a sub-path
  (`user.github.io/repo`), set `basePath` in `next.config.ts` first.

---

## Design notes

**Direction.** Warm editorial: a parchment background (`#ece4d3`), charcoal ink and deep cobalt (`#1f3aa6`), with one colour per project — clay for RunoffLab, teal for MEDIQ, plum for DiscreteSolver — set with `tone` in `site.ts`. A project's colour appears on its figure mats, numbering, diagram and case-study header. Full-width bands break the page into chapters: a cobalt cover panel in the hero, a dark About band, a cobalt Contact band and an ink footer. Tokens live at the top of `src/app/globals.css`; dark bands re-map the ink tokens, so components work on any band unchanged.

**Artwork.** The contour linework is generated, not stock. `python3 scripts/contours.py` traces contour lines over smooth noise with marching squares and writes small static SVGs to `public/art/` (needs NumPy).

**Type.** Newsreader (serif) for the name, titles and pull quotes. Inter for
reading and interface. JetBrains Mono for small metadata labels. Fonts are
self-hosted through `next/font/local` with metric-matched fallbacks.

**Signature.** The hero's cobalt cover panel: contour art with a "Contents" index to the work, set like a magazine cover. Projects are labelled as figures ("Fig. 01"), and
architecture is drawn as an ordered diagram rather than a stack of cards.

**Motion.** Everything is short and optional:

- the hero settles in with a transform only, so the text is never invisible;
- sections fade up as they scroll into view;
- screenshots are uncovered by a paper-coloured curtain;
- links underline and turn cobalt on hover.

With reduced motion or without JavaScript, everything simply shows.

**Accessibility.**

- Semantic landmarks and a single `h1` per page, with an ordered heading
  hierarchy.
- A skip link and visible focus outlines.
- A mobile menu that traps focus and closes with Escape.
- Descriptive link text and alt text on every image.
- An `aria-live` confirmation when the email is copied.
- Text contrast of at least 4.6:1 everywhere, and 44 px touch targets.

## Project structure

```
portfolio/
├── public/projects/          real screenshots (WebP)
├── src/
│   ├── app/
│   │   ├── layout.tsx         fonts, metadata, header/footer
│   │   ├── page.tsx           home page section order
│   │   ├── work/[slug]/       case-study pages (statically generated)
│   │   ├── globals.css        design tokens, base styles, motion
│   │   ├── icon.svg, opengraph-image.tsx, robots.ts, sitemap.ts
│   ├── components/            one component (+ .module.css) per piece
│   ├── content/site.ts        ← all editable content
│   └── fonts/                 self-hosted font files (OFL)
```
