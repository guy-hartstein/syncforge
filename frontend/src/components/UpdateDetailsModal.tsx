import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  GitBranch,
  GitPullRequest,
  AlertCircle,
  CheckCircle,
  Loader2,
  FileText,
  Clock,
} from 'lucide-react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { startAgents, syncAgents } from '../api/agents'
import { fetchSettings } from '../api/settings'
import { IntegrationAgentPanel } from './IntegrationAgentPanel'
import type { Update } from '../api/updates'

interface UpdateDetailsModalProps {
  update: Update
  isOpen: boolean
  onClose: () => void
}

const statusConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  pending: { icon: Clock, color: 'text-text-muted', bgColor: 'bg-surface-hover' },
  in_progress: { icon: Loader2, color: 'text-blue-400', bgColor: 'bg-blue-400/10' },
  needs_review: { icon: AlertCircle, color: 'text-amber-400', bgColor: 'bg-amber-400/10' },
  ready_to_merge: { icon: GitPullRequest, color: 'text-green-400', bgColor: 'bg-green-400/10' },
  skipped: { icon: X, color: 'text-text-muted', bgColor: 'bg-surface-hover' },
  complete: { icon: CheckCircle, color: 'text-green-400', bgColor: 'bg-green-400/10' },
}

export function UpdateDetailsModal({ update, isOpen, onClose }: UpdateDetailsModalProps) {
  const [expandedIntegration, setExpandedIntegration] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  })

  const hasApiKey = settings?.has_cursor_api_key

  const startAgentsMutation = useMutation({
    mutationFn: () => startAgents(update.id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
      alert(`Started ${result.started} agents`)
    },
    onError: (error: Error) => {
      alert(error.message)
    },
  })

  const syncMutation = useMutation({
    mutationFn: () => syncAgents(update.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
  })

  // Auto-refresh when agents are running
  useEffect(() => {
    if (!isOpen) return

    const hasRunningAgents = update.integration_statuses.some(
      (s) => s.status === 'in_progress' && s.cursor_agent_id
    )

    if (hasRunningAgents) {
      const interval = setInterval(() => {
        syncMutation.mutate()
      }, 10000)

      return () => clearInterval(interval)
    }
  }, [isOpen, update.integration_statuses])

  const toggleIntegration = (integrationId: string) => {
    setExpandedIntegration((prev) => (prev === integrationId ? null : integrationId))
  }

  // Count statuses
  const statusCounts = update.integration_statuses.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const hasAgentsStarted = update.integration_statuses.some((s) => s.cursor_agent_id)
  const canStartAgents =
    update.status === 'in_progress' &&
    hasApiKey &&
    update.integration_statuses.some((s) => s.status === 'pending' && !s.cursor_agent_id)

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-5xl max-h-[85vh] bg-background border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-text-primary truncate">{update.title}</h2>
                  <p className="text-xs text-text-muted">
                    {new Date(update.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {hasAgentsStarted && (
                    <button
                      onClick={() => syncMutation.mutate()}
                      disabled={syncMutation.isPending}
                      className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
                    >
                      <RefreshCw
                        size={18}
                        className={syncMutation.isPending ? 'animate-spin' : ''}
                      />
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Status Summary */}
              <div className="px-6 py-3 border-b border-border bg-surface/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {Object.entries(statusCounts).map(([status, count]) => {
                    const config = statusConfig[status]
                    if (!config) return null
                    const Icon = config.icon
                    return (
                      <div
                        key={status}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${config.bgColor}`}
                      >
                        <Icon
                          size={12}
                          className={`${config.color} ${
                            status === 'in_progress' ? 'animate-spin' : ''
                          }`}
                        />
                        <span className={`text-xs font-medium ${config.color}`}>{count}</span>
                      </div>
                    )
                  })}
                </div>
                {canStartAgents && (
                  <button
                    onClick={() => startAgentsMutation.mutate()}
                    disabled={startAgentsMutation.isPending}
                    className="btn-primary text-sm flex items-center gap-2"
                  >
                    {startAgentsMutation.isPending ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <Play size={14} />
                        Start Agents
                      </>
                    )}
                  </button>
                )}
                {!hasApiKey && (
                  <span className="text-xs text-amber-400">
                    Configure Cursor API key in Settings to start agents
                  </span>
                )}
              </div>

              {/* Integrations List */}
              <div className="flex-1 overflow-y-auto">
                {update.integration_statuses.map((integration) => {
                  const config = statusConfig[integration.status] || statusConfig.pending
                  const Icon = config.icon
                  const isExpanded = expandedIntegration === integration.integration_id

                  return (
                    <div
                      key={integration.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <button
                        onClick={() => toggleIntegration(integration.integration_id)}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-surface/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown size={16} className="text-text-muted" />
                          ) : (
                            <ChevronRight size={16} className="text-text-muted" />
                          )}
                          <span className="font-medium text-text-primary">
                            {integration.integration_name || 'Unknown'}
                          </span>
                          {integration.agent_question && (
                            <AlertCircle size={14} className="text-amber-400" />
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {integration.pr_url && (
                            <a
                              href={integration.pr_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-green-400/10 text-green-400 hover:bg-green-400/20 transition-colors"
                            >
                              <GitPullRequest size={12} />
                              PR
                            </a>
                          )}
                          {integration.cursor_agent_id && !integration.pr_url && (
                            <a
                              href={`https://cursor.com/agents?selectedBcId=${integration.cursor_agent_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
                            >
                              <GitBranch size={12} />
                              {integration.cursor_branch_name || 'View Agent'}
                            </a>
                          )}
                          <div
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${config.bgColor}`}
                          >
                            <Icon
                              size={12}
                              className={`${config.color} ${
                                integration.status === 'in_progress' ? 'animate-spin' : ''
                              }`}
                            />
                            <span className={`text-xs font-medium ${config.color}`}>
                              {integration.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <IntegrationAgentPanel
                            updateId={update.id}
                            integration={integration}
                          />
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>

              {/* Footer with Implementation Guide */}
              {update.implementation_guide && (
                <div className="px-6 py-3 border-t border-border bg-surface">
                  <details className="group">
                    <summary className="flex items-center gap-2 cursor-pointer text-sm text-text-secondary hover:text-text-primary transition-colors">
                      <FileText size={14} />
                      <span>View Implementation Guide</span>
                      <ChevronRight
                        size={14}
                        className="group-open:rotate-90 transition-transform"
                      />
                    </summary>
                    <div className="mt-3 p-3 bg-background rounded-lg border border-border max-h-48 overflow-y-auto">
                      <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono">
                        {update.implementation_guide}
                      </pre>
                    </div>
                  </details>
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

