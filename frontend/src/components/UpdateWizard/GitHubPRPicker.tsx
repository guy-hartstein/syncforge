import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, Github, GitPullRequest, ChevronLeft, Lock, Globe, GitBranch, User, AlertCircle } from 'lucide-react'
import { listGitHubRepos, listRepoPullRequests, getGitHubStatus, type GitHubRepo, type GitHubPullRequest } from '../../api/github'

interface GitHubPRPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelectPR: (pr: { url: string; title: string; number: number; repo: string }) => void
}

export function GitHubPRPicker({ isOpen, onClose, onSelectPR }: GitHubPRPickerProps) {
  const [isConnected, setIsConnected] = useState<boolean | null>(null)
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [pullRequests, setPullRequests] = useState<GitHubPullRequest[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [prSearchQuery, setPrSearchQuery] = useState('')
  const [prFilter, setPrFilter] = useState<'open' | 'closed' | 'all'>('open')
  const [isLoadingRepos, setIsLoadingRepos] = useState(false)
  const [isLoadingPRs, setIsLoadingPRs] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check connection and load repos
  useEffect(() => {
    if (isOpen) {
      checkConnectionAndLoadRepos()
    }
  }, [isOpen])

  // Load PRs when repo is selected or filter changes
  useEffect(() => {
    if (selectedRepo) {
      loadPullRequests()
    }
  }, [selectedRepo, prFilter])

  const checkConnectionAndLoadRepos = async () => {
    try {
      setIsLoadingRepos(true)
      setError(null)
      const status = await getGitHubStatus()
      setIsConnected(status.connected)
      
      if (status.connected) {
        const repoList = await listGitHubRepos()
        setRepos(repoList)
      }
    } catch (err) {
      setError('Failed to load GitHub data')
      setIsConnected(false)
    } finally {
      setIsLoadingRepos(false)
    }
  }

  const loadPullRequests = async () => {
    if (!selectedRepo) return
    
    try {
      setIsLoadingPRs(true)
      setError(null)
      const [owner, repo] = selectedRepo.full_name.split('/')
      const prs = await listRepoPullRequests(owner, repo, prFilter)
      setPullRequests(prs)
    } catch (err) {
      setError('Failed to load pull requests')
      setPullRequests([])
    } finally {
      setIsLoadingPRs(false)
    }
  }

  const filteredRepos = useMemo(() => {
    if (!searchQuery.trim()) return repos
    const query = searchQuery.toLowerCase()
    return repos.filter(repo => 
      repo.full_name.toLowerCase().includes(query) ||
      repo.description?.toLowerCase().includes(query)
    )
  }, [repos, searchQuery])

  const filteredPRs = useMemo(() => {
    if (!prSearchQuery.trim()) return pullRequests
    const query = prSearchQuery.toLowerCase()
    return pullRequests.filter(pr => 
      pr.title.toLowerCase().includes(query) ||
      pr.number.toString().includes(query) ||
      pr.user_login.toLowerCase().includes(query) ||
      pr.head_ref.toLowerCase().includes(query)
    )
  }, [pullRequests, prSearchQuery])

  const handleSelectPR = (pr: GitHubPullRequest) => {
    onSelectPR({
      url: pr.html_url,
      title: pr.title,
      number: pr.number,
      repo: selectedRepo!.full_name
    })
    handleClose()
  }

  const handleClose = () => {
    setSelectedRepo(null)
    setSearchQuery('')
    setPrSearchQuery('')
    setPullRequests([])
    setError(null)
    onClose()
  }

  const handleBack = () => {
    setSelectedRepo(null)
    setPullRequests([])
    setSearchQuery('')
    setPrSearchQuery('')
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
                  {selectedRepo && (
                    <button
                      onClick={handleBack}
                      className="p-1.5 -ml-1.5 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
                    >
                      <ChevronLeft size={18} />
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <Github size={20} className="text-text-muted" />
                    <h3 className="font-semibold text-text-primary">
                      {selectedRepo ? selectedRepo.full_name : 'Link Pull Request'}
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
                    <h4 className="font-medium text-text-primary mb-2">GitHub Not Connected</h4>
                    <p className="text-sm text-text-muted">
                      Connect your GitHub account in Settings to link pull requests.
                    </p>
                  </div>
                ) : isLoadingRepos ? (
                  <div className="p-8 text-center">
                    <div className="w-8 h-8 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    <p className="mt-4 text-sm text-text-muted">Loading repositories...</p>
                  </div>
                ) : error ? (
                  <div className="p-8 text-center">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                      <AlertCircle size={24} className="text-red-400" />
                    </div>
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                ) : !selectedRepo ? (
                  // Repo List
                  <div>
                    <div className="p-3 border-b border-border sticky top-0 bg-background">
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          placeholder="Search repositories..."
                          className="input pl-9 py-2 text-sm w-full"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="divide-y divide-border">
                      {filteredRepos.length === 0 ? (
                        <div className="p-8 text-center text-text-muted text-sm">
                          {searchQuery ? 'No repositories match your search' : 'No repositories found'}
                        </div>
                      ) : (
                        filteredRepos.map(repo => (
                          <button
                            key={repo.id}
                            onClick={() => setSelectedRepo(repo)}
                            className="w-full px-4 py-3 text-left hover:bg-surface-hover transition-colors group"
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center flex-shrink-0 group-hover:bg-accent/10 transition-colors">
                                {repo.private ? (
                                  <Lock size={14} className="text-text-muted group-hover:text-accent" />
                                ) : (
                                  <Globe size={14} className="text-text-muted group-hover:text-accent" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-text-primary truncate">{repo.full_name}</p>
                                {repo.description && (
                                  <p className="text-xs text-text-muted truncate mt-0.5">{repo.description}</p>
                                )}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  // PR List
                  <div>
                    <div className="p-3 border-b border-border sticky top-0 bg-background space-y-3">
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                          type="text"
                          value={prSearchQuery}
                          onChange={e => setPrSearchQuery(e.target.value)}
                          placeholder="Search pull requests..."
                          className="input pl-9 py-2 text-sm w-full"
                          autoFocus
                        />
                      </div>
                      <div className="flex gap-2">
                        {(['open', 'closed', 'all'] as const).map(state => (
                          <button
                            key={state}
                            onClick={() => setPrFilter(state)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                              prFilter === state
                                ? 'bg-accent text-background'
                                : 'bg-surface hover:bg-surface-hover text-text-secondary'
                            }`}
                          >
                            {state.charAt(0).toUpperCase() + state.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {isLoadingPRs ? (
                      <div className="p-8 text-center">
                        <div className="w-8 h-8 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
                        <p className="mt-4 text-sm text-text-muted">Loading pull requests...</p>
                      </div>
                    ) : pullRequests.length === 0 ? (
                      <div className="p-8 text-center">
                        <GitPullRequest size={32} className="mx-auto text-text-muted mb-3 opacity-50" />
                        <p className="text-sm text-text-muted">
                          No {prFilter === 'all' ? '' : prFilter} pull requests
                        </p>
                      </div>
                    ) : filteredPRs.length === 0 ? (
                      <div className="p-8 text-center">
                        <Search size={32} className="mx-auto text-text-muted mb-3 opacity-50" />
                        <p className="text-sm text-text-muted">
                          No pull requests match your search
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {filteredPRs.map(pr => (
                          <button
                            key={pr.id}
                            onClick={() => handleSelectPR(pr)}
                            className="w-full px-4 py-3 text-left hover:bg-surface-hover transition-colors group"
                          >
                            <div className="flex items-start gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                                pr.state === 'open'
                                  ? 'bg-green-500/10 group-hover:bg-green-500/20'
                                  : 'bg-purple-500/10 group-hover:bg-purple-500/20'
                              }`}>
                                <GitPullRequest size={14} className={
                                  pr.state === 'open' ? 'text-green-400' : 'text-purple-400'
                                } />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-text-muted text-xs">#{pr.number}</span>
                                  {pr.draft && (
                                    <span className="px-1.5 py-0.5 text-[10px] bg-surface rounded text-text-muted">
                                      Draft
                                    </span>
                                  )}
                                </div>
                                <p className="font-medium text-text-primary truncate">{pr.title}</p>
                                <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                                  <span className="flex items-center gap-1">
                                    <User size={10} />
                                    {pr.user_login}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <GitBranch size={10} />
                                    {pr.head_ref}
                                  </span>
                                  <span>updated {formatDate(pr.updated_at)}</span>
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
