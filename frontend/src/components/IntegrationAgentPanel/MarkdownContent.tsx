import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface MarkdownContentProps {
  content: string
  inlineCodeBg?: string
}

export function MarkdownContent({ content, inlineCodeBg = 'bg-surface' }: MarkdownContentProps) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="text-xl font-semibold text-text-primary mt-4 mb-3 leading-tight">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-lg font-semibold text-text-primary mt-4 mb-2 leading-tight">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-semibold text-text-primary mt-3 mb-2 leading-tight">{children}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-sm font-semibold text-text-primary mt-3 mb-1 leading-tight">{children}</h4>
        ),
        p: ({ children }) => (
          <p className="text-sm text-text-primary my-2 leading-relaxed">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="text-sm text-text-primary my-2 pl-4 list-disc">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="text-sm text-text-primary my-2 pl-4 list-decimal">{children}</ol>
        ),
        li: ({ children }) => <li className="my-0.5">{children}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold text-text-primary">{children}</strong>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline hover:text-accent/80 transition-colors"
          >
            {children}
          </a>
        ),
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          const isInline = !match && !String(children).includes('\n')
          return isInline ? (
            <code className={`text-accent ${inlineCodeBg} px-1.5 py-0.5 rounded text-xs`} {...props}>
              {children}
            </code>
          ) : (
            <SyntaxHighlighter
              style={oneDark}
              language={match?.[1] || 'text'}
              PreTag="div"
              customStyle={{
                margin: '0.75rem 0',
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
              }}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

