import { useRef, useEffect, useState } from 'react'
import {
  MoreVertical,
  Edit3,
  X,
  Check,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  CheckCircle,
  StopCircle,
} from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateIntegration } from '../../api/updates'
import type { UpdateIntegrationStatus } from '../../api/updates'

interface ManualControlsMenuProps {
  updateId: string
  integration: UpdateIntegrationStatus
}

export function ManualControlsMenu({ updateId, integration }: ManualControlsMenuProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [editingBranch, setEditingBranch] = useState(false)
  const [editingPR, setEditingPR] = useState(false)
  const [branchInput, setBranchInput] = useState(integration.cursor_branch_name || '')
  const [prInput, setPrInput] = useState(integration.pr_url || '')
  const menuRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateIntegration>[2]) =>
      updateIntegration(updateId, integration.integration_id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
      setEditingBranch(false)
      setEditingPR(false)
      setShowMenu(false)
    },
  })

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  // Update inputs when integration changes
  useEffect(() => {
    setBranchInput(integration.cursor_branch_name || '')
    setPrInput(integration.pr_url || '')
  }, [integration.cursor_branch_name, integration.pr_url])

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors text-xs"
        title="Manual controls"
      >
        <MoreVertical size={12} />
        <span>Edit</span>
      </button>

      {showMenu && (
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
                  onClick={() => mutation.mutate({ cursor_branch_name: branchInput || null })}
                  disabled={mutation.isPending}
                  className="p-1 rounded-lg bg-green-400/10 text-green-400 hover:bg-green-400/20"
                >
                  <Check size={12} />
                </button>
                <button
                  onClick={() => {
                    setEditingBranch(false)
                    setBranchInput(integration.cursor_branch_name || '')
                  }}
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
                  onClick={() => mutation.mutate({ pr_url: prInput || null })}
                  disabled={mutation.isPending}
                  className="p-1 rounded-lg bg-green-400/10 text-green-400 hover:bg-green-400/20"
                >
                  <Check size={12} />
                </button>
                <button
                  onClick={() => {
                    setEditingPR(false)
                    setPrInput(integration.pr_url || '')
                  }}
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
                onClick={() => mutation.mutate({ pr_merged: true })}
                disabled={mutation.isPending}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg bg-purple-400/10 text-purple-400 hover:bg-purple-400/20 transition-colors"
              >
                <GitMerge size={12} />
                Merged
              </button>
            )}

            {!integration.pr_closed && !integration.pr_merged && (
              <button
                onClick={() => mutation.mutate({ pr_closed: true })}
                disabled={mutation.isPending}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors"
              >
                <GitPullRequestClosed size={12} />
                Closed
              </button>
            )}

            {(integration.pr_merged || integration.pr_closed) && (
              <button
                onClick={() =>
                  mutation.mutate({ pr_merged: false, pr_closed: false, status: 'ready_to_merge' })
                }
                disabled={mutation.isPending}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg bg-green-400/10 text-green-400 hover:bg-green-400/20 transition-colors"
              >
                <GitPullRequest size={12} />
                Reopen
              </button>
            )}

            <button
              onClick={() => mutation.mutate({ status: 'complete' })}
              disabled={mutation.isPending || integration.status === 'complete'}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg bg-surface-hover text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
            >
              <CheckCircle size={12} />
              Complete
            </button>

            <button
              onClick={() => mutation.mutate({ status: 'skipped' })}
              disabled={mutation.isPending || integration.status === 'skipped'}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg bg-surface-hover text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
            >
              <StopCircle size={12} />
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

