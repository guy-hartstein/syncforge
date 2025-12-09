import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Upload, X, FileText, Github, ExternalLink, Plus } from 'lucide-react'
import type { Attachment } from '../../api/wizard'

interface AttachmentPanelProps {
  attachments: Attachment[]
  onUploadFile: (file: File) => void
  onAddUrl: (url: string) => void
  onRemove: (id: string) => void
  isUploading: boolean
}

export function AttachmentPanel({
  attachments,
  onUploadFile,
  onAddUrl,
  onRemove,
  isUploading
}: AttachmentPanelProps) {
  const [urlInput, setUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = Array.from(e.dataTransfer.files)
    files.forEach(file => onUploadFile(file))
  }, [onUploadFile])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    files.forEach(file => onUploadFile(file))
    e.target.value = ''
  }

  const handleAddUrl = () => {
    if (urlInput.trim()) {
      onAddUrl(urlInput.trim())
      setUrlInput('')
      setShowUrlInput(false)
    }
  }

  const isGitHubPR = (url: string) => {
    return url.includes('github.com') && url.includes('/pull/')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-secondary">Attachments</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowUrlInput(true)}
            className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
            title="Add URL"
          >
            <Link2 size={16} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
            title="Upload file"
          >
            <Upload size={16} />
          </button>
        </div>
      </div>

      {/* URL Input */}
      <AnimatePresence>
        {showUrlInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://github.com/owner/repo/pull/123"
                className="input flex-1 text-sm py-2"
                onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                autoFocus
              />
              <button
                onClick={handleAddUrl}
                disabled={!urlInput.trim()}
                className="btn-primary px-3 py-2 disabled:opacity-50"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={() => { setShowUrlInput(false); setUrlInput('') }}
                className="btn-secondary px-3 py-2"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
          isDragging
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-border-light'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <p className="text-sm text-text-muted">
          {isDragging ? 'Drop files here' : 'Drag & drop files or click to upload'}
        </p>
      </div>

      {/* Attachment list */}
      <div className="space-y-2">
        <AnimatePresence>
          {attachments.map((attachment) => (
            <motion.div
              key={attachment.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-border group"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                isGitHubPR(attachment.url || '')
                  ? 'bg-green-500/10'
                  : attachment.type === 'url'
                  ? 'bg-blue-500/10'
                  : 'bg-amber-500/10'
              }`}>
                {isGitHubPR(attachment.url || '') ? (
                  <Github size={16} className="text-green-400" />
                ) : attachment.type === 'url' ? (
                  <ExternalLink size={16} className="text-blue-400" />
                ) : (
                  <FileText size={16} className="text-amber-400" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">{attachment.name}</p>
                {attachment.url && (
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-text-muted hover:text-accent truncate block"
                  >
                    {attachment.url}
                  </a>
                )}
              </div>

              <button
                onClick={() => onRemove(attachment.id)}
                className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-all"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {isUploading && (
          <div className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-border">
            <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-sm text-text-muted">Uploading...</p>
          </div>
        )}
      </div>
    </div>
  )
}

