'use client'

import { useState, useEffect, useRef } from 'react'
import { ChatMessages } from '@/components/chat/chat-messages'
import { ChatInput } from '@/components/chat/chat-input'
import { PreviewPanel } from '@/components/chat/preview-panel'
import { ResizableLayout } from '@/components/shared/resizable-layout'
import { BottomToolbar } from '@/components/shared/bottom-toolbar'
import { useChat } from '@/hooks/use-chat'
import { useStreaming } from '@/contexts/streaming-context'
import {
  type ImageAttachment,
  clearPromptFromStorage,
} from '@/components/ai-elements/prompt-input'

interface ChatDetailClientProps {
  appId: string
  chatId: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ChatDetailClient({ appId, chatId }: ChatDetailClientProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [attachments, setAttachments] = useState<ImageAttachment[]>([])
  const [activePanel, setActivePanel] = useState<'chat' | 'preview'>('chat')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { handoff } = useStreaming()
  const {
    message,
    setMessage,
    currentChat,
    isLoading,
    setIsLoading,
    isStreaming,
    chatHistory,
    isLoadingChat,
    handleSendMessage,
    handleStreamingComplete,
    handleChatData,
  } = useChat(chatId)

  // Wrapper function to handle attachments
  const handleSubmitWithAttachments = (
    e: React.FormEvent<HTMLFormElement>,
    attachmentUrls?: Array<{ url: string }>,
  ) => {
    // Clear sessionStorage immediately upon submission
    clearPromptFromStorage()
    // Clear attachments after sending
    setAttachments([])
    return handleSendMessage(e, attachmentUrls)
  }

  // Handle fullscreen keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  // Auto-focus the textarea on page load
  useEffect(() => {
    if (textareaRef.current && !isLoadingChat) {
      textareaRef.current.focus()
    }
  }, [isLoadingChat])

  return (
    <div className="flex flex-col h-[calc(100vh-56px-1px)] md:h-[calc(100vh-56px-1px)]">
      <ResizableLayout
        className="flex-1 min-h-0"
        singlePanelMode={false}
        activePanel={activePanel === 'chat' ? 'left' : 'right'}
        leftPanel={
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto">
              <ChatMessages
                chatHistory={chatHistory}
                isLoading={isLoading}
                currentChat={currentChat || null}
                onStreamingComplete={handleStreamingComplete}
                onChatData={handleChatData}
                onStreamingStarted={() => setIsLoading(false)}
              />
            </div>

            <ChatInput
              message={message}
              setMessage={setMessage}
              onSubmit={handleSubmitWithAttachments}
              isLoading={isLoading}
              showSuggestions={false}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              textareaRef={textareaRef}
            />
          </div>
        }
        rightPanel={
          <PreviewPanel
            currentChat={currentChat || null}
            isFullscreen={isFullscreen}
            setIsFullscreen={setIsFullscreen}
            refreshKey={refreshKey}
            setRefreshKey={setRefreshKey}
          />
        }
      />

      <div className="md:hidden">
        <BottomToolbar
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          hasPreview={!!currentChat}
        />
      </div>
    </div>
  )
}
