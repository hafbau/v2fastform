import React from 'react'
import { Message, MessageBinaryFormat } from '@v0-sdk/react'
import { sharedComponents } from './shared-components'

// Debug flag - set to true to see message content structure in console
const DEBUG_MESSAGES = process.env.NODE_ENV === 'development'

// Function to preprocess message content and remove V0_FILE markers and shell placeholders
function preprocessMessageContent(
  content: MessageBinaryFormat,
): MessageBinaryFormat {
  if (!Array.isArray(content)) return content

  // Debug: Log the raw content structure
  if (DEBUG_MESSAGES) {
    console.log('[MessageRenderer] Raw content structure:', JSON.stringify(content, null, 2))
  }

  const processed = content.map((row) => {
    if (!Array.isArray(row)) return row

    // Process text content to remove V0_FILE markers and shell placeholders
    return row.map((item) => {
      if (typeof item === 'string') {
        // Remove V0_FILE markers with various patterns
        let processed = item.replace(/\[V0_FILE\][^:]*:file="[^"]*"\n?/g, '')
        processed = processed.replace(/\[V0_FILE\][^\n]*\n?/g, '')

        // Remove shell placeholders with various patterns
        processed = processed.replace(/\.\.\. shell \.\.\./g, '')
        processed = processed.replace(/\.\.\.\s*shell\s*\.\.\./g, '')

        // Remove empty lines that might be left behind
        processed = processed.replace(/\n\s*\n\s*\n/g, '\n\n')
        processed = processed.replace(/^\s*\n+/g, '') // Remove leading empty lines
        processed = processed.replace(/\n+\s*$/g, '') // Remove trailing empty lines
        processed = processed.trim()

        // If the processed string is empty or only whitespace, return empty string
        if (!processed || processed.match(/^\s*$/)) {
          return ''
        }

        return processed
      }
      return item
    }) as [number, ...unknown[]] // Type assertion to match MessageBinaryFormat structure
  })

  // Filter out rows that are completely empty (all string content is empty)
  const filtered = processed.filter((row) => {
    if (!Array.isArray(row)) return true
    // Keep rows that have at least one non-empty string or non-string content
    const hasContent = row.slice(1).some((item) => {
      if (typeof item === 'string') return item.length > 0
      if (typeof item === 'object' && item !== null) return true
      return false
    })
    return hasContent
  })

  if (DEBUG_MESSAGES) {
    console.log('[MessageRenderer] Processed content:', JSON.stringify(filtered, null, 2))
  }

  return filtered as MessageBinaryFormat
}

interface MessageRendererProps {
  content: MessageBinaryFormat | string
  messageId?: string
  role: 'user' | 'assistant'
  className?: string
}

export function MessageRenderer({
  content,
  messageId,
  role,
  className,
}: MessageRendererProps) {
  // If content is a string (user message or fallback), render it as plain text
  if (typeof content === 'string') {
    return (
      <div className={className}>
        <p className="mb-4 text-gray-700 dark:text-gray-200 leading-relaxed">
          {content}
        </p>
      </div>
    )
  }

  // If content is MessageBinaryFormat (from v0 API), use the Message component
  // Preprocess content to remove V0_FILE markers and shell placeholders
  const processedContent = preprocessMessageContent(content)

  // If processed content is empty, show a fallback
  if (!processedContent || processedContent.length === 0) {
    if (DEBUG_MESSAGES) {
      console.log('[MessageRenderer] Content empty after processing, showing raw:', content)
    }
    // Try to render raw content without processing
    return (
      <Message
        content={content}
        messageId={messageId}
        role={role}
        className={className}
        components={sharedComponents}
      />
    )
  }

  return (
    <Message
      content={processedContent}
      messageId={messageId}
      role={role}
      className={className}
      components={sharedComponents}
    />
  )
}
