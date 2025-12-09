import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Rocket } from 'lucide-react'
import { ChatInterface } from './ChatInterface'
import { AttachmentPanel } from './AttachmentPanel'
import { IntegrationSelector } from './IntegrationSelector'
import { IntegrationSettings } from './IntegrationSettings'
import {
  startWizard,
  sendMessage,
  uploadFile,
  addUrl,
  removeAttachment,
  updateConfig,
  type ChatMessage,
  type Attachment
} from '../../api/wizard'
import type { Integration } from '../../types'

interface UpdateWizardProps {
  isOpen: boolean
  onClose: () => void
  integrations: Integration[]
}

export function UpdateWizard({ isOpen, onClose, integrations }: UpdateWizardProps) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [selectedIntegrations, setSelectedIntegrations] = useState<string[]>([])
  const [integrationConfigs, setIntegrationConfigs] = useState<Record<string, string>>({})
  const [readyToProceed, setReadyToProceed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [settingsIntegration, setSettingsIntegration] = useState<Integration | null>(null)

  // Initialize wizard session
  useEffect(() => {
    if (isOpen && !sessionId) {
      initSession()
    }
  }, [isOpen, sessionId])

  const initSession = async () => {
    try {
      setIsLoading(true)
      const { session_id, initial_message } = await startWizard()
      setSessionId(session_id)
      setMessages([{ role: 'assistant', content: initial_message }])
    } catch (error) {
      console.error('Failed to start wizard:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendMessage = useCallback(async (message: string) => {
    if (!sessionId) return

    setMessages(prev => [...prev, { role: 'user', content: message }])
    setIsLoading(true)

    try {
      const response = await sendMessage(sessionId, message)
      setMessages(prev => [...prev, { role: 'assistant', content: response.response }])
      setReadyToProceed(response.ready_to_proceed)
    } catch (error) {
      console.error('Failed to send message:', error)
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, something went wrong. Please try again.' 
      }])
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  const handleUploadFile = useCallback(async (file: File) => {
    if (!sessionId) return

    setIsUploading(true)
    try {
      const attachment = await uploadFile(sessionId, file)
      setAttachments(prev => [...prev, attachment])
    } catch (error) {
      console.error('Failed to upload file:', error)
    } finally {
      setIsUploading(false)
    }
  }, [sessionId])

  const handleAddUrl = useCallback(async (url: string) => {
    if (!sessionId) return

    try {
      const attachment = await addUrl(sessionId, url)
      setAttachments(prev => [...prev, attachment])
    } catch (error) {
      console.error('Failed to add URL:', error)
    }
  }, [sessionId])

  const handleRemoveAttachment = useCallback(async (attachmentId: string) => {
    if (!sessionId) return

    try {
      await removeAttachment(sessionId, attachmentId)
      setAttachments(prev => prev.filter(a => a.id !== attachmentId))
    } catch (error) {
      console.error('Failed to remove attachment:', error)
    }
  }, [sessionId])

  const handleToggleIntegration = useCallback((id: string) => {
    setSelectedIntegrations(prev => {
      if (prev.length === 0) {
        // Currently "all selected", switch to all except this one
        return integrations.filter(i => i.id !== id).map(i => i.id)
      }
      if (prev.includes(id)) {
        const newSelection = prev.filter(i => i !== id)
        // If removing this makes it empty, keep at least this one
        return newSelection.length === 0 ? [id] : newSelection
      }
      return [...prev, id]
    })
  }, [integrations])

  const handleToggleAll = useCallback(() => {
    setSelectedIntegrations(prev => {
      if (prev.length === 0 || prev.length === integrations.length) {
        // Toggle off - but we need at least one, so just keep all
        return []
      }
      return []
    })
  }, [integrations])

  const handleSaveIntegrationConfig = useCallback((integrationId: string, instructions: string) => {
    setIntegrationConfigs(prev => ({
      ...prev,
      [integrationId]: instructions
    }))
  }, [])

  const handleStartUpdate = useCallback(async () => {
    if (!sessionId) return

    try {
      await updateConfig(sessionId, selectedIntegrations, integrationConfigs)
      // TODO: Trigger the actual update process
      alert('Update started! This will be implemented in the next phase.')
      onClose()
    } catch (error) {
      console.error('Failed to start update:', error)
    }
  }, [sessionId, selectedIntegrations, integrationConfigs, onClose])

  const handleClose = () => {
    setSessionId(null)
    setMessages([])
    setAttachments([])
    setSelectedIntegrations([])
    setIntegrationConfigs({})
    setReadyToProceed(false)
    onClose()
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
            onClick={handleClose}
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-5xl h-[85vh] bg-background border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Update Integrations</h2>
                  <p className="text-sm text-text-muted">Describe your changes and configure the update</p>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 flex overflow-hidden">
                {/* Left panel - Chat */}
                <div className="flex-1 border-r border-border flex flex-col">
                  <ChatInterface
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    isLoading={isLoading}
                  />
                </div>

                {/* Right panel - Configuration */}
                <div className="w-[380px] flex flex-col overflow-y-auto">
                  <div className="p-5 space-y-6">
                    <AttachmentPanel
                      attachments={attachments}
                      onUploadFile={handleUploadFile}
                      onAddUrl={handleAddUrl}
                      onRemove={handleRemoveAttachment}
                      isUploading={isUploading}
                    />
                    
                    <div className="border-t border-border pt-6">
                      <IntegrationSelector
                        integrations={integrations}
                        selectedIds={selectedIntegrations}
                        onToggle={handleToggleIntegration}
                        onToggleAll={handleToggleAll}
                        onOpenSettings={setSettingsIntegration}
                        integrationConfigs={integrationConfigs}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface">
                <p className="text-sm text-text-muted">
                  {selectedIntegrations.length === 0
                    ? `All ${integrations.length} integrations selected`
                    : `${selectedIntegrations.length} of ${integrations.length} integrations selected`}
                </p>
                <div className="flex gap-3">
                  <button onClick={handleClose} className="btn-secondary">
                    Cancel
                  </button>
                  <button
                    onClick={handleStartUpdate}
                    disabled={!readyToProceed}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Rocket size={16} />
                    Start Update
                  </button>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Integration Settings Modal */}
          <IntegrationSettings
            integration={settingsIntegration}
            isOpen={!!settingsIntegration}
            onClose={() => setSettingsIntegration(null)}
            onSave={handleSaveIntegrationConfig}
            currentInstructions={settingsIntegration ? (integrationConfigs[settingsIntegration.id] || '') : ''}
          />
        </>
      )}
    </AnimatePresence>
  )
}

