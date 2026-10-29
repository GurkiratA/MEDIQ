/**
 * Everything personal on the site lives in this file.
 *
 * Edit text, links, projects and skills here; components only read from it.
 * Anything wrapped in `todo('…')` is a placeholder: it is shown as a dashed
 * note while running `npm run dev` and hidden on the production build, so the
 * live site never displays an unfinished sentence. Replace `todo('…')` with a
 * plain string (or URL) once you have the real value.
 *
 * Ground rule for this file: only write what can be verified — in a repo, in
 * a project's own documentation, or by you.
 */

export type Todo = { readonly todo: string }
export type Maybe<T> = T | Todo

/** Marks a value that still needs your input. */
export const todo = (note: string): Todo => ({ todo: note })
export const isTodo = (value: unknown): value is Todo =>
  typeof value === 'object' && value !== null && 'todo' in value

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const profile = {
  name: 'Krish Shah',
  initials: 'KS',
  role: 'Computer Science student & aspiring software engineer',
  school: 'University of Guelph',
  field: 'Computer Science',

  /** The hero headline. Keep it to one sentence. */
  headline: 'I build software around a real problem, then make it show its working.',
  intro:
    'I’m a Computer Science student at the University of Guelph. I spend my time on projects that have to hold up to a question — how much water does a rain garden actually catch, what should an assistant be allowed to write to a patient chart — and I care about the parts that make a tool trustworthy: clear assumptions, tests and honest limits.',

  about: {
    lead: 'I like problems that are easy to state and hard to get right.',
    body: [
      'Most of what I’ve worked on so far started at hackathons or in small collaborations. That has taught me as much about scoping, splitting work and explaining a design as about any one language or framework.',
      'The projects keep circling the same idea: software people can check. A solver that shows the formula and steps, not just a number. An assistant that drafts but never saves without a person confirming. A simulator that accounts for every litre of rain it was given.',
      'Right now I’m working on fundamentals — data structures, testing, reading other people’s code well — and on finishing projects properly rather than just starting them.',
    ],
  },
}

// ---------------------------------------------------------------------------
// Links — real destinations only. A todo() link is simply not rendered.
// ---------------------------------------------------------------------------

