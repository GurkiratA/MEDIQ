import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MediqDatabase, type NewActivity, type Snapshot } from '../db/database'
import type { Settings } from '../db/schema'

interface DataApi {
  snap: Snapshot | null
  error: string | null
  /** Runs a repository operation, then reloads the snapshot. Errors propagate to the caller. */
  run: <T>(fn: (db: MediqDatabase) => Promise<T>) => Promise<T>
  log: (e: NewActivity) => Promise<void>
  saveSettings: (s: Settings) => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<DataApi | null>(null)

export function DataProvider({ children, dbName }: { children: ReactNode; dbName?: string }) {
  const dbRef = useRef<MediqDatabase | null>(null)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!dbRef.current) return
    setSnap(await dbRef.current.snapshot())
  }, [])

  useEffect(() => {
    let cancelled = false
    MediqDatabase.open(dbName)
      .then(async (db) => {
        if (cancelled) return db.close()
        dbRef.current = db
        setSnap(await db.snapshot())
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
      dbRef.current?.close()
      dbRef.current = null
    }
  }, [dbName])

  const run = useCallback(
    async <T,>(fn: (db: MediqDatabase) => Promise<T>) => {
      const db = dbRef.current
      if (!db) throw new Error('Local database is not ready.')
      try {
        return await fn(db)
      } finally {
        await refresh()
      }
    },
    [refresh],
  )

  const log = useCallback(
    async (e: NewActivity) => {
      try {
        await run((db) => db.log(e))
      } catch (err) {
        console.warn('[mediq] activity log write failed', err)
      }
    },
    [run],
  )

  const saveSettings = useCallback((s: Settings) => run((db) => db.saveSettings(s)), [run])

  const value = useMemo(() => ({ snap, error, run, log, saveSettings, refresh }), [snap, error, run, log, saveSettings, refresh])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData(): DataApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useData outside DataProvider')
  return v
}

/** Snapshot accessor for components rendered only after load. */
export function useSnap(): Snapshot {
  const { snap } = useData()
  if (!snap) throw new Error('Snapshot not loaded')
  return snap
}
