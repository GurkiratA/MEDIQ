/**
 * Everything personal on the site lives in this file.
 *
 * Edit text, links, projects and skills here; the components only read from
 * it. Anything wrapped in `todo('…')` is a placeholder: it is hidden on the
 * production build and shown as a dashed amber note while running `npm run dev`,
 * so the live site never displays an unfinished sentence and you can still
 * see what is left to fill in. Replace `todo('…')` with a plain string (or a
 * URL) once you have the real value.
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
  firstName: 'Krish',
  lastName: 'Shah',
  initials: 'KS',
  role: 'Computer Science student & aspiring software engineer',
  school: 'University of Guelph',
  location: 'Guelph, Ontario',
  /** Guelph, ON — used by the hero's coordinate readout. */
  coordinates: '43.54°N 80.25°W',
  /** Short status line under the navigation. Set to null to hide it. */
  status: 'Looking for software engineering internships' as string | null,

  headline: 'I like building software that shows its work.',
  intro:
    'I’m a Computer Science student at the University of Guelph. I like building things — hackathon projects, small tools, experiments — and I care most about the part where the software has to be right, not just look right.',

  about: [
    'I got into programming because I liked the moment a vague problem turns into something you can actually run. That still hasn’t worn off.',
    'Most of what I build starts with a question I can’t answer by hand: which kind of counting problem is this? What does a clinician need to see before anything gets written to a chart?',
    'The projects I’ve worked on keep circling the same idea: software people can check. A solver that shows the formula and the steps, not just a number. A clinical assistant that can draft changes but never save them without a person confirming. A simulator that accounts for where every litre of water goes.',
    'Right now I’m focused on getting better at the fundamentals — data structures, testing, reading other people’s code — and on shipping more complete projects. I learn fastest by building, breaking and fixing things, so I’m always looking for teams and problems that let me do more of that.',
  ],

  /** Short "now" list in the About section. Keep these honest and current. */
  now: [
    'Studying Computer Science at the University of Guelph',
    'Building projects at hackathons and on my own time',
    'Learning to write code that is tested, readable and easy to hand over',
  ],
}

// ---------------------------------------------------------------------------
// Links — use real destinations only. Leave a todo() until you have one.
// ---------------------------------------------------------------------------

