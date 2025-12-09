import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import type { Toast } from './ToastContext'

interface ToastContainerProps {
  toasts: Toast[]
  onRemove: (id: string) => void
}

const toastConfig = {
  success: {
    icon: CheckCircle,
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    iconColor: 'text-emerald-400',
    progressColor: 'bg-emerald-400',
  },
  error: {
    icon: XCircle,
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    iconColor: 'text-red-400',
    progressColor: 'bg-red-400',
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    iconColor: 'text-amber-400',
    progressColor: 'bg-amber-400',
  },
  info: {
    icon: Info,
    bgColor: 'bg-accent/10',
    borderColor: 'border-accent/30',
    iconColor: 'text-accent',
    progressColor: 'bg-accent',
  },
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const config = toastConfig[toast.type]
  const Icon = config.icon
  const duration = toast.duration ?? 4000

  useEffect(() => {
    const timer = setTimeout(onRemove, duration)
    return () => clearTimeout(timer)
  }, [duration, onRemove])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`relative flex items-start gap-3 w-80 px-4 py-3 rounded-xl border backdrop-blur-md shadow-lg ${config.bgColor} ${config.borderColor}`}
    >
      <Icon size={18} className={`flex-shrink-0 mt-0.5 ${config.iconColor}`} />
      <p className="flex-1 text-sm text-text-primary leading-relaxed">{toast.message}</p>
      <button
        onClick={onRemove}
        className="flex-shrink-0 p-1 rounded-md hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
      >
        <X size={14} />
      </button>
      
      {/* Progress bar */}
      <motion.div
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: duration / 1000, ease: 'linear' }}
        className={`absolute bottom-0 left-0 right-0 h-0.5 origin-left rounded-b-xl ${config.progressColor}`}
      />
    </motion.div>
  )
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={() => onRemove(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  )
}

