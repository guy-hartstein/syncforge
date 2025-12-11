import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm, useFieldArray } from 'react-hook-form'
import { X, Plus, Trash2, Github, Check, AlertCircle, Loader2, Search, Lock, Globe, Settings, Brain } from 'lucide-react'
import type { Integration, IntegrationCreate, Memory } from '../types'
import { checkGitHubRepo, getGitHubStatus, listGitHubRepos, type GitHubRepo, type GitHubStatus } from '../api/github'
import { deleteMemory } from '../api/integrations'
import { useToast } from './Toast'

interface AddIntegrationModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: IntegrationCreate) => void
  editingIntegration?: Integration | null
  onOpenSettings?: () => void
  onMemoryDelete?: () => void
}

interface FormData {
  name: string
  github_links: { value: string }[]
  instructions: string
}

type LinkStatus = 'idle' | 'checking' | 'public' | 'private' | 'invalid'

interface LinkValidation {
  status: LinkStatus
  repoName?: string
  error?: string
}

export function AddIntegrationModal({ isOpen, onClose, onSubmit, editingIntegration, onOpenSettings, onMemoryDelete }: AddIntegrationModalProps) {
  const [linkValidations, setLinkValidations] = useState<Record<number, LinkValidation>>({})
  const [showGitHubPrompt, setShowGitHubPrompt] = useState(false)
  const [showRepoSelector, setShowRepoSelector] = useState(false)
  const [githubStatus, setGithubStatus] = useState<GitHubStatus | null>(null)
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [repoSearch, setRepoSearch] = useState('')
  const [memories, setMemories] = useState<Memory[]>([])
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null)
  const toast = useToast()

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      name: '',
      github_links: [{ value: '' }],
      instructions: '',
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'github_links',
  })

  const watchedLinks = watch('github_links')

  // Load GitHub status on mount
  useEffect(() => {
    if (isOpen) {
      getGitHubStatus()
        .then(setGithubStatus)
        .catch(() => setGithubStatus({ connected: false, username: null }))
    }
  }, [isOpen])

  // Load repos when repo selector is opened
  useEffect(() => {
    if (showRepoSelector && githubStatus?.connected && repos.length === 0) {
      setLoadingRepos(true)
      listGitHubRepos()
        .then(setRepos)
        .catch(() => {
          toast.error('Failed to load repositories')
          setShowRepoSelector(false)
        })
        .finally(() => setLoadingRepos(false))
    }
  }, [showRepoSelector, githubStatus?.connected])

  // Filter repos based on search
  const filteredRepos = useMemo(() => {
    if (!repoSearch.trim()) return repos
    const search = repoSearch.toLowerCase()
    return repos.filter(repo => 
      repo.name.toLowerCase().includes(search) ||
      repo.full_name.toLowerCase().includes(search) ||
      (repo.description?.toLowerCase().includes(search))
    )
  }, [repos, repoSearch])

  // Check if a repo is already selected
  const isRepoSelected = useCallback((repoUrl: string) => {
    return watchedLinks.some(link => link.value === repoUrl)
  }, [watchedLinks])

  // Add repo from selector
  const handleSelectRepo = useCallback((repo: GitHubRepo) => {
    if (isRepoSelected(repo.html_url)) return
    
    const emptyIndex = watchedLinks.findIndex(link => !link.value.trim())
    if (emptyIndex >= 0) {
      setValue(`github_links.${emptyIndex}.value`, repo.html_url)
    } else {
      append({ value: repo.html_url })
    }
    setShowRepoSelector(false)
    setRepoSearch('')
  }, [watchedLinks, append, setValue, isRepoSelected])

  // Debounced validation for GitHub links
  const validateLink = useCallback(async (index: number, url: string) => {
    if (!url.trim() || !url.includes('github.com')) {
      setLinkValidations(prev => ({ ...prev, [index]: { status: 'idle' } }))
      return
    }

    setLinkValidations(prev => ({ ...prev, [index]: { status: 'checking' } }))

    try {
      const result = await checkGitHubRepo(url)
      
      if (!result.is_valid) {
        setLinkValidations(prev => ({
          ...prev,
          [index]: { status: 'invalid', error: result.error || 'Invalid URL' }
        }))
      } else if (result.is_public) {
        setLinkValidations(prev => ({
          ...prev,
          [index]: { status: 'public', repoName: result.repo_name || undefined }
        }))
      } else {
        if (githubStatus?.connected) {
          setLinkValidations(prev => ({
            ...prev,
            [index]: { status: 'private', repoName: result.repo_name || undefined }
          }))
        } else {
          setLinkValidations(prev => ({
            ...prev,
            [index]: { status: 'private', repoName: result.repo_name || undefined, error: result.error || undefined }
          }))
        }
      }
    } catch {
      setLinkValidations(prev => ({
        ...prev,
        [index]: { status: 'invalid', error: 'Failed to check repository' }
      }))
    }
  }, [githubStatus?.connected])

  // Watch for link changes and validate with debounce
  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = []
    
    watchedLinks.forEach((link, index) => {
      const timeout = setTimeout(() => {
        validateLink(index, link.value)
      }, 500)
      timeouts.push(timeout)
    })

    return () => timeouts.forEach(clearTimeout)
  }, [watchedLinks, validateLink])

  useEffect(() => {
    if (editingIntegration) {
      reset({
        name: editingIntegration.name,
        github_links: editingIntegration.github_links.length > 0
          ? editingIntegration.github_links.map(link => ({ value: link }))
          : [{ value: '' }],
        instructions: editingIntegration.instructions,
      })
      setMemories(editingIntegration.memories || [])
    } else {
      reset({
        name: '',
        github_links: [{ value: '' }],
        instructions: '',
      })
      setMemories([])
    }
    setLinkValidations({})
  }, [editingIntegration, reset, isOpen])

  const handleDeleteMemory = async (memoryId: string) => {
    if (!editingIntegration) return
    
    setDeletingMemoryId(memoryId)
    try {
      await deleteMemory(editingIntegration.id, memoryId)
      setMemories(prev => prev.filter(m => m.id !== memoryId))
      toast.success('Memory deleted')
      onMemoryDelete?.()
    } catch {
      toast.error('Failed to delete memory')
    } finally {
      setDeletingMemoryId(null)
    }
  }

  const handleFormSubmit = (data: FormData) => {
    onSubmit({
      name: data.name,
      github_links: data.github_links.map(l => l.value).filter(v => v.trim() !== ''),
      instructions: data.instructions,
    })
  }

  const handleRemoveLink = (index: number) => {
    remove(index)
    setLinkValidations(prev => {
      const newValidations: Record<number, LinkValidation> = {}
      Object.entries(prev).forEach(([key, value]) => {
        const keyNum = parseInt(key)
        if (keyNum < index) {
          newValidations[keyNum] = value
        } else if (keyNum > index) {
          newValidations[keyNum - 1] = value
        }
      })
      return newValidations
    })
  }

  const handleLinkGitHub = () => {
    if (onOpenSettings) {
      onClose()
      onOpenSettings()
    } else {
      toast.info('Go to Settings to add your GitHub Personal Access Token')
    }
  }

  const getStatusIcon = (index: number) => {
    const validation = linkValidations[index]
    if (!validation) return null

    switch (validation.status) {
      case 'checking':
        return <Loader2 size={16} className="text-text-muted animate-spin" />
      case 'public':
        return <Check size={16} className="text-green-400" />
      case 'private':
        if (githubStatus?.connected) {
          return (
            <span title="Private repository (you have access)">
              <Lock size={16} className="text-amber-400" />
            </span>
          )
        }
        return (
          <button
            type="button"
            onClick={() => setShowGitHubPrompt(true)}
            className="text-amber-400 hover:text-amber-300 transition-colors"
            title="Repository is private - click to link GitHub"
          >
            <AlertCircle size={16} />
          </button>
        )
      case 'invalid':
        return (
          <span title={validation.error}>
            <AlertCircle size={16} className="text-red-400" />
          </span>
        )
      default:
        return null
    }
  }

  const getInputBorderClass = (index: number) => {
    const validation = linkValidations[index]
    if (!validation) return ''

    switch (validation.status) {
      case 'public':
        return 'border-green-500/50 focus:border-green-500 focus:ring-green-500/30'
      case 'private':
        return 'border-amber-500/50 focus:border-amber-500 focus:ring-amber-500/30'
      case 'invalid':
        return 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30'
      default:
        return ''
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-lg font-semibold text-text-primary">
                  {editingIntegration ? 'Edit Integration' : 'Add Integration'}
                </h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Integration Name
                  </label>
                  <input
                    {...register('name', { required: 'Name is required' })}
                    placeholder="e.g., Stripe, Slack, n8n"
                    className="input"
                  />
                  {errors.name && (
                    <p className="mt-1.5 text-sm text-red-400">{errors.name.message}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-text-secondary">
                      GitHub Repositories
                    </label>
                    {githubStatus?.connected ? (
                      <span className="text-xs text-green-400 flex items-center gap-1">
                        <Check size={12} />
                        Connected as {githubStatus.username}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleLinkGitHub}
                        className="text-xs text-accent hover:text-accent-hover flex items-center gap-1 transition-colors"
                      >
                        <Github size={12} />
                        Link GitHub
                      </button>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    {fields.map((field, index) => (
                      <div key={field.id}>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Github size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                            <input
                              {...register(`github_links.${index}.value`)}
                              placeholder="https://github.com/owner/repo"
                              className={`input pl-10 pr-10 ${getInputBorderClass(index)}`}
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              {getStatusIcon(index)}
                            </div>
                          </div>
                          {fields.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveLink(index)}
                              className="p-3 rounded-lg bg-surface border border-border hover:border-red-500/50 hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                        {linkValidations[index]?.status === 'invalid' && linkValidations[index]?.error && (
                          <p className="mt-1 text-sm text-red-400">{linkValidations[index].error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => append({ value: '' })}
                      className="flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors"
                    >
                      <Plus size={14} />
                      Add manually
                    </button>
                    {githubStatus?.connected && (
                      <>
                        <span className="text-text-muted">•</span>
                        <button
                          type="button"
                          onClick={() => setShowRepoSelector(true)}
                          className="flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors"
                        >
                          <Search size={14} />
                          Browse repositories
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Integration Instructions
                  </label>
                  <textarea
                    {...register('instructions')}
                    placeholder="Describe how this integration works, any specific update patterns, or relevant documentation links..."
                    rows={5}
                    className="textarea"
                  />
                </div>

                {/* Memories Section - only show when editing and has memories */}
                {editingIntegration && memories.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2 flex items-center gap-1.5">
                      <Brain size={14} />
                      Memories
                    </label>
                    <div className="space-y-2">
                      {memories.map((memory) => (
                        <div
                          key={memory.id}
                          className="flex items-start gap-2 p-3 bg-surface-hover rounded-lg border border-border"
                        >
                          <p className="flex-1 text-sm text-text-secondary">{memory.content}</p>
                          <button
                            type="button"
                            onClick={() => handleDeleteMemory(memory.id)}
                            disabled={deletingMemoryId === memory.id}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors disabled:opacity-50"
                            title="Delete memory"
                          >
                            {deletingMemoryId === memory.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-text-muted">
                      Memories are learned from your conversations with the update agent.
                    </p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={onClose} className="btn-secondary flex-1">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary flex-1">
                    {editingIntegration ? 'Save Changes' : 'Add Integration'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>

          {/* GitHub Link Prompt Modal (for private repos) */}
          <AnimatePresence>
            {showGitHubPrompt && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/40 z-[60]"
                  onClick={() => setShowGitHubPrompt(false)}
                />
                <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-sm bg-surface border border-border rounded-xl p-6 shadow-2xl"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <Github className="w-5 h-5 text-amber-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-text-primary">Private Repository</h3>
                    </div>
                    <p className="text-text-secondary text-sm mb-6">
                      This repository appears to be private. To access private repositories, add your GitHub Personal Access Token in Settings.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowGitHubPrompt(false)}
                        className="btn-secondary flex-1"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          setShowGitHubPrompt(false)
                          handleLinkGitHub()
                        }}
                        className="btn-primary flex-1 flex items-center justify-center gap-2"
                      >
                        <Settings size={16} />
                        Open Settings
                      </button>
                    </div>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>

          {/* Repository Selector Modal */}
          <AnimatePresence>
            {showRepoSelector && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/40 z-[60]"
                  onClick={() => {
                    setShowRepoSelector(false)
                    setRepoSearch('')
                  }}
                />
                <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-md bg-surface border border-border rounded-xl shadow-2xl overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-border">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-text-primary">Select Repository</h3>
                        <button
                          onClick={() => {
                            setShowRepoSelector(false)
                            setRepoSearch('')
                          }}
                          className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                          type="text"
                          placeholder="Search repositories..."
                          value={repoSearch}
                          onChange={(e) => setRepoSearch(e.target.value)}
                          className="input pl-10"
                          autoFocus
                        />
                      </div>
                    </div>
                    
                    <div className="max-h-80 overflow-y-auto">
                      {loadingRepos ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="w-8 h-8 text-accent animate-spin" />
                        </div>
                      ) : filteredRepos.length === 0 ? (
                        <div className="text-center py-12 text-text-muted">
                          {repoSearch ? 'No repositories found' : 'No repositories available'}
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {filteredRepos.map((repo) => {
                            const selected = isRepoSelected(repo.html_url)
                            return (
                              <button
                                key={repo.id}
                                type="button"
                                onClick={() => handleSelectRepo(repo)}
                                disabled={selected}
                                className={`w-full px-4 py-3 text-left hover:bg-surface-hover transition-colors ${
                                  selected ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5">
                                    {repo.private ? (
                                      <Lock size={16} className="text-amber-400" />
                                    ) : (
                                      <Globe size={16} className="text-green-400" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-text-primary truncate">
                                        {repo.full_name}
                                      </span>
                                      {selected && (
                                        <span className="text-xs text-green-400 flex-shrink-0">
                                          Added
                                        </span>
                                      )}
                                    </div>
                                    {repo.description && (
                                      <p className="text-sm text-text-muted truncate mt-0.5">
                                        {repo.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  )
}
