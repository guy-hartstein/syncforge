import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import type { Integration } from '../../types'

interface IntegrationSettingsProps {
  integration: Integration | null
  isOpen: boolean
  onClose: () => void
  onSave: (integrationId: string, instructions: string) => void
  currentInstructions: string
}

export function IntegrationSettings({
  integration,
  isOpen,
  onClose,
  onSave,
  currentInstructions
}: IntegrationSettingsProps) {
  const [instructions, setInstructions] = useState('')

  useEffect(() => {
    setInstructions(currentInstructions)
  }, [currentInstructions, integration])

  const handleSave = () => {
    if (integration) {
      onSave(integration.id, instructions)
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && integration && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={onClose}
          />
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-surface border border-border rounded-xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div>
                  <h3 className="font-semibold text-text-primary">{integration.name}</h3>
                  <p className="text-xs text-text-muted">Custom update instructions</p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Instructions for this integration
                  </label>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Add any specific instructions for updating this integration..."
                    rows={5}
                    className="textarea"
                  />
                  <p className="mt-2 text-xs text-text-muted">
                    These instructions will be used in addition to the main update description.
                  </p>
                </div>

                {integration.instructions && (
                  <div className="p-3 rounded-lg bg-background border border-border">
                    <p className="text-xs font-medium text-text-muted mb-1">Original instructions:</p>
                    <p className="text-sm text-text-secondary line-clamp-3">{integration.instructions}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button onClick={onClose} className="btn-secondary flex-1">
                    Cancel
                  </button>
                  <button onClick={handleSave} className="btn-primary flex-1">
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

