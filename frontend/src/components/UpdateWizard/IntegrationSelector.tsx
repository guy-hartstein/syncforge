import { motion } from 'framer-motion'
import { Settings, Check } from 'lucide-react'
import type { Integration } from '../../types'

interface IntegrationSelectorProps {
  integrations: Integration[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onToggleAll: () => void
  onOpenSettings: (integration: Integration) => void
  integrationConfigs: Record<string, string>
}

export function IntegrationSelector({
  integrations,
  selectedIds,
  onToggle,
  onToggleAll,
  onOpenSettings,
  integrationConfigs
}: IntegrationSelectorProps) {
  const allSelected = selectedIds.length === 0 || selectedIds.length === integrations.length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-secondary">Integrations to Update</h3>
        <button
          onClick={onToggleAll}
          className={`text-xs px-2 py-1 rounded-md transition-colors ${
            allSelected
              ? 'bg-accent/10 text-accent'
              : 'bg-surface hover:bg-surface-hover text-text-muted'
          }`}
        >
          {allSelected ? 'All Selected' : 'Select All'}
        </button>
      </div>

      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {integrations.map((integration, index) => {
          const isSelected = selectedIds.length === 0 || selectedIds.includes(integration.id)
          const hasCustomInstructions = !!integrationConfigs[integration.id]

          return (
            <motion.div
              key={integration.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-accent/5 border-accent/30'
                  : 'bg-surface border-border hover:border-border-light'
              }`}
              onClick={() => onToggle(integration.id)}
            >
              {/* Checkbox */}
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                  isSelected
                    ? 'bg-accent border-accent'
                    : 'border-border-light'
                }`}
              >
                {isSelected && <Check size={12} className="text-background" />}
              </div>

              {/* Integration info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{integration.name}</span>
                  {hasCustomInstructions && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                      Custom
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted truncate">
                  {integration.github_links.length} link{integration.github_links.length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Settings button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenSettings(integration)
                }}
                className={`p-2 rounded-lg transition-colors ${
                  hasCustomInstructions
                    ? 'bg-accent/10 text-accent hover:bg-accent/20'
                    : 'hover:bg-surface-hover text-text-muted hover:text-text-primary'
                }`}
                title="Custom instructions"
              >
                <Settings size={14} />
              </button>
            </motion.div>
          )
        })}
      </div>

      {integrations.length === 0 && (
        <p className="text-sm text-text-muted text-center py-4">
          No integrations added yet
        </p>
      )}
    </div>
  )
}