export const links = {
  github: 'https://github.com/KRISH-01-code' as Maybe<string>,
  linkedin: todo('Add your LinkedIn URL, e.g. https://www.linkedin.com/in/your-handle') as Maybe<string>,
  /** Taken from your Git commit history — change it if you prefer another inbox. */
  email: 'krishmshah1117@gmail.com' as Maybe<string>,
  /**
   * Put your PDF at public/resume.pdf and change this to '/resume.pdf'.
   * While it is a todo, the "Résumé" buttons are hidden.
   */
  resume: todo('Add public/resume.pdf, then set this to "/resume.pdf"') as Maybe<string>,
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type ProjectLayout = 'feature' | 'split' | 'compact'

/** `gate: true` marks the step a person has to approve — drawn in the accent colour. */
export type PipelineStep = { label: string; detail: string; gate?: boolean }

export type Project = {
  slug: string
  name: string
  /** One line, shown in the index and as the card lede. */
  tagline: string
  year: string
  kind: string
  /** feature = full-width showcase · split = diagram beside text · compact = smaller row */
  layout: ProjectLayout
  problem: string
  description: string
  /** Your own role and contributions. Be specific; leave a todo() if unsure. */
  role: Maybe<string>
  /** Shown verbatim under the project — use it to credit teammates and owners. */
  credit?: string
  highlights: string[]
  /** Technologies verified against the project's code. */
  stack: string[]
  /** How the system is put together, rendered as a flow diagram. */
  pipeline: PipelineStep[]
  image?: { src: string; alt: string; width: number; height: number; caption: string }
  links: { label: string; href: Maybe<string> }[]
}

export const projects: Project[] = [
  {
    slug: 'runofflab',
    name: 'RunoffLab',
    tagline: 'A rain experiment on real terrain: place rain gardens, rerun the same storm, compare.',
    year: '2026',
    kind: 'Hackathon · Environmental modelling',
    layout: 'feature',
    problem:
      'Green infrastructure like rain gardens is usually planned before anyone can see how water will actually move across a site. RunoffLab asks a narrower, testable question: on one real park, how does ponding change if you add a few gardens and replay the exact same storm?',
    description:
      'A browser-based experiment built on public New Jersey LiDAR terrain at Mercer County Park. You set a hypothetical storm, run a baseline, place 16 × 16 m rain gardens on lawn, and repeat the storm to compare computed ponding on a target area. A water balance tracks rainfall, surface water, soil, garden storage, edge outflow and drainage into the lake, so every litre has a destination.',
    role: todo('Describe your role on RunoffLab. The public repo credits Rishik Rontala — say what you contributed (team member, research, testing, design, demo…).'),
    credit: 'Team project · public repository and contribution record by Rishik Rontala.',
    highlights: [
      'Local inertial shallow-water solver running in a Web Worker, so the interface stays responsive during a run',
      'Same-storm comparison: baseline and garden scenarios are replayed side by side at the same simulated second',
      'A full water balance instead of a single headline number',
      '3D terrain view in Three.js, with a flat 2D map for phones and as a WebGL fallback',
      'Assumptions and limitations stated in the interface: an experiment, not a flood forecast',
    ],
    stack: ['TypeScript', 'React', 'Three.js', 'Vite', 'Web Workers', 'Vitest', 'Playwright'],
    pipeline: [
      { label: 'LiDAR terrain', detail: 'NJ 10 ft DEM → 4 m grid' },
      { label: 'Storm', detail: 'intensity · duration · drainage' },
      { label: 'Solver', detail: 'local inertial, in a worker' },
      { label: 'Gardens', detail: 'storage + infiltration' },
      { label: 'Water balance', detail: 'every transfer accounted for' },
    ],
    image: {
      src: '/projects/runofflab.webp',
      alt: 'RunoffLab interface after a baseline run: storm controls on the left, a 3D aerial terrain model of Mercer County Park with simulated water depth in blue in the centre, and the computed peak ponded water of 23.5 cubic metres on the right.',
      width: 1600,
      height: 1000,
      caption: 'Baseline run · 60 mm/h for 20 min · captured from the published build',
    },
    links: [
      { label: 'Live app', href: 'https://rishikrrontala-bot.github.io/runofflab/' },
      { label: 'Source', href: 'https://github.com/rishikrrontala-bot/runofflab/tree/source' },
    ],
  },
  {
    slug: 'mediq',
    name: 'MEDIQ',
    tagline: 'A voice-first clinical assistant that can draft changes but never save them on its own.',
    year: '2026',
    kind: 'Hackathon · Healthcare',
    layout: 'split',
    problem:
      'Clinicians lose time to charting and to hunting through records, and an AI that can write straight into a patient chart is a liability. MEDIQ explores a hands-free assistant that reads freely, drafts carefully, and leaves every decision with a person.',
    description:
      'Say “Hey MEDIQ” (or type) to search patients, open charts, check drug interactions and allergies, or dictate SOAP notes. The browser handles wake word, speech and a Three.js interface; a local Node bridge runs Claude through the Claude Agent SDK. The model can only propose record changes — they land in a review queue and are written only when a signed-in clinician presses Confirm, with role checks and an audit trail. All patient data is fictional.',
    role: todo('Describe what you built on MEDIQ (e.g. which features, the dashboard, the clinical tools, the pitch).'),
    credit: 'Hackathon team project · repository by GurkiratA, with Agamjyot Singh Anand.',
    highlights: [
      'Human-in-the-loop by design: the model proposes, a clinician confirms — there is no tool call that saves its own draft',
      'Role-based permissions (doctor, nurse, admin) re-checked at the moment of confirmation',
      'Drug-interaction and allergy screening on every prescription draft',
      'Works without voice: command bar, tabs and search reach every feature',
      'Hand-gesture control and multilingual text-to-speech',
    ],
    stack: ['TypeScript', 'React', 'Vite', 'Three.js', 'Node.js', 'WebSockets', 'Claude Agent SDK', 'Zustand', 'MediaPipe'],
    pipeline: [
      { label: 'Voice / text', detail: 'wake word · VAD · speech-to-text' },
      { label: 'Browser UI', detail: 'React + Three.js dashboard' },
      { label: 'Node bridge', detail: 'WebSocket · Claude Agent SDK' },
      { label: 'Proposal', detail: 'SOAP note, Rx, room move' },
      { label: 'Clinician confirms', detail: 'role check · audit log', gate: true },
    ],
    links: [{ label: 'Repository', href: 'https://github.com/GurkiratA/MEDIQ' }],
  },
  {
    slug: 'discrete-solver',
    name: 'DiscreteSolver',
    tagline: 'Type a combinatorics word problem; get the operation, the formula and the answer.',
    year: '2026',
    kind: 'Collaboration · Machine learning',
    layout: 'compact',
    problem:
      'Combinatorics word problems are easy to misread — is order important, is repetition allowed, is it a circle? DiscreteSolver classifies the problem first, then shows the formula and working so the answer can be checked.',
    description:
      'A Flask web app that combines a TF-IDF + linear SVC classifier with a regex entity parser. It extracts n and r (including number words like “five”), routes the question to one of six operations — permutations, combinations, both with replacement, derangements and circular arrangements — and renders the formula and result with KaTeX.',
    role: 'Co-developer — dataset curation and testing.',
    credit: 'Built with Soumya Patel.',
    highlights: [
      'Six combinatorial operations behind a single natural-language input',
      'Labelled dataset of word problems used to train the classifier',
      'pytest suite covering the math engine, solver service and Flask routes, run in GitHub Actions CI',
      'Dockerfile and Compose setup for one-command local runs',
    ],
    stack: ['Python', 'Flask', 'scikit-learn', 'pytest', 'KaTeX', 'Docker', 'GitHub Actions'],
    pipeline: [
      { label: 'Word problem', detail: 'free text' },
      { label: 'Regex parser', detail: 'extracts n, r' },
      { label: 'SVC classifier', detail: 'TF-IDF features' },
      { label: 'Math engine', detail: 'exact integer result' },
      { label: 'KaTeX', detail: 'formula + working' },
    ],
    image: {
      src: '/projects/discrete-solver.webp',
      alt: 'DiscreteSolver result card classifying a committee question as Combinations, with n equal to 10, r equal to 3, the formula n factorial over r factorial times n minus r factorial, and the answer 10 choose 3 equals 120.',
      width: 1440,
      height: 840,
      caption: '“A committee of 3 from 10 people” → Combinations → 120',
    },
    links: [{ label: 'Repository', href: 'https://github.com/KRISH-01-code/discrete_solver' }],
  },
]

// ---------------------------------------------------------------------------
// Skills — each one points at the projects where it was actually used.
// Add a skill by adding a line; `usedIn` takes project slugs (or leave it empty
// for coursework / self-study).
// ---------------------------------------------------------------------------

export type Skill = { name: string; usedIn: string[] }
export type SkillGroup = { title: string; note: string; items: Skill[] }

export const skills: SkillGroup[] = [
  {
    title: 'Languages',
    note: 'What I write code in',
    items: [
      { name: 'Python', usedIn: ['discrete-solver'] },
      { name: 'TypeScript', usedIn: ['mediq', 'runofflab'] },
      { name: 'JavaScript', usedIn: ['mediq', 'discrete-solver'] },
      { name: 'HTML & CSS', usedIn: ['mediq', 'discrete-solver'] },
    ],
  },
  {
    title: 'Frameworks & libraries',
    note: 'What I’ve built on',
    items: [
      { name: 'React', usedIn: ['mediq', 'runofflab'] },
      { name: 'Flask', usedIn: ['discrete-solver'] },
      { name: 'scikit-learn', usedIn: ['discrete-solver'] },
      { name: 'Node.js', usedIn: ['mediq'] },
      { name: 'Three.js', usedIn: ['mediq', 'runofflab'] },
    ],
  },
  {
    title: 'Tools & practice',
    note: 'How the work gets shipped',
    items: [
      { name: 'Git & GitHub', usedIn: ['mediq', 'discrete-solver'] },
      { name: 'pytest', usedIn: ['discrete-solver'] },
      { name: 'GitHub Actions', usedIn: ['discrete-solver'] },
      { name: 'Docker', usedIn: ['discrete-solver'] },
      { name: 'Vite', usedIn: ['mediq', 'runofflab'] },
    ],
  },
  {
    title: 'Interested in',
    note: 'Where I want to go deeper',
    items: [
      { name: 'Software that people can verify', usedIn: [] },
      { name: 'Applied machine learning', usedIn: [] },
      { name: 'Tools for healthcare & the environment', usedIn: [] },
    ],
  },
]

// ---------------------------------------------------------------------------
// Education, experience & achievements — newest first.
// Only add entries you can back up. `detail` may be a todo().
// ---------------------------------------------------------------------------

export type TimelineEntry = {
  period: Maybe<string>
  title: string
  place: Maybe<string>
  detail: Maybe<string>
  tag: 'Education' | 'Hackathon' | 'Project' | 'Experience' | 'Award'
}

export const timeline: TimelineEntry[] = [
  {
    period: todo('Add your program years, e.g. 2025 — 2029'),
    title: 'Computer Science',
    place: 'University of Guelph',
    detail: todo('Add your degree (e.g. Bachelor of Computing) and, optionally, courses or clubs — only if true'),
    tag: 'Education',
  },
  {
    period: '2026',
    title: 'MEDIQ',
    place: todo('Add the hackathon name'),
    detail: 'Voice-first clinical assistant with a human-confirmation gate, built with a hackathon team.',
    tag: 'Hackathon',
  },
  {
    period: '2026',
    title: 'DiscreteSolver',
    place: 'Collaboration with Soumya Patel',
    detail: 'Dataset curation and testing for an ML-backed combinatorics solver.',
    tag: 'Project',
  },
]

// ---------------------------------------------------------------------------
// Navigation — ids must match the section ids on the page.
// ---------------------------------------------------------------------------

export const sections = [
  { id: 'work', label: 'Work' },
  { id: 'about', label: 'About' },
  { id: 'skills', label: 'Skills' },
  { id: 'path', label: 'Path' },
  { id: 'contact', label: 'Contact' },
] as const

// ---------------------------------------------------------------------------
// Site metadata
// ---------------------------------------------------------------------------

export const site = {
  /**
   * Your deployed URL, used for canonical links and social previews. Set
   * NEXT_PUBLIC_SITE_URL (e.g. https://krishshah.dev) when you have a domain;
   * on Vercel the production URL is picked up automatically.
   */
  url:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3000'),
  title: 'Krish Shah — Software, shown working',
  description:
    'Krish Shah is a Computer Science student at the University of Guelph who builds software people can check: a clinical assistant, a rainfall simulator and an ML-backed math solver.',
}
