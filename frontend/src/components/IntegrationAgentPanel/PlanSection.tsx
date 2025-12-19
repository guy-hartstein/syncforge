import { FileText, X } from 'lucide-react'
import { MarkdownContent } from './MarkdownContent'

interface PlanSectionProps {
  planText: string
  onClose: () => void
}

export function PlanSection({ planText, onClose }: PlanSectionProps) {
  return (
    <div className="mb-6 bg-surface rounded-xl border border-border overflow-hidden">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-accent" />
          <span className="text-sm font-medium text-text-secondary">Update Plan</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
        >
          <X size={14} />
        </button>
      </div>
      <div className="p-4 max-h-72 overflow-y-auto markdown-content bg-background/30">
        <MarkdownContent content={planText} />
      </div>
    </div>
  )
}

