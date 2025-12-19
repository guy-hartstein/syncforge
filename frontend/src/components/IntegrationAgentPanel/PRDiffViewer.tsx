import { Loader2, Plus, Minus } from 'lucide-react'
import type { GitHubPRDetails } from '../../api/github'

interface PRDiffViewerProps {
  prDetails: GitHubPRDetails | null
  loading: boolean
}

export function PRDiffViewer({ prDetails, loading }: PRDiffViewerProps) {
  return (
    <div className="mb-6 bg-surface rounded-xl border border-border overflow-hidden">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="text-sm font-medium text-text-secondary">Pull Request Diff</span>
        {prDetails && (
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-green-400">
              <Plus size={12} />
              {prDetails.additions}
            </span>
            <span className="flex items-center gap-1 text-red-400">
              <Minus size={12} />
              {prDetails.deletions}
            </span>
            <span className="text-text-muted">
              {prDetails.changed_files} file{prDetails.changed_files !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
      <div className="max-h-96 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        ) : prDetails?.diff ? (
          <pre className="p-4 text-xs font-mono leading-relaxed overflow-x-auto">
            {prDetails.diff.split('\n').map((line, i) => {
              let className = 'text-text-secondary'
              if (line.startsWith('+') && !line.startsWith('+++')) {
                className = 'text-green-400 bg-green-400/10'
              } else if (line.startsWith('-') && !line.startsWith('---')) {
                className = 'text-red-400 bg-red-400/10'
              } else if (line.startsWith('@@')) {
                className = 'text-blue-400 bg-blue-400/10'
              } else if (line.startsWith('diff --git') || line.startsWith('index ')) {
                className = 'text-text-muted'
              }
              return (
                <div key={i} className={`${className} px-2 -mx-2`}>
                  {line || ' '}
                </div>
              )
            })}
          </pre>
        ) : (
          <p className="text-sm text-text-muted text-center py-4">Failed to load diff</p>
        )}
      </div>
    </div>
  )
}

