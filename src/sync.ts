/** Cliente da API /api/state (Cloudflare Pages Function + D1). */

const KEY_STORAGE = 'gymduda:sync-key'
const META_STORAGE = 'gymduda:sync-meta'

export type Remote = { data: unknown; version: number }

/**
 * `version`: última versão do servidor que este aparelho conhece.
 * `dirty`: há alterações locais ainda não enviadas.
 * Começa "sujo" na versão 0: num servidor vazio os dados locais sobem;
 * se o servidor já tiver dados (outro aparelho), os do servidor prevalecem.
 */
export type SyncMeta = { version: number; dirty: boolean }

export class AuthError extends Error {}
export class ConflictError extends Error {
  readonly remote: Remote
  constructor(remote: Remote) {
    super('conflict')
    this.remote = remote
  }
}

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // modo privado / cota cheia
  }
}

export const readSyncKey = () => read(KEY_STORAGE)
export const writeSyncKey = (key: string | null) => write(KEY_STORAGE, key)

export function readMeta(): SyncMeta {
  try {
    const meta: unknown = JSON.parse(read(META_STORAGE) ?? 'null')
    if (meta && typeof meta === 'object' && 'version' in meta && 'dirty' in meta) {
      const { version, dirty } = meta
      if (typeof version === 'number' && typeof dirty === 'boolean') return { version, dirty }
    }
  } catch {
    // ignora meta corrompida
  }
  return { version: 0, dirty: true }
}

export const writeMeta = (meta: SyncMeta | null) => write(META_STORAGE, meta && JSON.stringify(meta))

async function request<T>(key: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api/state', {
    ...init,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    cache: 'no-store',
  })
  if (res.status === 401) throw new AuthError('Chave inválida')
  if (res.status === 409) throw new ConflictError(((await res.json()) as { remote: Remote }).remote)
  if (!res.ok) throw new Error(`Falha na sincronização (${res.status})`)
  return (await res.json()) as T
}

export const pullState = (key: string) => request<Remote>(key)

export const pushState = (key: string, data: unknown, baseVersion: number) =>
  request<{ version: number }>(key, { method: 'PUT', body: JSON.stringify({ data, baseVersion }) })
