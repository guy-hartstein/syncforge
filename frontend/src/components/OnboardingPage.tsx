import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Layers, Rocket, RefreshCw, Settings } from 'lucide-react'
import { Logo } from './Logo'
import { IntegrationCard } from './IntegrationCard'
import { AddIntegrationModal } from './AddIntegrationModal'
import { UpdateWizard } from './UpdateWizard'
import { UpdateCard } from './UpdateCard'
import { SettingsModal } from './SettingsModal'
import { useConfirm } from './ConfirmDialog'
import { fetchIntegrations, createIntegration, updateIntegration, deleteIntegration } from '../api/integrations'
import { fetchUpdates, deleteUpdate } from '../api/updates'
import type { Integration, IntegrationCreate } from '../types'

export function OnboardingPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null)
  const queryClient = useQueryClient()
  const confirm = useConfirm()

  const { data: integrations = [], isLoading: integrationsLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: fetchIntegrations,
  })

  const { data: updates = [], isLoading: updatesLoading } = useQuery({
    queryKey: ['updates'],
    queryFn: fetchUpdates,
    // Poll every 2 seconds while any update is still creating
    refetchInterval: (query) => {
      const data = query.state.data
      if (data?.some(u => u.status === 'creating')) {
        return 2000
      }
      return false
    },
  })

  const createMutation = useMutation({
    mutationFn: createIntegration,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      setIsModalOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: IntegrationCreate }) => updateIntegration(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      setIsModalOpen(false)
      setEditingIntegration(null)
    },
  })

  const deleteIntegrationMutation = useMutation({
    mutationFn: deleteIntegration,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
    },
  })

  const deleteUpdateMutation = useMutation({
    mutationFn: deleteUpdate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
  })

  const handleOpenModal = (integration?: Integration) => {
    setEditingIntegration(integration ?? null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingIntegration(null)
  }

  const handleSubmit = (data: IntegrationCreate) => {
    if (editingIntegration) {
      updateMutation.mutate({ id: editingIntegration.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleDeleteIntegration = async (id: string) => {
    const confirmed = await confirm({
      title: 'Delete Integration',
      message: 'Are you sure you want to delete this integration? This action cannot be undone.',
      confirmText: 'Delete',
      variant: 'danger',
    })
    if (confirmed) {
      deleteIntegrationMutation.mutate(id)
    }
  }

  const handleDeleteUpdate = async (id: string) => {
    const confirmed = await confirm({
      title: 'Delete Update',
      message: 'Are you sure you want to delete this update? All associated agent progress will be lost.',
      confirmText: 'Delete',
      variant: 'danger',
    })
    if (confirmed) {
      deleteUpdateMutation.mutate(id)
    }
  }

  const handleUpdateCreated = () => {
    queryClient.invalidateQueries({ queryKey: ['updates'] })
    setIsWizardOpen(false)
  }

  const isLoading = integrationsLoading || updatesLoading

  return (
    <div className="min-h-screen bg-background">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent pointer-events-none" />
      
      {/* Logo in top right */}
      <div className="fixed top-6 right-6 pointer-events-none opacity-20">
        <Logo size={120} />
      </div>
      
      <div className="relative max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-text-primary">SyncForge</h1>
              <p className="text-sm text-text-muted">Manage and update your integrations</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
                title="Settings"
              >
                <Settings size={20} />
              </button>
              {integrations.length > 0 && (
                <button
                  onClick={() => setIsWizardOpen(true)}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Rocket size={18} />
                  Update Integrations
                </button>
              )}
              <button onClick={() => handleOpenModal()} className="btn-primary flex items-center gap-2">
                <Plus size={18} />
                Add Integration
              </button>
            </div>
          </div>
        </motion.header>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Updates Section */}
            {updates.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-12"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-text-muted" />
                    <h2 className="text-lg font-semibold text-text-primary">Updates</h2>
                    <span className="text-sm text-text-muted">({updates.length})</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {updates.map((update, index) => (
                    <UpdateCard
                      key={update.id}
                      update={update}
                      onDelete={handleDeleteUpdate}
                      index={index}
                    />
                  ))}
                </div>
              </motion.section>
            )}

            {/* Integrations Section */}
            {integrations.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-20"
              >
                <div className="w-20 h-20 rounded-2xl bg-surface border border-border flex items-center justify-center mb-6">
                  <Layers className="w-10 h-10 text-text-muted" />
                </div>
                <h2 className="text-xl font-semibold text-text-primary mb-2">No integrations yet</h2>
                <p className="text-text-secondary mb-6 text-center max-w-md">
                  Add your first integration to get started. Include GitHub links and instructions for each integration.
                </p>
                <button onClick={() => handleOpenModal()} className="btn-primary flex items-center gap-2">
                  <Plus size={18} />
                  Add your first integration
                </button>
              </motion.div>
            ) : (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: updates.length > 0 ? 0.1 : 0 }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-text-muted" />
                    <h2 className="text-lg font-semibold text-text-primary">Integrations</h2>
                    <span className="text-sm text-text-muted">({integrations.length})</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {integrations.map((integration, index) => (
                    <IntegrationCard
                      key={integration.id}
                      integration={integration}
                      onEdit={handleOpenModal}
                      onDelete={handleDeleteIntegration}
                      index={index}
                    />
                  ))}
                </div>
              </motion.section>
            )}
          </>
        )}
      </div>

      <AddIntegrationModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        editingIntegration={editingIntegration}
      />

      <UpdateWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onUpdateCreated={handleUpdateCreated}
        integrations={integrations}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  )
}

