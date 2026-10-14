import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { SYNC_LABELS, type CloudSync, type SyncStatus } from '../hooks/useCloudSync'
import { BottomSheet } from './BottomSheet'
import { Button, Field, TextInput } from './ui'

/** Ícone + texto do status, para o cartão de entrada. */
export function SyncIcon({ status }: { status: SyncStatus }) {
  if (status === 'off') return <CloudOff size={20} />
  if (status === 'syncing') return <RefreshCw size={20} className="animate-spin" />
  return <Cloud size={20} />
}

export function SyncSheet({ sync, open, onClose }: { sync: CloudSync; open: boolean; onClose: () => void }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const label = SYNC_LABELS[sync.status]

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setConnecting(true)
    setError('')
    const result = await sync.connect(key.trim())
    setConnecting(false)
    if (result === 'ok') {
      setKey('')
      onClose()
    } else {
      setError(result === 'unauthorized' ? 'Chave incorreta.' : 'Não foi possível falar com o servidor. Verifique a conexão.')
    }
  }

  return (
    <BottomSheet open={open} title="Sincronização" onClose={onClose}>
      <p className={`mb-4 text-sm font-semibold ${label.tone}`}>{label.text}</p>

      {sync.enabled && sync.status !== 'unauthorized' ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-400">
            Seus treinos e histórico ficam salvos na nuvem e aparecem em qualquer aparelho conectado com a mesma chave.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={sync.syncNow}>
              <RefreshCw size={17} /> Sincronizar agora
            </Button>
            <Button variant="danger" onClick={sync.disconnect}>
              Desconectar
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-ink-400">
            Digite a chave de sincronização para salvar seus dados na nuvem. Se já houver dados salvos de outro aparelho, eles
            substituem os deste.
          </p>
          <Field label="Chave de sincronização">
            <TextInput
              type="password"
              autoComplete="current-password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Cole a chave aqui"
            />
          </Field>
          {error && <p className="text-sm font-semibold text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={!key.trim() || connecting}>
            {connecting ? 'Conectando…' : 'Conectar'}
          </Button>
        </form>
      )}
    </BottomSheet>
  )
}
