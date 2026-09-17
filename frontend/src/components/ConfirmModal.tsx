import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'default'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'warning',
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const iconBg =
    variant === 'danger'
      ? 'bg-red-100 dark:bg-red-900/40'
      : variant === 'warning'
        ? 'bg-amber-100 dark:bg-amber-900/40'
        : 'bg-blue-100 dark:bg-blue-900/40'

  const iconColor =
    variant === 'danger'
      ? 'text-red-600'
      : variant === 'warning'
        ? 'text-amber-600'
        : 'text-blue-600'

  const confirmBtn =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'btn-primary'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
            <AlertTriangle size={18} className={iconColor} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button className="btn-secondary text-sm" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button ref={confirmRef} className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors ${confirmBtn}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
