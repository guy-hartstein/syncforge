import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Play,
  RefreshCw,
  GitBranch,
  GitPullRequest,
  AlertCircle,
  CheckCircle,
  Loader2,
  FileText,
  ChevronRight,
  Clock,
  Layers,
  Share2,
} from 'lucide-react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { startAgents, syncAgents } from '../api/agents'
import { fetchSettings } from '../api/settings'
import { IntegrationAgentPanel } from './IntegrationAgentPanel'
import { useToast } from './Toast'
import type { Update } from '../api/updates'

interface UpdateDetailsModalProps {
  update: Update
  isOpen: boolean
  onClose: () => void
  initialExpandedIntegration?: string | null
}

const statusConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string; label: string }> = {
  pending: { icon: Clock, color: 'text-text-muted', bgColor: 'bg-surface-hover', label: 'Pending' },
  in_progress: { icon: Loader2, color: 'text-blue-400', bgColor: 'bg-blue-400/10', label: 'In Progress' },
  needs_review: { icon: AlertCircle, color: 'text-amber-400', bgColor: 'bg-amber-400/10', label: 'Needs Review' },
  ready_to_merge: { icon: GitPullRequest, color: 'text-green-400', bgColor: 'bg-green-400/10', label: 'Ready to Merge' },
  skipped: { icon: X, color: 'text-text-muted', bgColor: 'bg-surface-hover', label: 'Skipped' },
  complete: { icon: CheckCircle, color: 'text-green-400', bgColor: 'bg-green-400/10', label: 'Complete' },
}

export function UpdateDetailsModal({ update, isOpen, onClose, initialExpandedIntegration }: UpdateDetailsModalProps) {
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(initialExpandedIntegration ?? null)
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  })

  const hasApiKey = settings?.has_cursor_api_key

  const startAgentsMutation = useMutation({
    mutationFn: () => startAgents(update.id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
      toast.success(`Started ${result.started} agent${result.started !== 1 ? 's' : ''}`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const syncMutation = useMutation({
    mutationFn: () => syncAgents(update.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
  })

  // Set initial selection when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialExpandedIntegration) {
        setSelectedIntegration(initialExpandedIntegration)
      } else if (update.integration_statuses.length > 0 && !selectedIntegration) {
        // Auto-select first integration if none selected
        setSelectedIntegration(update.integration_statuses[0].integration_id)
      }
    }
  }, [isOpen, initialExpandedIntegration, update.integration_statuses])

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

  const selectedIntegrationData = update.integration_statuses.find(
    (s) => s.integration_id === selectedIntegration
  )

  const prUrls = update.integration_statuses
    .map((s) => s.pr_url)
    .filter((url): url is string => !!url)

  const handleCopyPRLinks = async () => {
    if (prUrls.length === 0) return
    try {
      await navigator.clipboard.writeText(prUrls.join('\n'))
      toast.success(`Copied ${prUrls.length} PR link${prUrls.length !== 1 ? 's' : ''} to clipboard`)
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }

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
              className="w-full max-w-5xl h-[85vh] bg-background border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
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
                  {prUrls.length > 0 && (
                    <button
                      onClick={handleCopyPRLinks}
                      className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
                      title={`Copy ${prUrls.length} PR link${prUrls.length !== 1 ? 's' : ''}`}
                    >
                      <Share2 size={18} />
                    </button>
                  )}
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

              {/* Status Summary Bar */}
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

              {/* Main Content - Sidebar + Content */}
              <div className="flex-1 flex overflow-hidden">
                {/* Left Sidebar - Integration List */}
                <div className="w-56 border-r border-border bg-surface/30 flex flex-col">
                  <div className="p-3 border-b border-border">
                    <div className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wide">
                      <Layers size={12} />
                      Integrations
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto py-2">
                    {update.integration_statuses.map((integration) => {
                      const config = statusConfig[integration.status] || statusConfig.pending
                      const Icon = config.icon
                      const isSelected = selectedIntegration === integration.integration_id

                      return (
                        <button
                          key={integration.id}
                          onClick={() => setSelectedIntegration(integration.integration_id)}
                          className={`w-full px-3 py-2.5 flex items-center gap-2 text-left transition-colors ${
                            isSelected
                              ? 'bg-accent/10 border-r-2 border-accent'
                              : 'hover:bg-surface-hover'
                          }`}
                        >
                          <Icon
                            size={14}
                            className={`flex-shrink-0 ${config.color} ${
                              integration.status === 'in_progress' ? 'animate-spin' : ''
                            }`}
                          />
                          <span
                            className={`text-sm truncate ${
                              isSelected ? 'text-text-primary font-medium' : 'text-text-secondary'
                            }`}
                          >
                            {integration.integration_name || 'Unknown'}
                          </span>
                          {integration.agent_question && (
                            <AlertCircle size={12} className="text-amber-400 flex-shrink-0 ml-auto" />
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {/* Implementation Guide in Sidebar Footer */}
                  {update.implementation_guide && (
                    <div className="p-3 border-t border-border">
                      <details className="group">
                        <summary className="flex items-center gap-2 cursor-pointer text-xs text-text-muted hover:text-text-secondary transition-colors">
                          <FileText size={12} />
                          <span>Implementation Guide</span>
                          <ChevronRight
                            size={12}
                            className="ml-auto group-open:rotate-90 transition-transform"
                          />
                        </summary>
                        <div className="mt-2 p-2 bg-background rounded-lg border border-border max-h-32 overflow-y-auto">
                          <pre className="text-[10px] text-text-muted whitespace-pre-wrap font-mono leading-relaxed">
                            {update.implementation_guide}
                          </pre>
                        </div>
                      </details>
                    </div>
                  )}
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {selectedIntegrationData ? (
                    <>
                      {/* Integration Header */}
                      <div className="px-6 py-4 border-b border-border bg-surface/30">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-text-primary">
                              {selectedIntegrationData.integration_name || 'Unknown'}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              {(() => {
                                const config = statusConfig[selectedIntegrationData.status] || statusConfig.pending
                                const Icon = config.icon
                                return (
                                  <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded ${config.bgColor}`}>
                                    <Icon
                                      size={12}
                                      className={`${config.color} ${
                                        selectedIntegrationData.status === 'in_progress' ? 'animate-spin' : ''
                                      }`}
                                    />
                                    <span className={`text-xs font-medium ${config.color}`}>
                                      {config.label}
                                    </span>
                                  </div>
                                )
                              })()}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {selectedIntegrationData.pr_url && (
                              <a
                                href={selectedIntegrationData.pr_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-green-400/10 text-green-400 hover:bg-green-400/20 transition-colors"
                              >
                                <GitPullRequest size={14} />
                                View PR
                              </a>
                            )}
                            {selectedIntegrationData.cursor_agent_id && !selectedIntegrationData.pr_url && (
                              <a
                                href={`https://cursor.com/agents?selectedBcId=${selectedIntegrationData.cursor_agent_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
                              >
                                <GitBranch size={14} />
                                {selectedIntegrationData.cursor_branch_name || 'View Agent'}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Integration Agent Panel */}
                      <div className="flex-1 overflow-y-auto">
                        <IntegrationAgentPanel
                          updateId={update.id}
                          integration={selectedIntegrationData}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-text-muted">
                      <div className="text-center">
                        <Layers size={48} className="mx-auto mb-4 opacity-30" />
                        <p>Select an integration to view details</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
