import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm, useFieldArray } from 'react-hook-form'
import { X, Plus, Trash2, Github, Check, AlertCircle, Loader2 } from 'lucide-react'
import type { Integration, IntegrationCreate } from '../types'
import { checkGitHubRepo, type RepoCheckResponse } from '../api/github'

interface AddIntegrationModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: IntegrationCreate) => void
  editingIntegration?: Integration | null
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

export function AddIntegrationModal({ isOpen, onClose, onSubmit, editingIntegration }: AddIntegrationModalProps) {
  const [linkValidations, setLinkValidations] = useState<Record<number, LinkValidation>>({})
  const [showGitHubPrompt, setShowGitHubPrompt] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
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
        setLinkValidations(prev => ({
          ...prev,
          [index]: { status: 'private', repoName: result.repo_name || undefined, error: result.error || undefined }
        }))
      }
    } catch {
      setLinkValidations(prev => ({
        ...prev,
        [index]: { status: 'invalid', error: 'Failed to check repository' }
      }))
    }
  }, [])

  // Watch for link changes and validate with debounce
  useEffect(() => {
    const timeouts: NodeJS.Timeout[] = []
    
    watchedLinks.forEach((link, index) => {
      const timeout = setTimeout(() => {
        validateLink(index, link.value)
      }, 500) // 500ms debounce
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
    } else {
      reset({
        name: '',
        github_links: [{ value: '' }],
        instructions: '',
      })
    }
    setLinkValidations({})
  }, [editingIntegration, reset, isOpen])

  const handleFormSubmit = (data: FormData) => {
    onSubmit({
      name: data.name,
      github_links: data.github_links.map(l => l.value).filter(v => v.trim() !== ''),
      instructions: data.instructions,
    })
  }

  const handleRemoveLink = (index: number) => {
    remove(index)
    // Clean up validation state
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

  const getStatusIcon = (index: number) => {
    const validation = linkValidations[index]
    if (!validation) return null

    switch (validation.status) {
      case 'checking':
        return <Loader2 size={16} className="text-text-muted animate-spin" />
      case 'public':
        return <Check size={16} className="text-green-400" />
      case 'private':
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
        return <AlertCircle size={16} className="text-red-400" title={validation.error} />
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
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    GitHub Links
                  </label>
                  <div className="space-y-2">
                    {fields.map((field, index) => (
                      <div key={field.id} className="flex gap-2">
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
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => append({ value: '' })}
                    className="mt-2 flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors"
                  >
                    <Plus size={14} />
                    Add another link
                  </button>
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

          {/* GitHub Link Prompt Modal */}
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
                      This repository appears to be private. To access private repositories, you'll need to link your GitHub account.
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
                          // TODO: Implement GitHub OAuth
                          alert('GitHub OAuth coming soon!')
                          setShowGitHubPrompt(false)
                        }}
                        className="btn-primary flex-1 flex items-center justify-center gap-2"
                      >
                        <Github size={16} />
                        Link GitHub
                      </button>
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
