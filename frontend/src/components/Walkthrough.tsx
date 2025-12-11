import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HelpCircle, X, ChevronRight, ChevronLeft, Settings, Plus, Rocket, Layers, RefreshCw } from 'lucide-react'

interface WalkthroughStep {
  title: string
  description: string
  icon: React.ReactNode
  highlight?: string
}

const steps: WalkthroughStep[] = [
  {
    title: 'Welcome to SyncForge',
    description: 'SyncForge helps you manage and synchronize updates across multiple integrations. Let\'s walk through the main features.',
    icon: <Layers className="w-6 h-6" />,
  },
  {
    title: 'Configure Settings',
    description: 'First, set up your Cursor API key and GitHub token in Settings. The API key enables cloud agents, and GitHub connection allows access to private repositories.',
    icon: <Settings className="w-6 h-6" />,
    highlight: 'settings',
  },
  {
    title: 'Add Integrations',
    description: 'Click "Add Integration" to create a new integration. Provide the GitHub repository URL and any specific instructions for how updates should be applied.',
    icon: <Plus className="w-6 h-6" />,
    highlight: 'add-integration',
  },
  {
    title: 'Manage Integrations',
    description: 'Your integrations appear as cards. Each card shows the repository details and stored memories. Click the menu to edit, delete, or manage integration memory.',
    icon: <Layers className="w-6 h-6" />,
    highlight: 'integrations',
  },
  {
    title: 'Run Updates',
    description: 'Click "Update Integrations" to start the update wizard. Select which integrations to update, describe your changes, and let the AI agents handle the rest.',
    icon: <Rocket className="w-6 h-6" />,
    highlight: 'update-wizard',
  },
  {
    title: 'Track Progress',
    description: 'Active updates appear in the Updates section. Watch agents work in real-time, review their outputs, and manage the update lifecycle.',
    icon: <RefreshCw className="w-6 h-6" />,
    highlight: 'updates',
  },
]

export function Walkthrough() {
  const [isOpen, setIsOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  const handleOpen = useCallback(() => {
    setCurrentStep(0)
    setIsOpen(true)
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      handleClose()
    }
  }, [currentStep, handleClose])

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }, [currentStep])

  const step = steps[currentStep]
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === steps.length - 1

  return (
    <>
      {/* Help Button */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 }}
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-30 p-3 rounded-full bg-surface border border-border shadow-lg
                   hover:bg-surface-hover hover:border-border-light hover:scale-105
                   transition-all duration-200 group"
        title="Help & Walkthrough"
      >
        <HelpCircle className="w-5 h-5 text-text-muted group-hover:text-accent transition-colors" />
      </motion.button>

      {/* Walkthrough Modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
              onClick={handleClose}
            />

            {/* Modal */}
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-lg bg-background border border-border rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-accent/10 text-accent">
                      {step.icon}
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-text-primary">{step.title}</h2>
                      <p className="text-xs text-text-muted">
                        Step {currentStep + 1} of {steps.length}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Content */}
                <div className="p-6">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={currentStep}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className="text-text-secondary leading-relaxed"
                    >
                      {step.description}
                    </motion.p>
                  </AnimatePresence>

                  {/* Step Indicators */}
                  <div className="flex items-center justify-center gap-2 mt-6">
                    {steps.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentStep(index)}
                        className={`w-2 h-2 rounded-full transition-all duration-200 ${
                          index === currentStep
                            ? 'w-6 bg-accent'
                            : index < currentStep
                            ? 'bg-accent/50'
                            : 'bg-border hover:bg-border-light'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface">
                  <button
                    onClick={handlePrev}
                    disabled={isFirstStep}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      isFirstStep
                        ? 'text-text-muted cursor-not-allowed'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                    }`}
                  >
                    <ChevronLeft size={18} />
                    Back
                  </button>
                  <button
                    onClick={handleNext}
                    className="btn-primary flex items-center gap-2"
                  >
                    {isLastStep ? 'Get Started' : 'Next'}
                    {!isLastStep && <ChevronRight size={18} />}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
