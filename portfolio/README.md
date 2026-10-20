# Krish Shah — Portfolio

A personal portfolio site, kept in its own folder inside this repository. It
has nothing to do with the MEDIQ app around it and shares no code or
dependencies with it.

**Stack:** Next.js 16 (static export) · React 19 · TypeScript · plain CSS with
design tokens and CSS Modules. No UI framework, no icon library, no analytics,
no backend, no API keys.

```bash
cd portfolio
npm install
npm run dev        # http://localhost:3000 (placeholders are visible here)
npm run build      # static site written to ./out
npm start          # serve ./out locally
```

Checks: `npm run lint`, `npm run typecheck`, `npm run build`.

---

## Editing your details — `src/content/site.ts`

Every word, link, project and skill on the site lives in **one file**:
[`src/content/site.ts`](src/content/site.ts). Components only read from it.

### Placeholders (`todo(...)`)

Anything wrapped in `todo('…')` is a value still missing. Placeholders are:

- **shown** as dashed amber notes while you run `npm run dev`, so you can see
  what's left to do;
- **hidden** in the production build, so the live site never shows an
  unfinished sentence.

Replace `todo('…')` with a plain string once you have the real value. These
are the open ones right now:

| Where | What to add |
|---|---|
| `links.linkedin` | Your LinkedIn URL |
| `links.resume` | Put the PDF at `public/resume.pdf`, then set this to `'/resume.pdf'`. The Résumé buttons appear automatically. |
| `projects → runofflab → role` | Your role on RunoffLab (see the note below) |
| `projects → mediq → role` | What you built on MEDIQ |
| `timeline → Computer Science → period / detail` | Program years and degree name |
| `timeline → MEDIQ → place` | The name of the hackathon |

> **About RunoffLab.** The public repository
> (`rishikrrontala-bot/runofflab`) and its contribution record credit
> **Rishik Rontala** as the builder and do not mention other contributors.
> The site credits Rishik on the project, and your role is a placeholder.
> Describe your contribution accurately before you publish. If RunoffLab was
> mainly Rishik's work, consider moving it out of the first position
> (reorder the `projects` array).

### Profile & copy

`profile` holds your name, role, school, the hero headline and intro, the
About paragraphs, the "Right now" list, and the availability line.

### Links

`links.github`, `links.linkedin`, `links.email`, `links.resume`. Every button
and footer link reads from here. A link that's still a `todo()` is simply not
rendered, so there are no dead buttons.

The email address comes from your Git commit history. Change it if you'd
rather use another inbox (e.g. your `@uoguelph.ca` address).

### Adding a project

Add an object to the `projects` array. Fields:

- `slug` — used for the `#anchor` and for linking skills to projects
- `layout` — `'feature'` (full-width showcase), `'split'` (architecture
  diagram beside the story) or `'compact'` (screenshot beside the story).
  Mixing layouts keeps the page from turning into a grid of identical cards.
- `problem`, `description`, `highlights`, `role`, `credit`
- `stack` — only technologies you can point to in the code
- `pipeline` — 3–6 steps describing how the system fits together. It's drawn
  as a flow diagram; mark the step a person has to approve with `gate: true`.
- `image` (optional) — put a real screenshot in `public/projects/` (WebP,
  about 1600 px wide) and give its exact `width`/`height` so the page doesn't
  shift while it loads.
- `links` — repository, live demo, etc.

The project index at the top of the Work section updates itself.

### Skills

`skills` is a list of groups. Each skill has `usedIn: ['project-slug', …]`,
which renders as links to the projects where you actually used it. Leave it
empty (`[]`) for things you know from coursework or self-study.

### Education, experience & achievements

`timeline` takes entries tagged `Education`, `Hackathon`, `Project`,
`Experience` or `Award`, newest first. Only add things you can back up.

### Site URL & social preview

The canonical URL comes from `NEXT_PUBLIC_SITE_URL` (or Vercel's production
URL automatically). Set it once you have a domain:

```bash
NEXT_PUBLIC_SITE_URL=https://your-domain.dev npm run build
```

The social-share image is generated at build time from
`src/app/opengraph-image.tsx`. The favicon is `src/app/icon.svg`.

---

## Deploying

The build is a fully static site in `out/`.

- **Vercel:** import the repository and set **Root Directory** to
  `portfolio`. The defaults work as-is.
- **Netlify / Cloudflare Pages:** base directory `portfolio`, build command
  `npm run build`, publish directory `portfolio/out`.
- **GitHub Pages:** upload `out/`. If it's served from a sub-path
  (`username.github.io/repo`), set `basePath` in `next.config.ts`.

---

## How it's put together

```
portfolio/
├── public/projects/        real screenshots (WebP)
├── src/
│   ├── app/
│   │   ├── layout.tsx      fonts, metadata, <html>
│   │   ├── page.tsx        section order + JSON-LD
│   │   ├── globals.css     design tokens, base styles, reveal motion
│   │   ├── icon.svg        favicon (a small contour mark)
│   │   ├── opengraph-image.tsx
│   │   ├── robots.ts, sitemap.ts
│   ├── components/         one component (+ .module.css) per section
│   ├── content/site.ts     ← all editable content
│   └── fonts/              self-hosted Latin subsets (OFL)
```

**Design.** Warm near-black, off-white type, one cyan accent. Bricolage
Grotesque for headings, Inter for body text, JetBrains Mono for labels and
measurements. The visual idea is a contour map: it nods to RunoffLab's
terrain work and to how the site treats each project, as a system you can
read. Colors, type scale, spacing and easing are tokens at the top of
`globals.css`.

**The hero terrain** (`components/ContourField.tsx`) traces contour lines
with marching squares over a slowly drifting noise field. A mouse raises a
hill under the cursor and tints nearby lines cyan, and a readout reports the
field value there. It:

- waits until the browser is idle before starting;
- uses an adaptive grid and frame rate;
- pauses when it's off screen or the tab is hidden;
- draws a single still frame on touch screens and for visitors who prefer
  reduced motion.

The page doesn't need it: without JavaScript the hero is plain type.

**Motion.** Hero type rises in with a CSS transform only, so the text is
never invisible. Sections fade in on scroll, but only when JavaScript is
running and reduced motion is off. Without either, everything is visible
from the start.

**Accessibility.** Semantic landmarks and headings, a skip link, visible
focus rings, a focus-trapped mobile menu that Escape closes, an
`aria-live` confirmation for "copy email", 44 px touch targets, and AA
contrast for body text.

**Fonts** are self-hosted through `next/font/local`, which preloads them and
generates metric-matched fallbacks, so text doesn't jump when they arrive.
Nothing on the page depends on a third-party CDN.
