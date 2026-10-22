import { isTodo, type Maybe } from '@/content/site'

export const isDev = process.env.NODE_ENV !== 'production'

/** The value as a string, or null while it is still a placeholder. */
export function filled<T>(value: Maybe<T> | undefined): T | null {
  return value === undefined || isTodo(value) ? null : value
}

/**
 * Renders a placeholder from site.ts. Visible only during `npm run dev`, so
 * missing details are easy to spot locally and never reach the live site.
 */
export function TodoNote({ value }: { value: Maybe<unknown> | undefined }) {
  if (!isDev || !isTodo(value)) return null
  return <span className="todo">todo · {value.todo}</span>
}
