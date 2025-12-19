import {
  GitPullRequest,
  GitPullRequestClosed,
  GitMerge,
  GitBranch,
  StopCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react'
import { ManualControlsMenu } from './ManualControlsMenu'
import type { UpdateIntegrationStatus } from '../../api/updates'

interface StatusConfigItem {
  icon: React.ElementType
  color: string
  bgColor: string
  label: string
}

interface IntegrationHeaderProps {
  updateId: string
  integration: UpdateIntegrationStatus
  statusConfig: Record<string, StatusConfigItem>
  hasPlan: boolean
  onTogglePlan: () => void
  showDiff: boolean
  onToggleDiff: () => void
  onRefreshPR: () => void
  isRefreshingPR: boolean
  onStop: () => void
  isStopping: boolean
}

export function IntegrationHeader({
  updateId,
  integration,
  statusConfig,
  hasPlan,
  onTogglePlan,
  showDiff,
  onToggleDiff,
  onRefreshPR,
  isRefreshingPR,
  onStop,
  isStopping,
}: IntegrationHeaderProps) {
  const config = statusConfig[integration.status] || statusConfig.pending
  const StatusIcon = config.icon

  return (
    <div className="px-6 py-3 border-b border-border bg-surface/30 flex items-center justify-between gap-4">
      {/* Left: Name + Status */}
      <div className="flex items-center gap-3 min-w-0">
        <h3 className="font-semibold text-text-primary truncate">
          {integration.integration_name || 'Unknown'}
        </h3>
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded flex-shrink-0 ${config.bgColor}`}>
          <StatusIcon
            size={12}
            className={`${config.color} ${integration.status === 'in_progress' ? 'animate-spin' : ''}`}
          />
          <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
        </div>
      </div>

      {/* Right: Branch/PR + Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Branch or PR link */}
        {integration.pr_url ? (
          <a
            href={integration.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors ${
              integration.pr_merged
                ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
                : integration.pr_closed
                  ? 'bg-red-400/10 text-red-400 hover:bg-red-400/20'
                  : 'bg-green-400/10 text-green-400 hover:bg-green-400/20'
            }`}
          >
            {integration.pr_merged ? (
              <GitMerge size={12} />
            ) : integration.pr_closed ? (
              <GitPullRequestClosed size={12} />
            ) : (
              <GitPullRequest size={12} />
            )}
            <span>PR</span>
          </a>
        ) : integration.cursor_branch_name && integration.github_url ? (
          <a
            href={`${integration.github_url}/tree/${integration.cursor_branch_name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
          >
            <GitBranch size={12} />
            <span className="max-w-24 truncate">{integration.cursor_branch_name}</span>
          </a>
        ) : null}

        {/* Plan toggle */}
        {hasPlan && (
          <button
            onClick={onTogglePlan}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors text-xs"
          >
            <FileText size={12} />
            <span>Plan</span>
          </button>
        )}

        {/* Manual Controls Menu */}
        <ManualControlsMenu updateId={updateId} integration={integration} />

        {integration.cursor_agent_id && (
          <a
            href={`https://cursor.com/agents?selectedBcId=${integration.cursor_agent_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors text-xs"
            title="View in Cursor"
          >
            <img src="/cursor.png" alt="Cursor" className="w-3 h-3" />
            <span>Cursor</span>
          </a>
        )}

        {/* Show Diff button when PR exists */}
        {integration.pr_url && (
          <>
            {!integration.pr_merged && !integration.pr_closed && (
              <button
                onClick={onRefreshPR}
                disabled={isRefreshingPR}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors text-xs disabled:opacity-50"
                title="Refresh PR status"
              >
                <RefreshCw size={12} className={isRefreshingPR ? 'animate-spin' : ''} />
                <span>Sync</span>
              </button>
            )}
            <button
              onClick={onToggleDiff}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors text-xs"
            >
              {showDiff ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              <span>Diff</span>
            </button>
          </>
        )}

        {integration.status === 'in_progress' && integration.cursor_agent_id && (
          <button
            onClick={onStop}
            disabled={isStopping}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors"
          >
            <StopCircle size={12} />
            Stop
          </button>
        )}
      </div>
    </div>
  )
}

