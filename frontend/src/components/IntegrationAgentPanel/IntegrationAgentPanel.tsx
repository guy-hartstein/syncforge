import { useState, useEffect } from 'react'
import { GitPullRequest, AlertCircle } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sendFollowup, stopAgent, updateIntegrationSettings, refreshConversation } from '../../api/agents'
import {
  checkBranchStatus,
  getPullRequestDetails,
  getIntegrationPRStatus,
  refreshPRStatus,
  parsePrUrl,
  type GitHubPRDetails,
} from '../../api/github'
import type { UpdateIntegrationStatus, ConversationMessage } from '../../api/updates'
import { IntegrationHeader } from './IntegrationHeader'
import { PRDiffViewer } from './PRDiffViewer'
import { PlanSection } from './PlanSection'
import { ConversationPanel } from './ConversationPanel'

interface StatusConfigItem {
  icon: React.ElementType
  color: string
  bgColor: string
  label: string
}

interface IntegrationAgentPanelProps {
  updateId: string
  integration: UpdateIntegrationStatus
  statusConfig: Record<string, StatusConfigItem>
}

export function IntegrationAgentPanel({
  updateId,
  integration,
  statusConfig,
}: IntegrationAgentPanelProps) {
  const [message, setMessage] = useState('')
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [showPlan, setShowPlan] = useState(false)
  const [branchCreated, setBranchCreated] = useState(false)
  const [lastCommitSha, setLastCommitSha] = useState<string | null>(null)
  const [waitingForUpdate, setWaitingForUpdate] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [prDetails, setPrDetails] = useState<GitHubPRDetails | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const queryClient = useQueryClient()

  // Combine server conversation with pending message for display
  const serverMessages = integration.conversation || []
  const messages: ConversationMessage[] = pendingMessage
    ? [...serverMessages, { id: 'pending', type: 'user_message', text: pendingMessage }]
    : serverMessages

  // Extract the plan (first user message) and filter it from displayed messages
  const planMessage = messages.find((msg) => msg.type === 'user_message')
  const displayMessages = messages.filter((msg) => msg !== planMessage)

  // Clear pending message once it appears in server data
  useEffect(() => {
    if (pendingMessage && serverMessages.some((m) => m.type === 'user_message' && m.text === pendingMessage)) {
      setPendingMessage(null)
    }
    // Clear waiting state when new messages arrive
    if (waitingForUpdate && serverMessages.length > 0) {
      const lastMsg = serverMessages[serverMessages.length - 1]
      if (lastMsg?.type === 'assistant_message') {
        setWaitingForUpdate(false)
        setLastCommitSha(null)
      }
    }
  }, [serverMessages, pendingMessage, waitingForUpdate])

  // Poll PR status while PR is open (backup mechanism - primary update comes from server-side polling)
  useEffect(() => {
    if (!integration.pr_url || integration.pr_merged) return
    if (['cancelled', 'skipped', 'complete'].includes(integration.status)) return

    const checkPRStatus = async () => {
      try {
        const status = await getIntegrationPRStatus(updateId, integration.integration_id)
        if (status.merged) {
          queryClient.invalidateQueries({ queryKey: ['updates'] })
        }
      } catch (e) {
        console.error('Failed to check PR status:', e)
      }
    }

    const interval = setInterval(checkPRStatus, 120000)
    return () => clearInterval(interval)
  }, [updateId, integration.integration_id, integration.pr_url, integration.pr_merged, integration.status, queryClient])

  // Poll branch for PR discovery (backup - primary updates come from webhooks via server)
  useEffect(() => {
    if (integration.pr_url || !integration.cursor_branch_name) return
    if (['complete', 'cancelled', 'skipped', 'ready_to_merge'].includes(integration.status)) return

    const checkBranch = async () => {
      try {
        const status = await checkBranchStatus(updateId, integration.integration_id)
        if (status.branch_exists && !branchCreated) {
          setBranchCreated(true)
        }
        if (status.pr_url) {
          queryClient.invalidateQueries({ queryKey: ['updates'] })
        }
        if (waitingForUpdate && lastCommitSha && status.last_commit_sha !== lastCommitSha) {
          setWaitingForUpdate(false)
          setLastCommitSha(null)
          queryClient.invalidateQueries({ queryKey: ['updates'] })
        }
      } catch (e) {
        console.error('Failed to check branch:', e)
      }
    }

    checkBranch()
    const interval = setInterval(checkBranch, 30000)
    return () => clearInterval(interval)
  }, [
    updateId,
    integration.integration_id,
    integration.pr_url,
    integration.cursor_branch_name,
    integration.status,
    branchCreated,
    waitingForUpdate,
    lastCommitSha,
    queryClient,
  ])

  // Fetch PR details when diff is toggled on
  useEffect(() => {
    if (!showDiff || !integration.pr_url || prDetails) return

    const parsed = parsePrUrl(integration.pr_url)
    if (!parsed) return

    setDiffLoading(true)
    getPullRequestDetails(parsed.owner, parsed.repo, parsed.prNumber)
      .then(setPrDetails)
      .catch(console.error)
      .finally(() => setDiffLoading(false))
  }, [showDiff, integration.pr_url, prDetails])

  // Reset PR details when PR URL changes
  useEffect(() => {
    setPrDetails(null)
  }, [integration.pr_url])

  const followupMutation = useMutation({
    mutationFn: (text: string) => sendFollowup(updateId, integration.integration_id, text),
    onSuccess: async () => {
      setPendingMessage(message)
      setMessage('')
      setWaitingForUpdate(true)

      try {
        const status = await checkBranchStatus(updateId, integration.integration_id)
        if (status.last_commit_sha) {
          setLastCommitSha(status.last_commit_sha)
        }
      } catch (e) {
        console.error('Failed to get commit SHA:', e)
      }
      queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
  })

  const stopMutation = useMutation({
    mutationFn: () => stopAgent(updateId, integration.integration_id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['updates'] }),
  })

  const autoCreatePrMutation = useMutation({
    mutationFn: (autoCreatePr: boolean) =>
      updateIntegrationSettings(updateId, integration.integration_id, autoCreatePr),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['updates'] }),
  })

  const refreshPrMutation = useMutation({
    mutationFn: () => refreshPRStatus(updateId, integration.integration_id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['updates'] }),
  })

  const refreshConversationMutation = useMutation({
    mutationFn: () => refreshConversation(updateId, integration.integration_id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['updates'] }),
  })

  const handleSend = () => {
    if (!message.trim()) return
    followupMutation.mutate(message.trim())
  }

  const showConversationInput =
    (integration.status === 'in_progress' ||
      integration.status === 'needs_review' ||
      integration.status === 'ready_to_merge' ||
      integration.agent_question) &&
    integration.cursor_agent_id

  return (
    <div className="flex flex-col h-full">
      <IntegrationHeader
        updateId={updateId}
        integration={integration}
        statusConfig={statusConfig}
        hasPlan={!!planMessage}
        onTogglePlan={() => setShowPlan(!showPlan)}
        showDiff={showDiff}
        onToggleDiff={() => setShowDiff(!showDiff)}
        onRefreshPR={() => refreshPrMutation.mutate()}
        isRefreshingPR={refreshPrMutation.isPending}
        onStop={() => stopMutation.mutate()}
        isStopping={stopMutation.isPending}
      />

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* PR Diff Viewer */}
        {showDiff && integration.pr_url && <PRDiffViewer prDetails={prDetails} loading={diffLoading} />}

        {/* Auto Create PR Toggle - only show if agent not started yet */}
        {integration.status === 'pending' && (
          <div className="mb-6 p-4 rounded-xl bg-surface border border-border">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <GitPullRequest size={14} className="text-text-muted" />
                <span className="text-sm text-text-secondary">Auto Create PR</span>
              </div>
              <div
                onClick={() => autoCreatePrMutation.mutate(!(integration.auto_create_pr ?? false))}
                className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
                  integration.auto_create_pr ? 'bg-accent' : 'bg-surface-hover'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    integration.auto_create_pr ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </div>
            </label>
          </div>
        )}

        {/* Agent Question */}
        {integration.agent_question && (
          <div className="mb-6 p-4 rounded-xl bg-amber-400/10 border border-amber-400/20">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-400 mb-1">Agent Question</p>
                <p className="text-sm text-text-secondary">{integration.agent_question}</p>
              </div>
            </div>
          </div>
        )}

        {/* Plan Section */}
        {showPlan && planMessage && (
          <PlanSection planText={planMessage.text} onClose={() => setShowPlan(false)} />
        )}

        {/* Conversation */}
        <ConversationPanel
          messages={displayMessages}
          hasAgentId={!!integration.cursor_agent_id}
          showInput={!!showConversationInput}
          inputValue={message}
          onInputChange={setMessage}
          onSend={handleSend}
          isSending={followupMutation.isPending}
          waitingForUpdate={waitingForUpdate}
          onRefresh={() => refreshConversationMutation.mutate()}
          isRefreshing={refreshConversationMutation.isPending}
        />
      </div>
    </div>
  )
}

