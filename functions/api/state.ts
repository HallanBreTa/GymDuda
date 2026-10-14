/**
 * GET /api/state → { data, version }   (data = null enquanto nada foi salvo)
 * PUT /api/state ← { data, baseVersion } → { version }
 *
 * O estado inteiro do app fica numa única linha do D1. `version` é um controle
 * otimista: o PUT só grava se o cliente partiu da versão atual; caso contrário
 * devolve 409 com o que está no servidor, para o cliente decidir.
 *
 * Acesso protegido pela chave secreta SYNC_KEY (Authorization: Bearer <chave>).
 */

type Env = {
  DB: D1Database
  SYNC_KEY?: string
}

type Row = { data: string; version: number }

const ROW_ID = 'main'
const MAX_BYTES = 1_500_000 // abaixo do limite de 2 MB por linha do D1

let schemaReady = false

async function ensureSchema(db: D1Database) {
  if (schemaReady) return
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS gym_state (id TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
    )
    .run()
  schemaReady = true
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/** Comparação em tempo constante para não vazar a chave por tempo de resposta. */
async function sameSecret(a: string, b: string) {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  return crypto.subtle.timingSafeEqual(ha, hb)
}

async function readRow(db: D1Database) {
  const row = await db.prepare('SELECT data, version FROM gym_state WHERE id = ?').bind(ROW_ID).first<Row>()
  return row ? { data: JSON.parse(row.data) as unknown, version: row.version } : { data: null, version: 0 }
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: 'Banco D1 não vinculado (binding DB).' }, 500)
  if (!env.SYNC_KEY) return json({ error: 'Variável SYNC_KEY não configurada.' }, 500)

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!token || !(await sameSecret(token, env.SYNC_KEY))) return json({ error: 'Chave inválida.' }, 401)

  await ensureSchema(env.DB)

  if (request.method === 'GET') return json(await readRow(env.DB))

  if (request.method === 'PUT') {
    const raw = await request.text()
    if (raw.length > MAX_BYTES) return json({ error: 'Dados grandes demais.' }, 413)

    let body: { data?: unknown; baseVersion?: unknown }
    try {
      body = JSON.parse(raw)
    } catch {
      return json({ error: 'JSON inválido.' }, 400)
    }
    const { data, baseVersion } = body
    if (!data || typeof data !== 'object' || typeof baseVersion !== 'number') return json({ error: 'Formato inválido.' }, 400)

    const now = Date.now()
    const serialized = JSON.stringify(data)
    const result =
      baseVersion === 0
        ? await env.DB.prepare(
            'INSERT INTO gym_state (id, data, version, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(id) DO NOTHING',
          )
            .bind(ROW_ID, serialized, now)
            .run()
        : await env.DB.prepare('UPDATE gym_state SET data = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?')
            .bind(serialized, now, ROW_ID, baseVersion)
            .run()

    if (result.meta.changes === 0) return json({ error: 'conflict', remote: await readRow(env.DB) }, 409)
    return json({ version: baseVersion + 1 })
  }

  return json({ error: 'Método não suportado.' }, 405)
}
