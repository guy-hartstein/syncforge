import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  X, 
  Key, 
  Check, 
  AlertCircle, 
  Loader2, 
  Trash2, 
  Github, 
  ChevronDown, 
  Webhook, 
  Copy, 
  RefreshCw,
  Zap,
  ExternalLink,
  ChevronRight,
  Cpu
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchSettings, updateSettings, testConnection, deleteCursorApiKey, fetchModels, generateWebhookSecret } from '../api/settings'
import { saveGitHubToken, deleteGitHubToken } from '../api/github'
import { saveLinearToken, deleteLinearToken } from '../api/linear'
import { useConfirm } from './ConfirmDialog'

function LinearIcon({ className }: { className?: string }) {
  return <img src="/linear.png" alt="Linear" className={className} />
}

function CursorIcon({ className }: { className?: string }) {
  return <img src="/cursor.png" alt="Cursor" className={className} />
}

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type SettingsTab = 'cursor' | 'github' | 'linear'

// Status badge component
function StatusBadge({ connected, label }: { connected: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
      connected 
        ? 'bg-green-400/10 text-green-400' 
        : 'bg-amber-400/10 text-amber-400'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-amber-400'}`} />
      {label}
    </span>
  )
}

// Result toast component
function ResultToast({ result, onDismiss }: { 
  result: { success: boolean; message: string } | null
  onDismiss: () => void 
}) {
  useEffect(() => {
    if (result) {
      const timer = setTimeout(onDismiss, 3000)
      return () => clearTimeout(timer)
    }
  }, [result, onDismiss])

  if (!result) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      className={`absolute bottom-4 left-4 right-4 p-3 rounded-xl flex items-center gap-2 backdrop-blur-sm ${
        result.success
          ? 'bg-green-400/20 text-green-400 border border-green-400/20'
          : 'bg-red-400/20 text-red-400 border border-red-400/20'
      }`}
    >
      {result.success ? <Check size={16} /> : <AlertCircle size={16} />}
      <span className="text-sm font-medium">{result.message}</span>
    </motion.div>
  )
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('cursor')
  const [apiKey, setApiKey] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [linearToken, setLinearToken] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [showWebhooks, setShowWebhooks] = useState(false)
  const [showNgrokTutorial, setShowNgrokTutorial] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const queryClient = useQueryClient()
  const confirm = useConfirm()

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    enabled: isOpen,
  })

  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: ['models'],
    queryFn: fetchModels,
    enabled: isOpen && !!settings?.has_cursor_api_key,
  })

  const saveMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['models'] })
      setApiKey('')
      setResult({ success: true, message: 'API key saved successfully' })
    },
    onError: () => setResult({ success: false, message: 'Failed to save API key' }),
  })

  const saveModelMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setResult({ success: true, message: 'Model preference saved' })
    },
    onError: () => setResult({ success: false, message: 'Failed to save model preference' }),
  })

  const testMutation = useMutation({
    mutationFn: testConnection,
    onSuccess: (res) => setResult(res),
    onError: () => setResult({ success: false, message: 'Connection test failed' }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCursorApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setResult({ success: true, message: 'API key removed' })
    },
  })

  const saveGitHubMutation = useMutation({
    mutationFn: saveGitHubToken,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setGithubToken('')
      setResult({ success: true, message: `Connected as ${res.username}` })
    },
    onError: (err) => setResult({ success: false, message: err instanceof Error ? err.message : 'Failed to connect' }),
  })

  const deleteGitHubMutation = useMutation({
    mutationFn: deleteGitHubToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setResult({ success: true, message: 'GitHub disconnected' })
    },
  })

  const saveLinearMutation = useMutation({
    mutationFn: saveLinearToken,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setLinearToken('')
      setResult({ success: true, message: `Connected as ${res.name || res.email}` })
    },
    onError: (err) => setResult({ success: false, message: err instanceof Error ? err.message : 'Failed to connect' }),
  })

  const deleteLinearMutation = useMutation({
    mutationFn: deleteLinearToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setResult({ success: true, message: 'Linear disconnected' })
    },
  })

  const generateSecretMutation = useMutation({
    mutationFn: generateWebhookSecret,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setResult({ success: true, message: 'Webhook secret generated' })
    },
    onError: () => setResult({ success: false, message: 'Failed to generate secret' }),
  })

  const saveWebhookUrlMutation = useMutation({
    mutationFn: (url: string) => updateSettings({ cursor_webhook_url: url }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setResult({ success: true, message: 'Webhook URL saved' })
    },
    onError: () => setResult({ success: false, message: 'Failed to save webhook URL' }),
  })

  useEffect(() => {
    if (!isOpen) {
      setApiKey('')
      setGithubToken('')
      setLinearToken('')
      setWebhookUrl('')
      setResult(null)
      setShowWebhooks(false)
      setShowNgrokTutorial(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (settings?.cursor_webhook_url && !webhookUrl) {
      setWebhookUrl(settings.cursor_webhook_url)
    }
  }, [settings?.cursor_webhook_url])

  const handleDelete = async (type: 'cursor' | 'github' | 'linear') => {
    const configs = {
      cursor: { title: 'Remove API Key', message: 'Remove your Cursor API key?', fn: deleteMutation },
      github: { title: 'Disconnect GitHub', message: 'Disconnect your GitHub account?', fn: deleteGitHubMutation },
      linear: { title: 'Disconnect Linear', message: 'Disconnect your Linear account?', fn: deleteLinearMutation },
    }
    const config = configs[type]
    const confirmed = await confirm({ title: config.title, message: config.message, confirmText: 'Remove', variant: 'danger' })
    if (confirmed) config.fn.mutate()
  }

  const handleCopySecret = async () => {
    if (settings?.cursor_webhook_secret) {
      await navigator.clipboard.writeText(settings.cursor_webhook_secret)
      setResult({ success: true, message: 'Secret copied to clipboard' })
    }
  }

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode; connected: boolean }[] = [
    { 
      id: 'cursor', 
      label: 'Cursor Cloud', 
      icon: <CursorIcon className="w-4 h-4" />, 
      connected: !!settings?.has_cursor_api_key 
    },
    { 
      id: 'github', 
      label: 'GitHub', 
      icon: <Github size={16} />, 
      connected: !!settings?.github_connected 
    },
    { 
      id: 'linear', 
      label: 'Linear', 
      icon: <LinearIcon className="w-4 h-4" />, 
      connected: !!settings?.linear_connected 
    },
  ]

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-40"
            onClick={onClose}
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-2xl bg-background border border-border rounded-2xl shadow-2xl overflow-hidden relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Gradient accent */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent via-purple-500 to-pink-500" />
              
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-border">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">Settings</h2>
                  <p className="text-sm text-text-muted mt-0.5">Manage your integrations and preferences</p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl hover:bg-surface-hover text-text-muted hover:text-text-primary transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 px-6 py-3 border-b border-border bg-surface/50">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === tab.id
                        ? 'bg-accent text-white shadow-lg shadow-accent/20'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.connected && activeTab !== tab.id && (
                      <span className="w-2 h-2 rounded-full bg-green-400" />
                    )}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="p-6 min-h-[400px] max-h-[60vh] overflow-y-auto">
                <AnimatePresence mode="wait">
                  {/* Cursor Tab */}
                  {activeTab === 'cursor' && (
                    <motion.div
                      key="cursor"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-6"
                    >
                      {/* API Key Section */}
                      <div className="p-5 rounded-2xl bg-gradient-to-br from-surface to-surface-hover border border-border">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-accent/10">
                              <Key size={20} className="text-accent" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-text-primary">API Key</h3>
                              <p className="text-xs text-text-muted">Required for cloud agents</p>
                            </div>
                          </div>
                          <StatusBadge 
                            connected={!!settings?.has_cursor_api_key} 
                            label={settings?.has_cursor_api_key ? 'Connected' : 'Not configured'} 
                          />
                        </div>

                        {settings?.has_cursor_api_key ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 flex items-center gap-2 p-3 bg-background/50 rounded-xl border border-border">
                              <Check className="w-4 h-4 text-green-400" />
                              <span className="text-sm text-text-secondary">API key configured</span>
                            </div>
                            <button
                              onClick={() => testMutation.mutate()}
                              disabled={testMutation.isPending}
                              className="px-4 py-3 rounded-xl bg-surface-hover text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
                            >
                              {testMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Test'}
                            </button>
                            <button
                              onClick={() => handleDelete('cursor')}
                              className="p-3 rounded-xl hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
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
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => saveMutation.mutate({ cursor_api_key: apiKey.trim() })}
                                disabled={!apiKey.trim() || saveMutation.isPending}
                                className="btn-primary flex-1 flex items-center justify-center gap-2"
                              >
                                {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                                Save API Key
                              </button>
                              <a
                                href="https://cursor.com/dashboard?tab=cloud-agents"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-secondary flex items-center gap-2"
                              >
                                Get Key <ExternalLink size={14} />
                              </a>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Model Selection */}
                      {settings?.has_cursor_api_key && (
                        <div className="p-5 rounded-2xl bg-gradient-to-br from-surface to-surface-hover border border-border">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 rounded-xl bg-purple-500/10">
                              <Cpu size={20} className="text-purple-400" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-text-primary">Preferred Model</h3>
                              <p className="text-xs text-text-muted">Model used for cloud agents</p>
                            </div>
                          </div>

                          {modelsLoading ? (
                            <div className="flex items-center gap-2 p-3 bg-background/50 rounded-xl">
                              <Loader2 size={16} className="animate-spin text-text-muted" />
                              <span className="text-sm text-text-muted">Loading models...</span>
                            </div>
                          ) : modelsData?.error ? (
                            <div className="p-3 bg-red-400/10 rounded-xl text-sm text-red-400">
                              {modelsData.error}
                            </div>
                          ) : (
                            <div className="relative">
                              <select
                                value={settings?.preferred_model || ''}
                                onChange={(e) => saveModelMutation.mutate({ preferred_model: e.target.value })}
                                disabled={saveModelMutation.isPending}
                                className="input appearance-none pr-10 cursor-pointer"
                              >
                                <option value="">Auto (recommended)</option>
                                {modelsData?.models.map((model) => (
                                  <option key={model} value={model}>{model}</option>
                                ))}
                              </select>
                              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                {saveModelMutation.isPending ? (
                                  <Loader2 size={16} className="animate-spin text-text-muted" />
                                ) : (
                                  <ChevronDown size={16} className="text-text-muted" />
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Webhooks (Advanced) */}
                      {settings?.has_cursor_api_key && (
                        <div className="rounded-2xl border border-border overflow-hidden">
                          <button
                            onClick={() => setShowWebhooks(!showWebhooks)}
                            className="w-full flex items-center justify-between p-5 bg-surface/50 hover:bg-surface transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2.5 rounded-xl bg-amber-500/10">
                                <Webhook size={20} className="text-amber-400" />
                              </div>
                              <div className="text-left">
                                <h3 className="font-semibold text-text-primary">Webhooks</h3>
                                <p className="text-xs text-text-muted">Instant status updates (advanced)</p>
                              </div>
                            </div>
                            <ChevronRight 
                              size={20} 
                              className={`text-text-muted transition-transform ${showWebhooks ? 'rotate-90' : ''}`} 
                            />
                          </button>
                          
                          <AnimatePresence>
                            {showWebhooks && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="p-5 pt-0 space-y-4">
                                  <div className="text-xs text-text-muted bg-amber-500/5 p-3 rounded-xl border border-amber-500/10">
                                    <p>
                                      Webhooks provide instant agent status updates. Requires a publicly accessible URL{' '}
                                      <button 
                                        onClick={() => setShowNgrokTutorial(!showNgrokTutorial)}
                                        className="text-amber-400 hover:text-amber-300 underline underline-offset-2 font-medium"
                                      >
                                        (use ngrok for local development)
                                      </button>
                                    </p>
                                    
                                    <AnimatePresence>
                                      {showNgrokTutorial && (
                                        <motion.div
                                          initial={{ height: 0, opacity: 0 }}
                                          animate={{ height: 'auto', opacity: 1 }}
                                          exit={{ height: 0, opacity: 0 }}
                                          transition={{ duration: 0.2 }}
                                          className="overflow-hidden"
                                        >
                                          <div className="mt-3 pt-3 border-t border-amber-500/20 space-y-3">
                                            <p className="font-medium text-text-secondary">Quick ngrok Setup:</p>
                                            
                                            <div className="space-y-2">
                                              <div className="flex items-start gap-2">
                                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold">1</span>
                                                <div>
                                                  <p className="text-text-secondary">Install ngrok</p>
                                                  <code className="block mt-1 p-2 bg-background rounded-lg text-[11px] font-mono text-accent">
                                                    brew install ngrok
                                                  </code>
                                                </div>
                                              </div>
                                              
                                              <div className="flex items-start gap-2">
                                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold">2</span>
                                                <div>
                                                  <p className="text-text-secondary">Start a tunnel to your backend</p>
                                                  <code className="block mt-1 p-2 bg-background rounded-lg text-[11px] font-mono text-accent">
                                                    ngrok http 8000
                                                  </code>
                                                </div>
                                              </div>
                                              
                                              <div className="flex items-start gap-2">
                                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold">3</span>
                                                <div>
                                                  <p className="text-text-secondary">Copy the HTTPS URL and add the webhook path</p>
                                                  <code className="block mt-1 p-2 bg-background rounded-lg text-[11px] font-mono text-accent break-all">
                                                    https://abc123.ngrok.io/api/webhooks/cursor
                                                  </code>
                                                </div>
                                              </div>
                                            </div>
                                            
                                            <a
                                              href="https://ngrok.com/download"
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 font-medium"
                                            >
                                              Download ngrok <ExternalLink size={12} />
                                            </a>
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                  
                                  <div>
                                    <label className="block text-xs font-medium text-text-secondary mb-2">Webhook URL</label>
                                    <div className="flex gap-2">
                                      <input
                                        type="url"
                                        value={webhookUrl}
                                        onChange={(e) => setWebhookUrl(e.target.value)}
                                        placeholder="https://your-domain.com/api/webhooks/cursor"
                                        className="input flex-1 text-sm"
                                      />
                                      <button
                                        onClick={() => saveWebhookUrlMutation.mutate(webhookUrl.trim())}
                                        disabled={!webhookUrl.trim() || saveWebhookUrlMutation.isPending}
                                        className="btn-secondary px-4"
                                      >
                                        {saveWebhookUrlMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                                      </button>
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-xs font-medium text-text-secondary mb-2">Webhook Secret</label>
                                    {settings?.cursor_webhook_secret ? (
                                      <>
                                        <div className="flex items-center gap-2">
                                          <code className="flex-1 p-3 bg-background rounded-xl border border-border text-xs font-mono text-text-secondary truncate">
                                            {settings.cursor_webhook_secret}
                                          </code>
                                          <button
                                            onClick={handleCopySecret}
                                            className="p-3 rounded-xl hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
                                            title="Copy"
                                          >
                                            <Copy size={14} />
                                          </button>
                                          <button
                                            onClick={() => generateSecretMutation.mutate()}
                                            disabled={generateSecretMutation.isPending}
                                            className="p-3 rounded-xl hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
                                            title="Regenerate"
                                          >
                                            {generateSecretMutation.isPending ? (
                                              <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                              <RefreshCw size={14} />
                                            )}
                                          </button>
                                        </div>
                                        <p className="mt-2 text-[11px] text-text-muted flex items-center gap-1.5">
                                          <Check size={12} className="text-green-400" />
                                          Automatically included when launching agents — no manual setup needed
                                        </p>
                                      </>
                                    ) : (
                                      <button
                                        onClick={() => generateSecretMutation.mutate()}
                                        disabled={generateSecretMutation.isPending}
                                        className="btn-secondary w-full flex items-center justify-center gap-2"
                                      >
                                        {generateSecretMutation.isPending ? (
                                          <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                          <Key size={14} />
                                        )}
                                        Generate Secret
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* GitHub Tab */}
                  {activeTab === 'github' && (
                    <motion.div
                      key="github"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className="p-5 rounded-2xl bg-gradient-to-br from-surface to-surface-hover border border-border">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-[#238636]/20">
                              <Github size={20} className="text-[#238636]" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-text-primary">GitHub Connection</h3>
                              <p className="text-xs text-text-muted">Access repositories and PRs</p>
                            </div>
                          </div>
                          <StatusBadge 
                            connected={!!settings?.github_connected} 
                            label={settings?.github_connected ? `@${settings.github_username}` : 'Not connected'} 
                          />
                        </div>

                        {settings?.github_connected ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 flex items-center gap-2 p-3 bg-background/50 rounded-xl border border-border">
                              <Github className="w-4 h-4 text-text-muted" />
                              <span className="text-sm text-text-secondary">
                                Connected as <span className="text-text-primary font-medium">{settings.github_username}</span>
                              </span>
                            </div>
                            <button
                              onClick={() => handleDelete('github')}
                              disabled={deleteGitHubMutation.isPending}
                              className="p-3 rounded-xl hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
                            >
                              {deleteGitHubMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
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
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => saveGitHubMutation.mutate(githubToken.trim())}
                                disabled={!githubToken.trim() || saveGitHubMutation.isPending}
                                className="btn-primary flex-1 flex items-center justify-center gap-2"
                              >
                                {saveGitHubMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Github size={16} />}
                                Connect GitHub
                              </button>
                              <a
                                href="https://github.com/settings/tokens/new?scopes=repo&description=SyncForge"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-secondary flex items-center gap-2"
                              >
                                Create PAT <ExternalLink size={14} />
                              </a>
                            </div>
                            <p className="text-xs text-text-muted">
                              Requires <code className="text-accent bg-accent/10 px-1.5 py-0.5 rounded">repo</code> scope
                            </p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* Linear Tab */}
                  {activeTab === 'linear' && (
                    <motion.div
                      key="linear"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className="p-5 rounded-2xl bg-gradient-to-br from-surface to-surface-hover border border-border">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-[#5E6AD2]/20">
                              <LinearIcon className="w-5 h-5" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-text-primary">Linear Connection</h3>
                              <p className="text-xs text-text-muted">Link issues to updates</p>
                            </div>
                          </div>
                          <StatusBadge 
                            connected={!!settings?.linear_connected} 
                            label={settings?.linear_connected ? 'Connected' : 'Not connected'} 
                          />
                        </div>

                        {settings?.linear_connected ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 flex items-center gap-2 p-3 bg-background/50 rounded-xl border border-border">
                              <LinearIcon className="w-4 h-4" />
                              <span className="text-sm text-text-secondary">Linear connected</span>
                            </div>
                            <button
                              onClick={() => handleDelete('linear')}
                              disabled={deleteLinearMutation.isPending}
                              className="p-3 rounded-xl hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
                            >
                              {deleteLinearMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <input
                              type="password"
                              value={linearToken}
                              onChange={(e) => setLinearToken(e.target.value)}
                              placeholder="lin_api_xxxxxxxxxxxxxxxxxxxx"
                              className="input"
                            />
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => saveLinearMutation.mutate(linearToken.trim())}
                                disabled={!linearToken.trim() || saveLinearMutation.isPending}
                                className="btn-primary flex-1 flex items-center justify-center gap-2"
                              >
                                {saveLinearMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <LinearIcon className="w-4 h-4" />}
                                Connect Linear
                              </button>
                              <a
                                href="https://linear.app/settings/api"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-secondary flex items-center gap-2"
                              >
                                Create Key <ExternalLink size={14} />
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Result Toast */}
              <AnimatePresence>
                <ResultToast result={result} onDismiss={() => setResult(null)} />
              </AnimatePresence>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
