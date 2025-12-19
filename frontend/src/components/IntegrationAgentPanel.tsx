import { useState, useRef, useEffect } from 'react'
import {
  MessageSquare,
  Send,
  GitPullRequest,
  GitPullRequestClosed,
  GitMerge,
  StopCircle,
  AlertCircle,
  CheckCircle,
  Loader2,
  User,
  Bot,
  FileText,
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  RefreshCw,
  MoreVertical,
  Edit3,
  X,
  Check,
} from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { sendFollowup, stopAgent, updateIntegrationSettings, refreshConversation } from '../api/agents'
import { checkBranchStatus, getPullRequestDetails, getIntegrationPRStatus, refreshPRStatus, parsePrUrl, type GitHubPRDetails } from '../api/github'
import { updateIntegration } from '../api/updates'
import type { UpdateIntegrationStatus, ConversationMessage } from '../api/updates'

interface IntegrationAgentPanelProps {
  updateId: string
  integration: UpdateIntegrationStatus
}


export function IntegrationAgentPanel({
  updateId,
  integration,
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
  const [showManualControls, setShowManualControls] = useState(false)
  const [editingBranch, setEditingBranch] = useState(false)
  const [editingPR, setEditingPR] = useState(false)
  const [branchInput, setBranchInput] = useState(integration.cursor_branch_name || '')
  const [prInput, setPrInput] = useState(integration.pr_url || '')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  
  // Combine server conversation with pending message for display
  const serverMessages = integration.conversation || []
  const messages: ConversationMessage[] = pendingMessage
    ? [...serverMessages, { id: 'pending', type: 'user_message', text: pendingMessage }]
    : serverMessages

  // Extract the plan (first user message) and filter it from displayed messages
  const planMessage = messages.find((msg) => msg.type === 'user_message')
  const displayMessages = messages.filter((msg) => msg !== planMessage)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Scroll when messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages.length])

  // Clear pending message once it appears in server data
  useEffect(() => {
    if (pendingMessage && serverMessages.some(m => m.type === 'user_message' && m.text === pendingMessage)) {
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

  // Poll PR status while PR is open (not merged/cancelled/skipped) to update backend cache
  useEffect(() => {
    // Skip polling if already merged (cached) or no PR URL
    if (!integration.pr_url || integration.pr_merged) return
    if (['cancelled', 'skipped', 'complete'].includes(integration.status)) return

    const checkPRStatus = async () => {
      try {
        const status = await getIntegrationPRStatus(updateId, integration.integration_id)
        // If merged, invalidate to refresh from backend (which now caches the status)
        if (status.merged) {
          queryClient.invalidateQueries({ queryKey: ['updates'] })
        }
      } catch (e) {
        console.error('Failed to check PR status:', e)
      }
    }

    const interval = setInterval(checkPRStatus, 60000)
    return () => clearInterval(interval)
  }, [updateId, integration.integration_id, integration.pr_url, integration.pr_merged, integration.status, queryClient])

  // Poll branch for PR discovery (only when no PR yet)
  useEffect(() => {
    if (integration.pr_url || !integration.cursor_branch_name) return
    if (['complete', 'cancelled', 'skipped'].includes(integration.status)) return

    const checkBranch = async () => {
      try {
        const status = await checkBranchStatus(updateId, integration.integration_id)
        if (status.branch_exists && !branchCreated) {
          setBranchCreated(true)
        }
        if (status.pr_url) {
          queryClient.invalidateQueries({ queryKey: ['updates'] })
        }
        // Check for new commits when waiting for follow-up response
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
    const interval = setInterval(checkBranch, 60000)
    return () => clearInterval(interval)
  }, [updateId, integration.integration_id, integration.pr_url, integration.cursor_branch_name, integration.status, branchCreated, waitingForUpdate, lastCommitSha, queryClient])

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
      // Show pending message optimistically
      setPendingMessage(message)
      setMessage('')
      setWaitingForUpdate(true)
      
      // Get current commit SHA before agent makes changes
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
  })

  const autoCreatePrMutation = useMutation({
    mutationFn: (autoCreatePr: boolean) => 
      updateIntegrationSettings(updateId, integration.integration_id, autoCreatePr),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
  })

  const refreshPrMutation = useMutation({
    mutationFn: () => refreshPRStatus(updateId, integration.integration_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
  })

  const refreshConversationMutation = useMutation({
    mutationFn: () => refreshConversation(updateId, integration.integration_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
  })

  const manualUpdateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateIntegration>[2]) => 
      updateIntegration(updateId, integration.integration_id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
      setEditingBranch(false)
      setEditingPR(false)
      setShowManualControls(false)
    },
  })

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowManualControls(false)
      }
    }
    if (showManualControls) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showManualControls])

  // Update inputs when integration changes
  useEffect(() => {
    setBranchInput(integration.cursor_branch_name || '')
    setPrInput(integration.pr_url || '')
  }, [integration.cursor_branch_name, integration.pr_url])

  const handleSend = () => {
    if (!message.trim()) return
    followupMutation.mutate(message.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Show "Running" status when we've sent a follow-up and are waiting for the agent

  return (
    <div className="p-6">
        {/* Compact action bar */}
        <div className="flex items-center justify-end gap-2 mb-4">
          {/* Manual Controls Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowManualControls(!showManualControls)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors text-xs"
              title="Manual controls"
            >
              <MoreVertical size={12} />
              <span>Edit</span>
            </button>
            
            {showManualControls && (
              <div className="absolute right-0 top-8 w-64 bg-surface border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="p-2 border-b border-border bg-surface-hover/50">
                  <span className="text-xs font-medium text-text-muted">Manual Controls</span>
                </div>
                
                {/* Edit Branch */}
                <div className="p-2 border-b border-border">
                  <label className="text-xs text-text-muted mb-1 block">Branch Name</label>
                  {editingBranch ? (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={branchInput}
                        onChange={(e) => setBranchInput(e.target.value)}
                        placeholder="feat/my-branch"
                        className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded-lg text-text-primary"
                        autoFocus
                      />
                      <button
                        onClick={() => manualUpdateMutation.mutate({ cursor_branch_name: branchInput || null })}
                        disabled={manualUpdateMutation.isPending}
                        className="p-1 rounded-lg bg-green-400/10 text-green-400 hover:bg-green-400/20"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        onClick={() => { setEditingBranch(false); setBranchInput(integration.cursor_branch_name || '') }}
                        className="p-1 rounded-lg bg-red-400/10 text-red-400 hover:bg-red-400/20"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingBranch(true)}
                      className="w-full flex items-center justify-between px-2 py-1.5 text-xs bg-background border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
                    >
                      <span className="truncate">{integration.cursor_branch_name || 'Not set'}</span>
                      <Edit3 size={10} />
                    </button>
                  )}
                </div>
                
                {/* Edit PR URL */}
                <div className="p-2 border-b border-border">
                  <label className="text-xs text-text-muted mb-1 block">PR URL</label>
                  {editingPR ? (
                    <div className="flex gap-1">
                      <input
                        type="url"
                        value={prInput}
                        onChange={(e) => setPrInput(e.target.value)}
                        placeholder="https://github.com/.../pull/123"
                        className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded-lg text-text-primary"
                        autoFocus
                      />
                      <button
                        onClick={() => manualUpdateMutation.mutate({ pr_url: prInput || null })}
                        disabled={manualUpdateMutation.isPending}
                        className="p-1 rounded-lg bg-green-400/10 text-green-400 hover:bg-green-400/20"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        onClick={() => { setEditingPR(false); setPrInput(integration.pr_url || '') }}
                        className="p-1 rounded-lg bg-red-400/10 text-red-400 hover:bg-red-400/20"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingPR(true)}
                      className="w-full flex items-center justify-between px-2 py-1.5 text-xs bg-background border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
                    >
                      <span className="truncate">{integration.pr_url || 'Not set'}</span>
                      <Edit3 size={10} />
                    </button>
                  )}
                </div>
                
                {/* Quick Actions */}
                <div className="p-2 space-y-1">
                  <span className="text-xs text-text-muted block mb-1">Mark as...</span>
                  
                  {!integration.pr_merged && (
                    <button
                      onClick={() => manualUpdateMutation.mutate({ pr_merged: true })}
                      disabled={manualUpdateMutation.isPending}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg bg-purple-400/10 text-purple-400 hover:bg-purple-400/20 transition-colors"
                    >
                      <GitMerge size={12} />
                      Merged
                    </button>
                  )}
                  
                  {!integration.pr_closed && !integration.pr_merged && (
                    <button
                      onClick={() => manualUpdateMutation.mutate({ pr_closed: true })}
                      disabled={manualUpdateMutation.isPending}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors"
                    >
                      <GitPullRequestClosed size={12} />
                      Closed
                    </button>
                  )}
                  
                  {(integration.pr_merged || integration.pr_closed) && (
                    <button
                      onClick={() => manualUpdateMutation.mutate({ pr_merged: false, pr_closed: false, status: 'ready_to_merge' })}
                      disabled={manualUpdateMutation.isPending}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg bg-green-400/10 text-green-400 hover:bg-green-400/20 transition-colors"
                    >
                      <GitPullRequest size={12} />
                      Reopen
                    </button>
                  )}
                  
                  <button
                    onClick={() => manualUpdateMutation.mutate({ status: 'complete' })}
                    disabled={manualUpdateMutation.isPending || integration.status === 'complete'}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg bg-surface-hover text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle size={12} />
                    Complete
                  </button>
                  
                  <button
                    onClick={() => manualUpdateMutation.mutate({ status: 'skipped' })}
                    disabled={manualUpdateMutation.isPending || integration.status === 'skipped'}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg bg-surface-hover text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
                  >
                    <StopCircle size={12} />
                    Skip
                  </button>
                </div>
              </div>
            )}
          </div>
          
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
                  onClick={() => refreshPrMutation.mutate()}
                  disabled={refreshPrMutation.isPending}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors text-xs disabled:opacity-50"
                  title="Refresh PR status"
                >
                  <RefreshCw size={12} className={refreshPrMutation.isPending ? 'animate-spin' : ''} />
                  <span>Sync</span>
                </button>
              )}
              <button
                onClick={() => setShowDiff(!showDiff)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors text-xs"
              >
                {showDiff ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                <span>Diff</span>
              </button>
            </>
          )}
          
          {integration.status === 'in_progress' && integration.cursor_agent_id && (
              <button
                onClick={() => stopMutation.mutate()}
                disabled={stopMutation.isPending}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors"
              >
                <StopCircle size={12} />
                Stop
              </button>
            )}
          </div>

        {/* PR Diff Viewer */}
        {showDiff && integration.pr_url && (
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
              {diffLoading ? (
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
                <p className="text-sm text-text-muted text-center py-4">
                  Failed to load diff
                </p>
              )}
            </div>
          </div>
        )}

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
        {planMessage && (
          <div className="mb-6 bg-surface rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setShowPlan(!showPlan)}
              className="w-full p-4 flex items-center justify-between hover:bg-surface-hover transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-accent" />
                <span className="text-sm font-medium text-text-secondary">Update Plan</span>
              </div>
              {showPlan ? (
                <ChevronUp size={16} className="text-text-muted" />
              ) : (
                <ChevronDown size={16} className="text-text-muted" />
              )}
            </button>
            {showPlan && (
              <div className="border-t border-border bg-background/30">
                <div className="p-4 max-h-72 overflow-y-auto markdown-content">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => <h1 className="text-xl font-semibold text-text-primary mt-4 mb-3 leading-tight">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-lg font-semibold text-text-primary mt-4 mb-2 leading-tight">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-base font-semibold text-text-primary mt-3 mb-2 leading-tight">{children}</h3>,
                      h4: ({ children }) => <h4 className="text-sm font-semibold text-text-primary mt-3 mb-1 leading-tight">{children}</h4>,
                      p: ({ children }) => <p className="text-sm text-text-primary my-2 leading-relaxed">{children}</p>,
                      ul: ({ children }) => <ul className="text-sm text-text-primary my-2 pl-4 list-disc">{children}</ul>,
                      ol: ({ children }) => <ol className="text-sm text-text-primary my-2 pl-4 list-decimal">{children}</ol>,
                      li: ({ children }) => <li className="my-0.5">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
                      a: ({ href, children }) => (
                        <a 
                          href={href} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-accent underline hover:text-accent/80 transition-colors"
                        >
                          {children}
                        </a>
                      ),
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '')
                        const isInline = !match && !String(children).includes('\n')
                        return isInline ? (
                          <code className="text-accent bg-surface px-1.5 py-0.5 rounded text-xs" {...props}>
                            {children}
                          </code>
                        ) : (
                          <SyntaxHighlighter
                            style={oneDark}
                            language={match?.[1] || 'text'}
                            PreTag="div"
                            customStyle={{
                              margin: '0.75rem 0',
                              borderRadius: '0.5rem',
                              fontSize: '0.75rem',
                            }}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        )
                      },
                    }}
                  >
                    {planMessage.text}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Conversation */}
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-text-muted" />
              <span className="text-sm font-medium text-text-secondary">Conversation</span>
            </div>
            {integration.cursor_agent_id && (
              <button
                onClick={() => refreshConversationMutation.mutate()}
                disabled={refreshConversationMutation.isPending}
                className="p-1.5 rounded-lg bg-surface-hover text-text-secondary hover:bg-surface hover:text-text-primary transition-colors disabled:opacity-50"
                title="Refresh conversation"
              >
                <RefreshCw size={12} className={refreshConversationMutation.isPending ? 'animate-spin' : ''} />
              </button>
            )}
          </div>

          <div className="h-96 overflow-y-auto p-4 space-y-4">
            {displayMessages.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">
                {integration.cursor_agent_id
                  ? 'Agent is coding...'
                  : 'No conversation yet. Start the agent to begin.'}
              </p>
            ) : (
              displayMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 ${
                    msg.type === 'user_message' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.type === 'assistant_message' && (
                    <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                      <Bot size={16} className="text-accent" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] px-4 py-3 rounded-xl ${
                      msg.type === 'user_message'
                        ? 'bg-accent text-white'
                        : 'bg-surface-hover text-text-primary'
                    }`}
                  >
                    {msg.type === 'user_message' ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
                    ) : (
                      <ReactMarkdown
                        components={{
                          h1: ({ children }) => <h1 className="text-xl font-semibold text-text-primary mt-4 mb-3 leading-tight">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-lg font-semibold text-text-primary mt-4 mb-2 leading-tight">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-base font-semibold text-text-primary mt-3 mb-2 leading-tight">{children}</h3>,
                          h4: ({ children }) => <h4 className="text-sm font-semibold text-text-primary mt-3 mb-1 leading-tight">{children}</h4>,
                          p: ({ children }) => <p className="text-sm text-text-primary my-2 leading-relaxed">{children}</p>,
                          ul: ({ children }) => <ul className="text-sm text-text-primary my-2 pl-4 list-disc">{children}</ul>,
                          ol: ({ children }) => <ol className="text-sm text-text-primary my-2 pl-4 list-decimal">{children}</ol>,
                          li: ({ children }) => <li className="my-0.5">{children}</li>,
                          strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
                          a: ({ href, children }) => (
                        <a 
                          href={href} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-accent underline hover:text-accent/80 transition-colors"
                        >
                          {children}
                        </a>
                      ),
                          code({ className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '')
                            const isInline = !match && !String(children).includes('\n')
                            return isInline ? (
                              <code className="text-accent bg-background px-1.5 py-0.5 rounded text-xs" {...props}>
                                {children}
                              </code>
                            ) : (
                              <SyntaxHighlighter
                                style={oneDark}
                                language={match?.[1] || 'text'}
                                PreTag="div"
                                customStyle={{
                                  margin: '0.75rem 0',
                                  borderRadius: '0.5rem',
                                  fontSize: '0.75rem',
                                }}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            )
                          },
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    )}
                  </div>
                  {msg.type === 'user_message' && (
                    <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center flex-shrink-0">
                      <User size={16} className="text-text-muted" />
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input - show when agent is running, needs review, ready to merge, or has a pending question */}
          {(integration.status === 'in_progress' || 
            integration.status === 'needs_review' || 
            integration.status === 'ready_to_merge' ||
            integration.agent_question) &&
            integration.cursor_agent_id && (
              <div className="p-4 border-t border-border">
                {waitingForUpdate && (
                  <div className="flex items-center gap-2 mb-3 text-sm text-text-muted">
                    <Loader2 size={14} className="animate-spin" />
                    <span>Waiting for agent to push changes...</span>
                  </div>
                )}
                <div className="flex gap-3">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Send a follow-up message..."
                    rows={2}
                    className="flex-1 px-4 py-3 bg-background border border-border rounded-xl text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!message.trim() || followupMutation.isPending}
                    className="px-4 py-3 bg-accent text-white rounded-xl hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {followupMutation.isPending ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Send size={18} />
                    )}
                  </button>
                </div>
              </div>
            )}
        </div>
    </div>
  )
}

