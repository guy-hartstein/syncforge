import { useRef, useEffect } from 'react'
import { MessageSquare, Send, Loader2, User, Bot, RefreshCw } from 'lucide-react'
import { MarkdownContent } from './MarkdownContent'
import type { ConversationMessage } from '../../api/updates'

interface ConversationPanelProps {
  messages: ConversationMessage[]
  hasAgentId: boolean
  showInput: boolean
  inputValue: string
  onInputChange: (value: string) => void
  onSend: () => void
  isSending: boolean
  waitingForUpdate: boolean
  onRefresh: () => void
  isRefreshing: boolean
}

export function ConversationPanel({
  messages,
  hasAgentId,
  showInput,
  inputValue,
  onInputChange,
  onSend,
  isSending,
  waitingForUpdate,
  onRefresh,
  isRefreshing,
}: ConversationPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages.length])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-text-muted" />
          <span className="text-sm font-medium text-text-secondary">Conversation</span>
        </div>
        {hasAgentId && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg bg-surface-hover text-text-secondary hover:bg-surface hover:text-text-primary transition-colors disabled:opacity-50"
            title="Refresh conversation"
          >
            <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      <div className="h-96 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">
            {hasAgentId ? 'Agent is coding...' : 'No conversation yet. Start the agent to begin.'}
          </p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2 ${msg.type === 'user_message' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.type === 'assistant_message' && (
                <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <Bot size={16} className="text-accent" />
                </div>
              )}
              <div
                className={`max-w-[85%] px-4 py-3 rounded-xl ${
                  msg.type === 'user_message'
                    ? 'bg-accent text-white'
                    : 'bg-surface-hover text-text-primary'
                }`}
              >
                {msg.type === 'user_message' ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
                ) : (
                  <MarkdownContent content={msg.text} inlineCodeBg="bg-background" />
                )}
              </div>
              {msg.type === 'user_message' && (
                <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center flex-shrink-0">
                  <User size={16} className="text-text-muted" />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {showInput && (
        <div className="p-4 border-t border-border">
          {waitingForUpdate && (
            <div className="flex items-center gap-2 mb-3 text-sm text-text-muted">
              <Loader2 size={14} className="animate-spin" />
              <span>Waiting for agent to push changes...</span>
            </div>
          )}
          <div className="flex gap-3">
            <textarea
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a follow-up message..."
              rows={2}
              className="flex-1 px-4 py-3 bg-background border border-border rounded-xl text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-accent"
            />
            <button
              onClick={onSend}
              disabled={!inputValue.trim() || isSending}
              className="px-4 py-3 bg-accent text-white rounded-xl hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

