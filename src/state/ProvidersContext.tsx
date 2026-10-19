import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ProviderMode, ProvidersResponse } from '../../shared/aiSchemas'
import { fetchProviders } from '../ai/client'
import { useData } from './DataContext'

interface ProvidersApi {
  apiReachable: boolean | null
  providers: ProvidersResponse['providers']
  refresh: () => Promise<void>
  hermesReady: boolean
  geminiReady: boolean
  /** What will actually run for the selected mode, given what is configured. */
  effective: { documentation: 'hermes' | 'gemini' | 'local'; audit: 'gemini' | 'local-rules' }
  fallbackActive: boolean
}

const Ctx = createContext<ProvidersApi | null>(null)

export function ProvidersProvider({ children }: { children: ReactNode }) {
  const { snap } = useData()
  const [apiReachable, setReachable] = useState<boolean | null>(null)
  const [providers, setProviders] = useState<ProvidersResponse['providers']>([])

  const refresh = useCallback(async () => {
    const r = await fetchProviders()
    setReachable(!!r)
    setProviders(r?.providers ?? [])
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 30000)
    return () => window.clearInterval(id)
  }, [refresh])

  const mode: ProviderMode = snap?.settings.providerMode ?? 'hybrid'
  const hermesReady = !!providers.find((p) => p.id === 'hermes')?.configured
  const geminiReady = !!providers.find((p) => p.id === 'gemini')?.configured

  const effective = useMemo(() => {
    const documentation: 'hermes' | 'gemini' | 'local' =
      (mode === 'hybrid' || mode === 'hermes') && hermesReady ? 'hermes' : mode === 'gemini' && geminiReady ? 'gemini' : 'local'
    const audit: 'gemini' | 'local-rules' = (mode === 'hybrid' || mode === 'gemini') && geminiReady ? 'gemini' : 'local-rules'
    return { documentation, audit }
  }, [mode, hermesReady, geminiReady])

  const fallbackActive =
    mode !== 'local' && (effective.documentation === 'local' || ((mode === 'hybrid' || mode === 'gemini') && effective.audit === 'local-rules'))

  const value = useMemo(
    () => ({ apiReachable, providers, refresh, hermesReady, geminiReady, effective, fallbackActive }),
    [apiReachable, providers, refresh, hermesReady, geminiReady, effective, fallbackActive],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useProviders() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useProviders outside ProvidersProvider')
  return v
}
