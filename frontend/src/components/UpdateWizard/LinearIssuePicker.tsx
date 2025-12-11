import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, ChevronLeft, AlertCircle, Tag, User, CheckCircle2 } from 'lucide-react'
import { listLinearTeams, listTeamIssues, getLinearStatus, type LinearTeam, type LinearIssue } from '../../api/linear'

interface LinearIssuePickerProps {
  isOpen: boolean
  onClose: () => void
  onSelectIssue: (issue: { id: string; identifier: string; title: string; url: string }) => void
}

// Linear-style icon
function LinearIcon({ className }: { className?: string }) {
  return <img src="/linear.png" alt="Linear" className={className} />
}

const PRIORITY_COLORS: Record<number, string> = {
  0: 'text-text-muted',      // No priority
  1: 'text-red-400',         // Urgent
  2: 'text-orange-400',      // High
  3: 'text-yellow-400',      // Medium
  4: 'text-blue-400',        // Low
}

const PRIORITY_LABELS: Record<number, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
}

export function LinearIssuePicker({ isOpen, onClose, onSelectIssue }: LinearIssuePickerProps) {
  const [isConnected, setIsConnected] = useState<boolean | null>(null)
  const [teams, setTeams] = useState<LinearTeam[]>([])
  const [selectedTeam, setSelectedTeam] = useState<LinearTeam | null>(null)
  const [issues, setIssues] = useState<LinearIssue[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [issueSearchQuery, setIssueSearchQuery] = useState('')
  const [issueFilter, setIssueFilter] = useState<'active' | 'completed' | 'all'>('active')
  const [isLoadingTeams, setIsLoadingTeams] = useState(false)
  const [isLoadingIssues, setIsLoadingIssues] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check connection and load teams
  useEffect(() => {
    if (isOpen) {
      checkConnectionAndLoadTeams()
    }
  }, [isOpen])

  // Load issues when team is selected or filter changes
  useEffect(() => {
    if (selectedTeam) {
      loadIssues()
    }
  }, [selectedTeam, issueFilter])

  const checkConnectionAndLoadTeams = async () => {
    try {
      setIsLoadingTeams(true)
      setError(null)
      const status = await getLinearStatus()
      setIsConnected(status.connected)
      
      if (status.connected) {
        const teamList = await listLinearTeams()
        setTeams(teamList)
      }
    } catch (err) {
      setError('Failed to load Linear data')
      setIsConnected(false)
    } finally {
      setIsLoadingTeams(false)
    }
  }

  const loadIssues = async () => {
    if (!selectedTeam) return
    
    try {
      setIsLoadingIssues(true)
      setError(null)
      const issueList = await listTeamIssues(selectedTeam.id, issueFilter)
      setIssues(issueList)
    } catch (err) {
      setError('Failed to load issues')
      setIssues([])
    } finally {
      setIsLoadingIssues(false)
    }
  }

  const filteredTeams = useMemo(() => {
    if (!searchQuery.trim()) return teams
    const query = searchQuery.toLowerCase()
    return teams.filter(team => 
      team.name.toLowerCase().includes(query) ||
      team.key.toLowerCase().includes(query)
    )
  }, [teams, searchQuery])

  const filteredIssues = useMemo(() => {
    if (!issueSearchQuery.trim()) return issues
    const query = issueSearchQuery.toLowerCase()
    return issues.filter(issue => 
      issue.title.toLowerCase().includes(query) ||
      issue.identifier.toLowerCase().includes(query) ||
      issue.description?.toLowerCase().includes(query) ||
      issue.assignee_name?.toLowerCase().includes(query)
    )
  }, [issues, issueSearchQuery])

  const handleSelectIssue = (issue: LinearIssue) => {
    onSelectIssue({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url
    })
    handleClose()
  }

  const handleClose = () => {
    setSelectedTeam(null)
    setSearchQuery('')
    setIssueSearchQuery('')
    setIssues([])
    setError(null)
    onClose()
  }

  const handleBack = () => {
    setSelectedTeam(null)
    setIssues([])
    setSearchQuery('')
    setIssueSearchQuery('')
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'today'
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return date.toLocaleDateString()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={handleClose}
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-background border border-border rounded-2xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-surface">
                <div className="flex items-center gap-3">
                  {selectedTeam && (
                    <button
                      onClick={handleBack}
                      className="p-1.5 -ml-1.5 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
                    >
                      <ChevronLeft size={18} />
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <LinearIcon className="w-5 h-5 text-[#5E6AD2]" />
                    <h3 className="font-semibold text-text-primary">
                      {selectedTeam ? selectedTeam.name : 'Link Linear Issue'}
                    </h3>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Content */}
              <div className="max-h-[60vh] overflow-y-auto">
                {!isConnected && isConnected !== null ? (
                  <div className="p-8 text-center">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
                      <AlertCircle size={24} className="text-amber-400" />
                    </div>
                    <h4 className="font-medium text-text-primary mb-2">Linear Not Connected</h4>
                    <p className="text-sm text-text-muted">
                      Connect your Linear account in Settings to link issues.
                    </p>
                  </div>
                ) : isLoadingTeams ? (
                  <div className="p-8 text-center">
                    <div className="w-8 h-8 mx-auto border-2 border-[#5E6AD2] border-t-transparent rounded-full animate-spin" />
                    <p className="mt-4 text-sm text-text-muted">Loading teams...</p>
                  </div>
                ) : error ? (
                  <div className="p-8 text-center">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                      <AlertCircle size={24} className="text-red-400" />
                    </div>
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                ) : !selectedTeam ? (
                  // Team List
                  <div>
                    <div className="p-3 border-b border-border sticky top-0 bg-background">
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          placeholder="Search teams..."
                          className="input pl-9 py-2 text-sm w-full"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="divide-y divide-border">
                      {filteredTeams.length === 0 ? (
                        <div className="p-8 text-center text-text-muted text-sm">
                          {searchQuery ? 'No teams match your search' : 'No teams found'}
                        </div>
                      ) : (
                        filteredTeams.map(team => (
                          <button
                            key={team.id}
                            onClick={() => setSelectedTeam(team)}
                            className="w-full px-4 py-3 text-left hover:bg-surface-hover transition-colors group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-[#5E6AD2]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#5E6AD2]/20 transition-colors">
                                <span className="text-xs font-semibold text-[#5E6AD2]">{team.key}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-text-primary truncate">{team.name}</p>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  // Issue List
                  <div>
                    <div className="p-3 border-b border-border sticky top-0 bg-background space-y-3">
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                          type="text"
                          value={issueSearchQuery}
                          onChange={e => setIssueSearchQuery(e.target.value)}
                          placeholder="Search issues..."
                          className="input pl-9 py-2 text-sm w-full"
                          autoFocus
                        />
                      </div>
                      <div className="flex gap-2">
                        {(['active', 'completed', 'all'] as const).map(state => (
                          <button
                            key={state}
                            onClick={() => setIssueFilter(state)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                              issueFilter === state
                                ? 'bg-[#5E6AD2] text-white'
                                : 'bg-surface hover:bg-surface-hover text-text-secondary'
                            }`}
                          >
                            {state.charAt(0).toUpperCase() + state.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {isLoadingIssues ? (
                      <div className="p-8 text-center">
                        <div className="w-8 h-8 mx-auto border-2 border-[#5E6AD2] border-t-transparent rounded-full animate-spin" />
                        <p className="mt-4 text-sm text-text-muted">Loading issues...</p>
                      </div>
                    ) : issues.length === 0 ? (
                      <div className="p-8 text-center">
                        <Tag size={32} className="mx-auto text-text-muted mb-3 opacity-50" />
                        <p className="text-sm text-text-muted">
                          No {issueFilter === 'all' ? '' : issueFilter} issues
                        </p>
                      </div>
                    ) : filteredIssues.length === 0 ? (
                      <div className="p-8 text-center">
                        <Search size={32} className="mx-auto text-text-muted mb-3 opacity-50" />
                        <p className="text-sm text-text-muted">
                          No issues match your search
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {filteredIssues.map(issue => (
                          <button
                            key={issue.id}
                            onClick={() => handleSelectIssue(issue)}
                            className="w-full px-4 py-3 text-left hover:bg-surface-hover transition-colors group"
                          >
                            <div className="flex items-start gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                                issue.state_name.toLowerCase().includes('done') || issue.state_name.toLowerCase().includes('completed')
                                  ? 'bg-green-500/10 group-hover:bg-green-500/20'
                                  : 'bg-[#5E6AD2]/10 group-hover:bg-[#5E6AD2]/20'
                              }`}>
                                {issue.state_name.toLowerCase().includes('done') || issue.state_name.toLowerCase().includes('completed') ? (
                                  <CheckCircle2 size={14} className="text-green-400" />
                                ) : (
                                  <LinearIcon className="w-3.5 h-3.5 text-[#5E6AD2]" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-text-muted text-xs font-mono">{issue.identifier}</span>
                                  {issue.priority > 0 && (
                                    <span className={`text-[10px] ${PRIORITY_COLORS[issue.priority]}`}>
                                      {PRIORITY_LABELS[issue.priority]}
                                    </span>
                                  )}
                                </div>
                                <p className="font-medium text-text-primary truncate">{issue.title}</p>
                                <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                                  <span className="px-1.5 py-0.5 bg-surface rounded text-[10px]">
                                    {issue.state_name}
                                  </span>
                                  {issue.assignee_name && (
                                    <span className="flex items-center gap-1">
                                      <User size={10} />
                                      {issue.assignee_name}
                                    </span>
                                  )}
                                  <span>updated {formatDate(issue.updated_at)}</span>
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
