import { BottomSheet } from './BottomSheet'
import { Button } from './ui'

type Props = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmar', danger = true, onConfirm, onClose }: Props) {
  return (
    <BottomSheet
      open={open}
      title={title}
      onClose={onClose}
      level={1}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={danger ? 'destructive' : 'primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-[15px] leading-relaxed text-ink-300">{message}</p>
    </BottomSheet>
  )
}