export const links = {
  github: 'https://github.com/KRISH-01-code' as Maybe<string>,
  linkedin: todo('Add your LinkedIn URL, e.g. https://www.linkedin.com/in/your-handle') as Maybe<string>,
  /** From your Git commit history — change it if you prefer another inbox. */
  email: 'krishmshah1117@gmail.com' as Maybe<string>,
  /** Put the PDF at public/resume.pdf and set this to '/resume.pdf'. */
  resume: todo('Add public/resume.pdf, then set this to "/resume.pdf"') as Maybe<string>,
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type Figure = {
  src: string
  alt: string
  width: number
  height: number
  caption: string
}

export type Step = { label: string; detail: string; gate?: boolean }
export type Note = { title: string; body: string }

export type Project = {
  slug: string
  name: string
  /** One line for the index and cards. */
  summary: string
  year: string
  kind: string
  /** Home-page treatment: lead (large), split (diagram beside text), brief (compact). */
  layout: 'lead' | 'split' | 'brief'
  /** The project's colour: used for its figure mats, numbering and case-study header. */
  tone: 'clay' | 'teal' | 'plum' | 'cobalt'
  role: Maybe<string>
  /** Credit teammates and owners plainly. */
  credit?: string
  stack: string[]
  links: { label: string; href: Maybe<string> }[]
  cover?: Figure
  /** Architecture drawn as a flow diagram; `gate` marks a human approval step. */
  architecture: Step[]

  /** Case study (rendered at /work/<slug>/). Every field is optional except problem. */
  problem: string
  constraints?: string[]
  approach?: string
  features?: string[]
  decisions?: Note[]
  challenges?: Maybe<Note[]>
  limitations?: string[]
  next?: Maybe<string[]>
  lessons?: Maybe<string[]>
  gallery?: Figure[]
  /** Where the facts on the page come from. */
  sources?: { label: string; href: string }[]
}

const RUNOFFLAB_SRC = 'https://github.com/rishikrrontala-bot/runofflab/tree/source'

export const projects: Project[] = [
  {
    slug: 'runofflab',
    name: 'RunoffLab',
    summary:
      'A rainfall experiment on real LiDAR terrain: place rain gardens, replay the same storm, and compare where the water goes.',
    year: '2026',
    kind: 'Hackathon · Stormwater modelling',
    layout: 'lead',
    tone: 'clay',
    role: todo(
      'Describe your role on RunoffLab. The public repo and its contribution record credit Rishik Rontala — state exactly what you contributed.',
    ),
    credit: 'Team project. Public repository and contribution record by Rishik Rontala.',
    stack: ['TypeScript', 'React', 'Three.js', 'Vite', 'Web Workers', 'Vitest', 'Playwright', 'Python'],
    links: [
      { label: 'Live app', href: 'https://rishikrrontala-bot.github.io/runofflab/' },
      { label: 'Source code', href: RUNOFFLAB_SRC },
    ],
    cover: {
      src: '/projects/runofflab-compare.webp',
      alt: 'RunoffLab comparing two runs of the same storm on 3D aerial terrain of Mercer County Park: a baseline on the left and a run with three rain gardens on the right, with storm controls, garden toggles and results panels around them.',
      width: 1600,
      height: 1000,
      caption: 'Same storm, two designs. Baseline on the left; three lawn gardens (G7, G11, G12) on the right.',
    },
    architecture: [
      { label: 'Terrain', detail: 'NJ LiDAR DEM, 4 m grid' },
      { label: 'Storm', detail: 'intensity, duration, drain time' },
      { label: 'Solver', detail: 'local inertial, in a Web Worker' },
      { label: 'Gardens', detail: 'storage + infiltration' },
      { label: 'Accounting', detail: 'water balance per run' },
    ],

    problem:
      'Rain gardens and other green infrastructure are usually argued for before anyone can see how water actually moves across a specific site. RunoffLab narrows that to a question a browser can answer: on one real park, how does ponding on a paved target change if a few gardens are added and the exact same storm is replayed?',
    constraints: [
      'One prepared site — Mercer County Park, New Jersey — on public 2014–2019 LiDAR, so results are local and reproducible rather than general.',
      'It has to run in an ordinary browser, on a phone too, with no account or backend.',
      'Every number on screen must come from the simulator, and every litre of rain needs a destination.',
      'It is an experiment with stated assumptions, not a flood forecast or engineering design.',
    ],
    approach:
      'Run a baseline storm, select legal lawn gardens within an area budget, then rerun the identical storm and scrub both histories at the same simulated second. A greedy search can propose a placement by trying every feasible garden with the real simulator and keeping the one that lowers the peak most.',
    features: [
      'Same-storm comparison of a baseline and a garden design, side by side in 3D or on a flat map',
      'Water accounting table: rain, surface water, soil, gardens, boundary outflow, lake and residual',
      'Greedy placement search that runs in the worker, reports progress and can be cancelled',
      'Scenario export and import as JSON, so an experiment can be reproduced',
      'Keyboard-operable garden toggles, a 2D fallback without WebGL and reduced-motion support',
    ],
    decisions: [
      {
        title: 'A faster solver, checked against a slower one',
        body: 'The shipped solver uses the local inertial approximation of the shallow-water equations. On the default storm it matched an independent diffusive-wave formulation to within 0.21% on baseline ponding while running about 100× faster (0.67 s against 67 s).',
      },
      {
        title: 'Simulating beyond the site boundary',
        body: 'Testing showed the 256 m study site under-counted ponding at one target by about 18%, because runoff entered from up to 32 m past its edge. The computed domain was enlarged to 384 m, which matches a 512 m domain to within 0.0005%.',
      },
      {
        title: 'Conservation as a hard check',
        body: 'Across the 24 recorded evidence runs, the largest relative water-balance residual is 9.1 × 10⁻¹¹ — the accounting identity is something the app verifies, not assumes.',
      },
      {
        title: 'Measuring total ponded volume',
        body: 'An earlier objective counted water above a 2 cm threshold and moved 15% with grid resolution; total ponded volume is steadier, so it became the headline metric.',
      },
    ],
    challenges: todo('Optional: a challenge you personally worked through on RunoffLab, in your own words.'),
    limitations: [
      'Curbs, inlets, pipes and culverts are not represented, and no field measurements validate the output.',
      'Infiltration, soil storage and roughness are uniform user assumptions; rainfall is constant intensity.',
      'Gardens are idealised basins — the ground is never reshaped — and “eligible lawn” is a classification from a 2015 aerial, not a soil survey.',
      'On the default storm, the best three-garden designs reduce modelled peak ponding by about 4–13% depending on the target. That is a modelled effect, not evidence of avoided flooding.',
      'A trained planner model was explored; on held-out terrain it performed about level with a simple downhill heuristic, and greedy simulator search beat both. The public site only shows recorded, clearly labelled model answers.',
    ],
    next: todo('Optional: what you would build or test next on RunoffLab.'),
    lessons: todo('Optional: one or two things RunoffLab taught you.'),
    gallery: [
      {
        src: '/projects/runofflab-chart.webp',
        alt: 'Line chart of ponded water in the target over 30 simulated minutes. The baseline (dashed) peaks at about 23.5 cubic metres; the run with gardens (solid red) stays slightly lower throughout.',
        width: 1200,
        height: 468,
        caption: 'Ponded water in the target over the 30-minute run: baseline dashed, with gardens solid.',
      },
      {
        src: '/projects/runofflab-accounting.webp',
        alt: 'Water accounting table comparing baseline and gardens: rain input 2,931.5 cubic metres in both, surface water, soil, water held in gardens (0 against 8.3), boundary outflow, into lake, and a residual of 0.00000.',
        width: 540,
        height: 860,
        caption: 'Every destination for the rain, with a residual of zero.',
      },
    ],
    sources: [
      { label: 'RunoffLab source branch', href: RUNOFFLAB_SRC },
      { label: 'EVIDENCE.md', href: 'https://github.com/rishikrrontala-bot/runofflab/blob/source/EVIDENCE.md' },
      { label: 'LIMITATIONS.md', href: 'https://github.com/rishikrrontala-bot/runofflab/blob/source/LIMITATIONS.md' },
    ],
  },
  {
    slug: 'mediq',
    name: 'MEDIQ',
    summary:
      'A voice-first clinical assistant prototype that can read and draft, but never saves a change without a clinician confirming it.',
    year: '2026',
    kind: 'Hackathon · Healthcare',
    layout: 'split',
    tone: 'teal',
    role: todo('Describe what you built on MEDIQ — features, the dashboard, the clinical data model, the pitch.'),
    credit: 'Hackathon team project, with Agamjyot Singh Anand. Repository by GurkiratA.',
    stack: ['TypeScript', 'React', 'Vite', 'Three.js', 'Node.js', 'WebSockets', 'Claude Agent SDK', 'Zod', 'Zustand', 'MediaPipe'],
    links: [{ label: 'Source code', href: 'https://github.com/GurkiratA/MEDIQ' }],
    architecture: [
      { label: 'Voice or text', detail: 'wake word, speech-to-text, command bar' },
      { label: 'Browser', detail: 'React dashboard, Three.js interface' },
      { label: 'Local bridge', detail: 'Node, WebSocket, Claude Agent SDK' },
      { label: 'Proposal', detail: 'SOAP note, prescription, room move' },
      { label: 'Clinician confirms', detail: 'role check, then audit log', gate: true },
    ],

    problem:
      'Clinicians lose time to charting and hunting through records, but an assistant that can write directly into a patient chart is a liability. MEDIQ explores a hands-free assistant that can read freely and draft carefully, while every change stays a human decision.',
    constraints: [
      'Built in a hackathon, so the scope had to fit a demo.',
      'Demonstration data only: ten fictional patients, sixteen rooms, twenty-eight drugs and five staff accounts, stored outside the repository.',
      'It is a prototype for decision support, not a medical device, and not ready for real patient data.',
    ],
    approach:
      'Split the system in two. The browser is the face and voice; a local Node bridge runs Claude through the Claude Agent SDK and exposes the clinical tools. The model can read the records and propose changes, but proposals land in a review queue, and only a signed-in clinician pressing Confirm writes them.',
    features: [
      'Patient search, charts, a rooms board and a medication reference',
      'Drug-interaction and allergy screening on every prescription draft',
      'Dictated SOAP notes and visit summaries, drafted for review',
      'Role-based permissions for doctors, nurses and admins, checked again at confirmation',
      'An audit log of confirmed changes',
      'Everything also reachable without voice, through the command bar, tabs and search',
    ],
    decisions: [
      {
        title: 'The model proposes; a person commits',
        body: 'There is no tool the model can call to save its own draft. The confirm action arrives over the WebSocket from the dashboard, so the click — not the model — is the authoritative gate.',
      },
      {
        title: 'Permissions checked at the moment of saving',
        body: 'Role checks run again when a change is confirmed, against whoever is signed in, rather than trusting the role at the time the draft was made.',
      },
      {
        title: 'Read-only by default',
        body: 'The bridge starts with effectful tools denied and has to be started in a separate mode to allow them — a decision made ahead of time, because voice is a poor interface for confirmation dialogs.',
      },
    ],
    challenges: todo('Optional: a challenge you hit during the hackathon and how the team handled it.'),
    limitations: [
      'Needs a local Claude Code login to run the assistant; the public repository is not a hosted demo.',
      'All data is fictional, and a real deployment would need regulatory clearance, secure hosting and real authentication.',
    ],
    next: todo('Optional: what you would build next on MEDIQ.'),
    lessons: todo('Lessons learned on MEDIQ, in your own words.'),
    sources: [{ label: 'MEDIQ repository and README', href: 'https://github.com/GurkiratA/MEDIQ' }],
  },
  {
    slug: 'discrete-solver',
    name: 'DiscreteSolver',
    summary: 'Type a combinatorics word problem; get the operation, the formula and the answer.',
    year: '2026',
    kind: 'Collaboration · Machine learning',
    layout: 'brief',
    tone: 'plum',
    role: 'Co-developer — dataset curation and testing.',
    credit: 'Built with Soumya Patel.',
    stack: ['Python', 'Flask', 'scikit-learn', 'pytest', 'KaTeX', 'Docker', 'GitHub Actions'],
    links: [{ label: 'Source code', href: 'https://github.com/KRISH-01-code/discrete_solver' }],
    cover: {
      src: '/projects/discrete-solver.webp',
      alt: 'DiscreteSolver result: the question is classified as Combinations, with n equal to 10, r equal to 3, the formula n factorial over r factorial times n minus r factorial, and the answer 10 choose 3 equals 120.',
      width: 1440,
      height: 840,
      caption: '“A committee of 3 from 10 people” → Combinations → 120.',
    },
    architecture: [
      { label: 'Word problem', detail: 'free text' },
      { label: 'Parser', detail: 'regex extracts n and r' },
      { label: 'Classifier', detail: 'TF-IDF + linear SVC' },
      { label: 'Math engine', detail: 'exact integer result' },
      { label: 'KaTeX', detail: 'formula and working' },
    ],

    problem:
      'Combinatorics word problems are easy to misread — does order matter, is repetition allowed, is it a circle? DiscreteSolver classifies the problem first, then shows the formula and working so the answer can be checked.',
    approach:
      'A Flask app combines a TF-IDF + linear SVC classifier, trained on a labelled dataset of word problems, with a regex parser that extracts n and r (including number words like “five”). The question is routed to one of six operations and the result is rendered with KaTeX.',
    features: [
      'Six operations: permutations and combinations (with and without replacement), derangements and circular arrangements',
      'pytest suite for the math engine, solver service and Flask routes, run in GitHub Actions',
      'Dockerfile and Compose setup for one-command local runs',
    ],
    limitations: [
      'Classification depends on the training phrasing; unusual wording can be routed to the wrong operation.',
    ],
    sources: [{ label: 'DiscreteSolver repository and README', href: 'https://github.com/KRISH-01-code/discrete_solver' }],
  },
]

// ---------------------------------------------------------------------------
// Skills — each one names the projects where it was used. Leave `usedIn`
// empty for things from coursework or self-study.
// ---------------------------------------------------------------------------

export type Skill = { name: string; usedIn: string[] }
export type SkillGroup = { title: string; items: Skill[] }

export const skills: SkillGroup[] = [
  {
    title: 'Languages',
    items: [
      { name: 'Python', usedIn: ['discrete-solver'] },
      { name: 'TypeScript', usedIn: ['mediq', 'runofflab'] },
      { name: 'JavaScript', usedIn: ['mediq', 'discrete-solver'] },
      { name: 'HTML & CSS', usedIn: ['mediq', 'discrete-solver'] },
    ],
  },
  {
    title: 'Frameworks & libraries',
    items: [
      { name: 'React', usedIn: ['mediq', 'runofflab'] },
      { name: 'Flask', usedIn: ['discrete-solver'] },
      { name: 'scikit-learn', usedIn: ['discrete-solver'] },
      { name: 'Node.js', usedIn: ['mediq'] },
      { name: 'Three.js', usedIn: ['mediq', 'runofflab'] },
    ],
  },
  {
    title: 'Tools',
    items: [
      { name: 'Git & GitHub', usedIn: ['mediq', 'discrete-solver'] },
      { name: 'pytest', usedIn: ['discrete-solver'] },
      { name: 'GitHub Actions', usedIn: ['discrete-solver'] },
      { name: 'Docker', usedIn: ['discrete-solver'] },
      { name: 'Vite', usedIn: ['mediq', 'runofflab'] },
    ],
  },
  {
    title: 'Concepts',
    items: [
      { name: 'Text classification', usedIn: ['discrete-solver'] },
      { name: 'Automated testing & CI', usedIn: ['discrete-solver'] },
      { name: 'Human-in-the-loop design', usedIn: ['mediq'] },
      { name: 'Client–server over WebSockets', usedIn: ['mediq'] },
    ],
  },
]

// ---------------------------------------------------------------------------
// Education, experience & achievements — newest first. Only verified entries.
// ---------------------------------------------------------------------------

export type Entry = {
  period: Maybe<string>
  title: string
  place: Maybe<string>
  detail: Maybe<string>
  tag: 'Education' | 'Hackathon' | 'Project' | 'Experience' | 'Award'
  href?: string
}

export const record: Entry[] = [
  {
    period: todo('Program years, e.g. 2025 — 2029'),
    title: 'Computer Science',
    place: 'University of Guelph',
    detail: todo('Degree name (e.g. Bachelor of Computing) and, optionally, courses or clubs — only if true'),
    tag: 'Education',
  },
  {
    period: '2026',
    title: 'MEDIQ',
    place: todo('Name of the hackathon'),
    detail: 'Voice-first clinical assistant prototype with a human-confirmation gate.',
    tag: 'Hackathon',
    href: '/work/mediq/',
  },
  {
    period: '2026',
    title: 'DiscreteSolver',
    place: 'With Soumya Patel',
    detail: 'Dataset curation and testing for an ML-backed combinatorics solver.',
    tag: 'Project',
    href: '/work/discrete-solver/',
  },
]

// ---------------------------------------------------------------------------
// Navigation — ids must match the section ids on the home page.
// ---------------------------------------------------------------------------

export const sections = [
  { id: 'work', label: 'Work' },
  { id: 'about', label: 'About' },
  { id: 'skills', label: 'Skills' },
  { id: 'education', label: 'Education' },
  { id: 'contact', label: 'Contact' },
] as const

// ---------------------------------------------------------------------------
// Site metadata
// ---------------------------------------------------------------------------

export const site = {
  /**
   * Deployed URL for canonical links and social previews. Set
   * NEXT_PUBLIC_SITE_URL when you have a domain; on Vercel the production URL
   * is picked up automatically.
   */
  url:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3000'),
  title: 'Krish Shah — Computer Science, University of Guelph',
  description:
    'Portfolio of Krish Shah, a Computer Science student at the University of Guelph who builds software people can check: a stormwater experiment, a clinical assistant prototype and an ML-backed math solver.',
}

export const projectBySlug = (slug: string) => projects.find((p) => p.slug === slug)
