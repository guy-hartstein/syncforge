import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Key, Check, AlertCircle, Loader2, Trash2, Github } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchSettings, updateSettings, testConnection, deleteCursorApiKey } from '../api/settings'
import { saveGitHubToken, deleteGitHubToken } from '../api/github'
import { useConfirm } from './ConfirmDialog'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [githubResult, setGithubResult] = useState<{ success: boolean; message: string } | null>(null)
  const queryClient = useQueryClient()
  const confirm = useConfirm()

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    enabled: isOpen,
  })

  const saveMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setApiKey('')
      setTestResult({ success: true, message: 'API key saved successfully' })
    },
    onError: () => {
      setTestResult({ success: false, message: 'Failed to save API key' })
    },
  })

  const testMutation = useMutation({
    mutationFn: testConnection,
    onSuccess: (result) => {
      setTestResult(result)
    },
    onError: () => {
      setTestResult({ success: false, message: 'Connection test failed' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCursorApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setTestResult({ success: true, message: 'API key removed' })
    },
  })

  const saveGitHubMutation = useMutation({
    mutationFn: saveGitHubToken,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setGithubToken('')
      setGithubResult({ success: true, message: `Connected as ${result.username}` })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Failed to save token'
      setGithubResult({ success: false, message })
    },
  })

  const deleteGitHubMutation = useMutation({
    mutationFn: deleteGitHubToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setGithubResult({ success: true, message: 'GitHub disconnected' })
    },
  })

  useEffect(() => {
    if (!isOpen) {
      setApiKey('')
      setGithubToken('')
      setTestResult(null)
      setGithubResult(null)
    }
  }, [isOpen])

  const handleSave = () => {
    if (apiKey.trim()) {
      saveMutation.mutate(apiKey.trim())
    }
  }

  const handleTest = () => {
    testMutation.mutate()
  }

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Remove API Key',
      message: 'Are you sure you want to remove your Cursor API key? You will need to re-enter it to start agents.',
      confirmText: 'Remove',
      variant: 'danger',
    })
    if (confirmed) {
      deleteMutation.mutate()
    }
  }

  const handleSaveGitHub = () => {
    if (githubToken.trim()) {
      saveGitHubMutation.mutate(githubToken.trim())
    }
  }

  const handleDisconnectGitHub = async () => {
    const confirmed = await confirm({
      title: 'Disconnect GitHub',
      message: 'Are you sure you want to disconnect your GitHub account? You will lose access to private repositories.',
      confirmText: 'Disconnect',
      variant: 'danger',
    })
    if (confirmed) {
      deleteGitHubMutation.mutate()
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
              className="w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface">
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-accent" />
                  <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Cursor API Key Section */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Cursor API Key
                  </label>
                  <p className="text-xs text-text-muted mb-3">
                    Get your API key from{' '}
                    <a
                      href="https://cursor.com/dashboard?tab=cloud-agents"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      cursor.com/dashboard
                    </a>
                  </p>

                  {settings?.has_cursor_api_key ? (
                    <div className="flex items-center justify-between p-3 bg-surface rounded-lg border border-border">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-text-secondary">API key configured</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleTest}
                          disabled={testMutation.isPending}
                          className="text-xs px-3 py-1.5 rounded-lg bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
                        >
                          {testMutation.isPending ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            'Test'
                          )}
                        </button>
                        <button
                          onClick={handleDelete}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Enter your Cursor API key"
                        className="input"
                      />
                      <button
                        onClick={handleSave}
                        disabled={!apiKey.trim() || saveMutation.isPending}
                        className="btn-primary w-full flex items-center justify-center gap-2"
                      >
                        {saveMutation.isPending ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Saving...
                          </>
                        ) : (
                          'Save API Key'
                        )}
                      </button>
                    </div>
                  )}

                  {/* Test Result */}
                  {testResult && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`mt-3 p-3 rounded-lg flex items-center gap-2 ${
                        testResult.success
                          ? 'bg-green-400/10 text-green-400'
                          : 'bg-red-400/10 text-red-400'
                      }`}
                    >
                      {testResult.success ? (
                        <Check size={16} />
                      ) : (
                        <AlertCircle size={16} />
                      )}
                      <span className="text-sm">{testResult.message}</span>
                    </motion.div>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-border" />

                {/* GitHub Section */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    GitHub Personal Access Token
                  </label>
                  <p className="text-xs text-text-muted mb-3">
                    Create a PAT with <code className="text-accent">repo</code> scope from{' '}
                    <a
                      href="https://github.com/settings/tokens/new?scopes=repo&description=Integration%20Copilot"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      GitHub Settings
                    </a>
                  </p>

                  {settings?.github_connected ? (
                    <div className="flex items-center justify-between p-3 bg-surface rounded-lg border border-border">
                      <div className="flex items-center gap-2">
                        <Github className="w-4 h-4 text-text-muted" />
                        <span className="text-sm text-text-secondary">
                          Connected as <span className="text-text-primary font-medium">{settings.github_username}</span>
                        </span>
                      </div>
                      <button
                        onClick={handleDisconnectGitHub}
                        disabled={deleteGitHubMutation.isPending}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
                        title="Disconnect GitHub"
                      >
                        {deleteGitHubMutation.isPending ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <input
                        type="password"
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                        className="input"
                      />
                      <button
                        onClick={handleSaveGitHub}
                        disabled={!githubToken.trim() || saveGitHubMutation.isPending}
                        className="btn-secondary w-full flex items-center justify-center gap-2"
                      >
                        {saveGitHubMutation.isPending ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Github size={16} />
                            Connect GitHub
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* GitHub Result */}
                  {githubResult && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`mt-3 p-3 rounded-lg flex items-center gap-2 ${
                        githubResult.success
                          ? 'bg-green-400/10 text-green-400'
                          : 'bg-red-400/10 text-red-400'
                      }`}
                    >
                      {githubResult.success ? (
                        <Check size={16} />
                      ) : (
                        <AlertCircle size={16} />
                      )}
                      <span className="text-sm">{githubResult.message}</span>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end px-6 py-4 border-t border-border bg-surface">
                <button onClick={onClose} className="btn-secondary">
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
