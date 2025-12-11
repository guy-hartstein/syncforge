import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Github, FileText, Pencil, Trash2, Check, AlertCircle, Loader2, Brain, ChevronDown, X } from 'lucide-react'
import type { Integration, Memory } from '../types'
import { checkGitHubRepo } from '../api/github'
import { deleteMemory } from '../api/integrations'
import { useToast } from './Toast'

interface IntegrationCardProps {
  integration: Integration
  onEdit: (integration: Integration) => void
  onDelete: (id: string) => void
  onMemoryDelete?: () => void
  index: number
}

type LinkStatus = 'checking' | 'public' | 'private' | 'invalid'

export function IntegrationCard({ integration, onEdit, onDelete, onMemoryDelete, index }: IntegrationCardProps) {
  const [linkStatuses, setLinkStatuses] = useState<Record<string, LinkStatus>>({})
  const [showMemories, setShowMemories] = useState(false)
  const [memories, setMemories] = useState<Memory[]>(integration.memories || [])
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null)
  const toast = useToast()
  
  const linkCount = integration.github_links.length
  const hasInstructions = integration.instructions.trim().length > 0
  const memoryCount = memories.length

  // Sync memories when integration prop changes
  useEffect(() => {
    setMemories(integration.memories || [])
  }, [integration.memories])

  const handleDeleteMemory = async (e: React.MouseEvent, memoryId: string) => {
    e.stopPropagation()
    setDeletingMemoryId(memoryId)
    try {
      await deleteMemory(integration.id, memoryId)
      setMemories(prev => prev.filter(m => m.id !== memoryId))
      toast.success('Memory deleted')
      onMemoryDelete?.()
    } catch {
      toast.error('Failed to delete memory')
    } finally {
      setDeletingMemoryId(null)
    }
  }

  useEffect(() => {
    const checkLinks = async () => {
      for (const link of integration.github_links) {
        if (linkStatuses[link]) continue // Skip if already checked
        
        setLinkStatuses(prev => ({ ...prev, [link]: 'checking' }))
        
        try {
          const result = await checkGitHubRepo(link)
          
          if (!result.is_valid) {
            setLinkStatuses(prev => ({ ...prev, [link]: 'invalid' }))
          } else if (result.is_public) {
            setLinkStatuses(prev => ({ ...prev, [link]: 'public' }))
          } else {
            setLinkStatuses(prev => ({ ...prev, [link]: 'private' }))
          }
        } catch {
          setLinkStatuses(prev => ({ ...prev, [link]: 'invalid' }))
        }
      }
    }

    checkLinks()
  }, [integration.github_links])

  const getStatusIcon = (link: string) => {
    const status = linkStatuses[link]
    
    switch (status) {
      case 'checking':
        return <Loader2 size={12} className="text-text-muted animate-spin flex-shrink-0" />
      case 'public':
        return <Check size={12} className="text-green-400 flex-shrink-0" />
      case 'private':
        return <AlertCircle size={12} className="text-amber-400 flex-shrink-0" title="Private repository" />
      case 'invalid':
        return <AlertCircle size={12} className="text-red-400 flex-shrink-0" title="Invalid or inaccessible" />
      default:
        return null
    }
  }

  const getStatusTextClass = (link: string) => {
    const status = linkStatuses[link]
    switch (status) {
      case 'public':
        return 'text-text-muted hover:text-accent'
      case 'private':
        return 'text-amber-400/70 hover:text-amber-400'
      case 'invalid':
        return 'text-red-400/70 hover:text-red-400'
      default:
        return 'text-text-muted hover:text-accent'
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="card group relative"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <span className="text-accent font-semibold text-lg">
              {integration.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <h3 className="font-semibold text-text-primary">{integration.name}</h3>
        </div>
        
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(integration)}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={() => onDelete(integration.id)}
            className="p-2 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm text-text-secondary">
        <div className="flex items-center gap-1.5">
          <Github size={14} className="text-text-muted" />
          <span>{linkCount} {linkCount === 1 ? 'link' : 'links'}</span>
        </div>
        {hasInstructions && (
          <div className="flex items-center gap-1.5">
            <FileText size={14} className="text-text-muted" />
            <span>Instructions</span>
          </div>
        )}
        {memoryCount > 0 && (
          <button
            onClick={() => setShowMemories(!showMemories)}
            className="flex items-center gap-1.5 hover:text-accent transition-colors"
          >
            <Brain size={14} className="text-accent" />
            <span>{memoryCount} {memoryCount === 1 ? 'memory' : 'memories'}</span>
            <ChevronDown 
              size={12} 
              className={`transition-transform ${showMemories ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>

      {/* Memories Section */}
      <AnimatePresence>
        {showMemories && memories.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-border space-y-2">
              {memories.map((memory) => (
                <div
                  key={memory.id}
                  className="flex items-start gap-2 p-2 bg-accent/5 rounded-lg text-sm group/memory"
                >
                  <Brain size={14} className="text-accent mt-0.5 flex-shrink-0" />
                  <p className="flex-1 text-text-secondary">{memory.content}</p>
                  <button
                    onClick={(e) => handleDeleteMemory(e, memory.id)}
                    disabled={deletingMemoryId === memory.id}
                    className="p-1 rounded opacity-0 group-hover/memory:opacity-100 hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-all disabled:opacity-50"
                    title="Delete memory"
                  >
                    {deletingMemoryId === memory.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <X size={12} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {integration.github_links.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="space-y-2">
            {integration.github_links.slice(0, 2).map((link, i) => (
              <div key={i} className="flex items-center gap-2">
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex-1 text-sm truncate transition-colors font-mono ${getStatusTextClass(link)}`}
                >
                  {link.replace('https://github.com/', '')}
                </a>
                {getStatusIcon(link)}
              </div>
            ))}
            {integration.github_links.length > 2 && (
              <span className="text-xs text-text-muted">
                +{integration.github_links.length - 2} more
              </span>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}
