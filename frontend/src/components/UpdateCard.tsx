import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ChevronDown, 
  ChevronUp, 
  Loader2, 
  Check, 
  AlertCircle, 
  GitPullRequest,
  GitMerge,
  SkipForward,
  Clock,
  Trash2,
  ExternalLink
} from 'lucide-react'
import { UpdateDetailsModal } from './UpdateDetailsModal'
import type { Update, UpdateIntegrationStatus } from '../api/updates'

interface UpdateCardProps {
  update: Update
  onDelete: (id: string) => void
  index: number
}

const statusConfig: Record<UpdateIntegrationStatus['status'], { 
  icon: React.ReactNode
  color: string
  bgColor: string
  label: string 
}> = {
  pending: {
    icon: <Clock size={12} />,
    color: 'text-text-muted',
    bgColor: 'bg-text-muted/10',
    label: 'Pending'
  },
  in_progress: {
    icon: <Loader2 size={12} className="animate-spin" />,
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    label: 'In Progress'
  },
  needs_review: {
    icon: <AlertCircle size={12} />,
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10',
    label: 'Needs Review'
  },
  ready_to_merge: {
    icon: <GitPullRequest size={12} />,
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
    label: 'Ready to Merge'
  },
  skipped: {
    icon: <SkipForward size={12} />,
    color: 'text-text-muted',
    bgColor: 'bg-text-muted/10',
    label: 'Skipped'
  },
  complete: {
    icon: <Check size={12} />,
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
    label: 'Complete'
  },
  cancelled: {
    icon: <SkipForward size={12} />,
    color: 'text-red-400',
    bgColor: 'bg-red-400/10',
    label: 'Cancelled'
  }
}

export function UpdateCard({ update, onDelete, index }: UpdateCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null)
  
  const integrationStatuses = update.integration_statuses || []
  const completedCount = integrationStatuses.filter(
    s => s.status === 'complete' || s.status === 'skipped' || s.status === 'ready_to_merge'
  ).length
  const totalCount = integrationStatuses.length
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0
  
  const isCreating = update.status === 'creating'
  const isInProgress = update.status === 'in_progress'
  const hasIssues = integrationStatuses.some(s => s.status === 'needs_review')
  const hasAgents = integrationStatuses.some(s => s.cursor_agent_id)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="card"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isCreating ? (
              <>
                <Loader2 size={16} className="text-accent animate-spin flex-shrink-0" />
                <h3 className="font-semibold text-text-muted truncate">Creating update...</h3>
              </>
            ) : (
              <h3 className="font-semibold text-text-primary truncate">{update.title}</h3>
            )}
            {hasIssues && !isCreating && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400">
                <AlertCircle size={10} />
                Needs Review
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted">
            {new Date(update.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        </div>
        <button
          onClick={() => onDelete(update.id)}
          className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-text-secondary">
            {isCreating ? 'Generating update details...' : `${completedCount} of ${totalCount} integrations`}
          </span>
          <span className={isCreating ? 'text-accent' : isInProgress ? 'text-blue-400' : 'text-green-400'}>
            {isCreating ? 'Creating' : isInProgress ? 'In Progress' : 'Completed'}
          </span>
        </div>
        <div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
          {isCreating ? (
            <div className="h-full w-full bg-gradient-to-r from-accent/20 via-accent to-accent/20 animate-pulse" />
          ) : (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className={`h-full rounded-full ${isInProgress ? 'bg-blue-400' : 'bg-green-400'}`}
            />
          )}
        </div>
      </div>

      {/* Integration chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {integrationStatuses.slice(0, isExpanded ? undefined : 3).map((status) => {
          const config = statusConfig[status.status]
          return (
            <div
              key={status.id}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ${config.bgColor} ${config.color}`}
              title={`${status.integration_name}: ${config.label}`}
            >
              {config.icon}
              <span className="truncate max-w-[100px]">{status.integration_name}</span>
            </div>
          )
        })}
        {!isExpanded && integrationStatuses.length > 3 && (
          <span className="text-xs text-text-muted px-2 py-1">
            +{integrationStatuses.length - 3} more
          </span>
        )}
      </div>

      {/* Expand/Collapse and Open Details buttons */}
      <div className="flex items-center justify-between">
        {integrationStatuses.length > 0 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors py-1"
          >
            {isExpanded ? (
              <>
                <ChevronUp size={14} />
                Show less
              </>
            ) : (
              <>
                <ChevronDown size={14} />
                Show details
              </>
            )}
          </button>
        )}
        {!isCreating && (
          <button
            onClick={() => {
              setSelectedIntegrationId(null)
              setIsDetailsOpen(true)
            }}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors py-1"
          >
            <ExternalLink size={14} />
            {hasAgents ? 'View Agents' : 'Manage'}
          </button>
        )}
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-3 mt-3 border-t border-border space-y-2">
              {integrationStatuses.map((status) => {
                const config = statusConfig[status.status]
                return (
                  <button
                    key={status.id}
                    onClick={() => {
                      setSelectedIntegrationId(status.integration_id)
                      setIsDetailsOpen(true)
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-surface-hover/50 hover:bg-surface-hover transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`p-1 rounded ${config.bgColor}`}>
                        <span className={config.color}>{config.icon}</span>
                      </div>
                      <span className="text-sm text-text-primary truncate">
                        {status.integration_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${config.color}`}>{config.label}</span>
                      {status.pr_url && (
                        <a
                          href={status.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className={status.status === 'complete' ? 'text-purple-400 hover:text-purple-300' : 'text-accent hover:text-accent-hover'}
                          title={status.status === 'complete' ? 'Merged' : 'View PR'}
                        >
                          {status.status === 'complete' ? <GitMerge size={14} /> : <GitPullRequest size={14} />}
                        </a>
                      )}
                    </div>
                  </button>
                )
              })}
              
              {/* Agent question if needs review */}
              {integrationStatuses.some(s => s.status === 'needs_review' && s.agent_question) && (
                <div className="mt-3 p-3 rounded-lg bg-amber-400/5 border border-amber-400/20">
                  <p className="text-xs font-medium text-amber-400 mb-1">Agent Question:</p>
                  <p className="text-sm text-text-secondary">
                    {integrationStatuses.find(s => s.agent_question)?.agent_question}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Details Modal */}
      <UpdateDetailsModal
        update={update}
        isOpen={isDetailsOpen}
        onClose={() => {
          setIsDetailsOpen(false)
          setSelectedIntegrationId(null)
        }}
        initialExpandedIntegration={selectedIntegrationId}
      />
    </motion.div>
  )
}

