import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../store'

/**
 * Rotating example commands, shown only while idle.
 *
 * A voice interface has no menus — nothing tells you what it can do. This is
 * the affordance. It disappears the moment MEDIQ is doing anything, so it
 * never competes with the answer.
 *
 * Each line is phrased the way you'd actually say it, not as a feature name.
 */
const EXAMPLES = [
  'show me the clinical dashboard',
  'which admitted patients are high risk',
  "open Daniel Okafor's chart",
  'any drug interactions for Margaret Chen',
  'which rooms are free in coronary care',
  'what are the side effects of ticagrelor',
  'differential for new hypoxia in Priya Raman',
  'dictate a note for Rahul Mehta',
  'tell Sofia Alvarez her X-ray is clear, in Spanish',
  'find patients allergic to penicillin',
]

const ROTATE_MS = 4200

export function Suggestions() {
  const phase = useStore((s) => s.phase)
  const turns = useStore((s) => s.turns)
  const [i, setI] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % EXAMPLES.length), ROTATE_MS)
    return () => clearInterval(id)
  }, [])

  // Only while genuinely idle, and only until the first exchange — once the
  // user knows how it works, the prompt is just clutter.
  if (phase !== 'dormant' || turns.length > 0) return null

  return (
    <div className="suggest">
      <span className="suggest-lead">try</span>
      <AnimatePresence mode="wait">
        <motion.span
          key={i}
          className="suggest-text"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.35 }}
        >
          “hey mediq, {EXAMPLES[i]}”
        </motion.span>
      </AnimatePresence>
    </div>
  )
}
