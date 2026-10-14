import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { AuthError, ConflictError, pullState, pushState, readMeta, readSyncKey, writeMeta, writeSyncKey, type Remote, type SyncMeta } from '../sync'

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'offline' | 'unauthorized' | 'error'
export type ConnectResult = 'ok' | 'unauthorized' | 'error'

export const SYNC_LABELS: Record<SyncStatus, { text: string; tone: string }> = {
  off: { text: 'Desativada · dados só neste aparelho', tone: 'text-ink-400' },
  syncing: { text: 'Sincronizando…', tone: 'text-sky-400' },
  synced: { text: 'Sincronizado com a nuvem', tone: 'text-accent' },
  offline: { text: 'Sem conexão · envia quando voltar', tone: 'text-amber-400' },
  unauthorized: { text: 'Senha inválida · conecte de novo', tone: 'text-red-400' },
  error: { text: 'Erro ao sincronizar · tentando de novo depois', tone: 'text-red-400' },
}

/** Espera após a última alteração antes de enviar (agrupa edições em sequência). */
const PUSH_DELAY = 1000

/**
 * Sincroniza o estado com a nuvem (D1). O localStorage continua sendo o cache local,
 * então o app funciona offline e envia as alterações quando a conexão volta.
 *
 * Conflito (dois aparelhos editaram sem sincronizar): a versão do servidor prevalece
 * e `onReplaced` é chamado para avisar o usuário.
 */
export function useCloudSync<T>(
  state: T,
  setState: Dispatch<SetStateAction<T>>,
  parse: (raw: unknown) => T | null,
  onReplaced?: () => void,
) {
  const [key, setKey] = useState(readSyncKey)
  const [status, setStatus] = useState<SyncStatus>(key ? 'syncing' : 'off')
  const [initial] = useState(() => {
    const m = readMeta()
    return { meta: m, clean: m.dirty ? null : state }
  })

  const stateRef = useRef(state)
  const meta = useRef<SyncMeta>(initial.meta)
  /** Último estado que sabemos ser igual ao do servidor. */
  const clean = useRef<T | null>(initial.clean)
  const onReplacedRef = useRef(onReplaced)
  useEffect(() => {
    onReplacedRef.current = onReplaced
  })
  const busy = useRef(false)
  const again = useRef(false)

  const saveMeta = (next: SyncMeta | null) => {
    writeMeta(next)
    meta.current = next ?? readMeta()
  }

  const applyRemote = useCallback(
    (remote: Remote) => {
      const parsed = parse(remote.data)
      if (!parsed) throw new Error('Dados do servidor inválidos')
      clean.current = parsed
      stateRef.current = parsed
      saveMeta({ version: remote.version, dirty: false })
      setState(parsed)
    },
    [parse, setState],
  )

  const run = useCallback(
    async (k: string) => {
      if (busy.current) {
        again.current = true
        return
      }
      busy.current = true
      setStatus('syncing')
      try {
        if (meta.current.dirty) {
          const snapshot = stateRef.current
          try {
            const { version } = await pushState(k, snapshot, meta.current.version)
            const dirty = stateRef.current !== snapshot
            saveMeta({ version, dirty })
            if (dirty) again.current = true
            else clean.current = snapshot
          } catch (e) {
            if (!(e instanceof ConflictError)) throw e
            applyRemote(e.remote)
            onReplacedRef.current?.()
          }
        } else {
          const remote = await pullState(k)
          if (remote.data === null) {
            // Servidor vazio (ex.: banco recriado): reenvia o que temos.
            saveMeta(null)
            again.current = true
          } else if (remote.version !== meta.current.version) {
            applyRemote(remote)
          }
        }
        setStatus('synced')
      } catch (e) {
        setStatus(e instanceof AuthError ? 'unauthorized' : navigator.onLine ? 'error' : 'offline')
      } finally {
        busy.current = false
        if (again.current) {
          again.current = false
          void run(k)
        }
      }
    },
    [applyRemote],
  )

  // Alteração local: marca como pendente e envia depois de um tempo.
  useEffect(() => {
    stateRef.current = state
    if (state === clean.current) return
    if (!meta.current.dirty) saveMeta({ ...meta.current, dirty: true })
    if (!key) return
    const t = window.setTimeout(() => void run(key), PUSH_DELAY)
    return () => window.clearTimeout(t)
  }, [state, key, run])

  // Ao abrir, ao voltar para o app, ao sair dele com algo pendente e ao reconectar.
  useEffect(() => {
    if (!key) return
    void run(key)
    const onVisibility = () => {
      if (document.visibilityState === 'visible' || meta.current.dirty) void run(key)
    }
    const onOnline = () => void run(key)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [key, run])

  /** Valida a chave no servidor antes de salvar. */
  const connect = useCallback(async (newKey: string): Promise<ConnectResult> => {
    try {
      await pullState(newKey)
    } catch (e) {
      return e instanceof AuthError ? 'unauthorized' : 'error'
    }
    saveMeta(null)
    clean.current = null
    writeSyncKey(newKey)
    setStatus('syncing')
    setKey(newKey)
    return 'ok'
  }, [])

  /** Para de sincronizar neste aparelho. Os dados locais são mantidos. */
  const disconnect = useCallback(() => {
    writeSyncKey(null)
    saveMeta(null)
    clean.current = null
    setKey(null)
    setStatus('off')
  }, [])

  const syncNow = useCallback(() => {
    if (key) void run(key)
  }, [key, run])

  return { status, enabled: key !== null, connect, disconnect, syncNow }
}

export type CloudSync = ReturnType<typeof useCloudSync>
