import React, { useRef, useEffect } from 'react'
import { Message } from '@/components/ai-elements/message'
import {
  Conversation,
  ConversationContent,
} from '@/components/ai-elements/conversation'
import { Loader } from '@/components/ai-elements/loader'
import { MessageRenderer } from '@/components/message-renderer'
import { sharedComponents } from '@/components/shared-components'
import { StreamingMessage } from '@v0-sdk/react'
import type { MessageBinaryFormat } from '@v0-sdk/react'

interface ChatMessage {
  type: 'user' | 'assistant'
  content: MessageBinaryFormat | string
  isStreaming?: boolean
  stream?: ReadableStream<Uint8Array> | null
}

interface Chat {
  id: string
  demo?: string
  url?: string
}

interface ChatMessagesProps {
  chatHistory: ChatMessage[]
  isLoading: boolean
  currentChat: Chat | null
  onStreamingComplete: (finalContent: MessageBinaryFormat) => void
  onChatData: (chatData: unknown) => void
  onStreamingStarted?: () => void
}

export function ChatMessages({
  chatHistory,
  isLoading,
  currentChat: _currentChat,
  onStreamingComplete,
  onChatData,
  onStreamingStarted,
}: ChatMessagesProps) {
  const streamingStartedRef = useRef(false)

  // Reset the streaming started flag when a new message starts loading
  useEffect(() => {
    if (isLoading) {
      streamingStartedRef.current = false
    }
  }, [isLoading])

  if (chatHistory.length === 0) {
    return (
      <Conversation>
        <ConversationContent>
          <div>
            {/* Empty conversation - messages will appear here when they load */}
          </div>
        </ConversationContent>
      </Conversation>
    )
  }

  return (
    <>
      <Conversation>
        <ConversationContent>
          {chatHistory.map((msg, index) => (
            <Message from={msg.type} key={index}>
              {msg.isStreaming && msg.stream ? (
                <StreamingMessage
                  stream={msg.stream}
                  messageId={`msg-${index}`}
                  role={msg.type}
                  onComplete={onStreamingComplete}
                  onChatData={onChatData}
                  onChunk={(chunk) => {
                    // Debug: Log chunk content to understand structure
                    if (process.env.NODE_ENV === 'development') {
                      console.log(
                        '[StreamingMessage] Received chunk:',
                        JSON.stringify(chunk, null, 2),
                      )
                    }
                    // Hide external loader once we start receiving content (only once)
                    if (onStreamingStarted && !streamingStartedRef.current) {
                      streamingStartedRef.current = true
                      onStreamingStarted()
                    }
                  }}
                  onError={(error) => console.error('Streaming error:', error)}
                  components={sharedComponents}
                  showLoadingIndicator={false}
                />
              ) : (typeof msg.content === 'string'
                  ? msg.content.trim().length > 0
                  : msg.content.length > 0) ? (
                <MessageRenderer
                  content={msg.content}
                  role={msg.type}
                  messageId={`msg-${index}`}
                />
              ) : (
                <div className="text-gray-500 dark:text-gray-400 italic text-sm">
                  (Message content unavailable)
                </div>
              )}
            </Message>
          ))}
          {isLoading && (
            <div className="flex justify-center py-4">
              <Loader size={16} className="text-gray-500 dark:text-gray-400" />
            </div>
          )}
        </ConversationContent>
      </Conversation>
    </>
  )
}
