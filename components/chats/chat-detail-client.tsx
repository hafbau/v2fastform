'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
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
import IntentConfirmation from '@/components/chat/intent-confirmation'
import type { FastformAppSpec } from '@/lib/types/appspec'
import { useToast } from '@/hooks/use-toast'

interface ChatDetailClientProps {
  appId: string
  chatId: string
}

export function ChatDetailClient({ appId, chatId }: ChatDetailClientProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [attachments, setAttachments] = useState<ImageAttachment[]>([])
  const [activePanel, setActivePanel] = useState<'chat' | 'preview'>('chat')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Intent confirmation state
  const [draftSpec, setDraftSpec] = useState<FastformAppSpec | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [showIntentConfirmation, setShowIntentConfirmation] = useState(false)
  const [isBuilding, setIsBuilding] = useState(false)

  const { toast } = useToast()
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

  // Handle intent confirmation - user confirms the spec and triggers v0 generation
  const handleConfirm = async (editedSpec: FastformAppSpec) => {
    setIsBuilding(true)

    try {
      // 1. Persist the AppSpec to the database
      const response = await fetch(`/api/apps/${appId}/appspec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spec: editedSpec,
          sessionId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData.error || 'Failed to persist AppSpec. Please try again.'
        )
      }

      const { app } = await response.json()

      // 2. Hide intent confirmation component
      setShowIntentConfirmation(false)
      setDraftSpec(null)
      setSessionId(null)

      // 3. Show building state
      toast({
        title: 'Building your app...',
        description: 'Your app is being generated. This may take a moment.',
      })

      // 4. Trigger v0 generation flow (create actual chat with v0)
      // Note: In a real implementation, this would call the v0 API to start code generation
      // For now, we'll just refresh the chat to show it's been confirmed
      // The backend will handle the actual v0 generation after AppSpec is persisted

      toast({
        title: 'App spec saved!',
        description: `Your app "${app.name}" is ready for generation.`,
      })

      // Refresh the page to reload with the persisted spec
      window.location.reload()
    } catch (error) {
      console.error('Error confirming AppSpec:', error)

      toast({
        title: 'Failed to confirm app spec',
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      })

      setIsBuilding(false)
    }
  }

  // Handle refinement - user wants to continue describing in chat
  const handleRefine = () => {
    // Hide the intent confirmation component
    setShowIntentConfirmation(false)
    // Keep sessionId in state for next message
    // Keep draftSpec in state for reference
    // User continues typing in chat input
    // Next message will call regenerateAppSpec with the sessionId

    // Focus the textarea for immediate typing
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  // Wrapper function to handle attachments and intent confirmation detection
  const handleSubmitWithAttachments = async (
    e: React.FormEvent<HTMLFormElement>,
    attachmentUrls?: Array<{ url: string }>,
  ) => {
    e.preventDefault()
    if (!message.trim() || isLoading) return

    const userMessage = message.trim()
    setMessage('')
    setIsLoading(true)

    // Clear sessionStorage immediately upon submission
    clearPromptFromStorage()
    // Clear attachments after sending
    setAttachments([])

    try {
      // Send message to chat API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          appId,
          ...(sessionId && { sessionId }), // Include sessionId if we're refining
          ...(attachmentUrls &&
            attachmentUrls.length > 0 && { attachments: attachmentUrls }),
        }),
      })

      if (!response.ok) {
        let errorMessage =
          'Sorry, there was an error processing your message. Please try again.'
        try {
          const errorData = await response.json()
          if (errorData.message) {
            errorMessage = errorData.message
          } else if (response.status === 429) {
            errorMessage =
              'You have exceeded your maximum number of messages for the day. Please try again later.'
          } else if (response.status === 403) {
            errorMessage = 'You do not have permission to access this app.'
          } else if (response.status === 404) {
            errorMessage = 'App not found.'
          }
        } catch (parseError) {
          console.error('Error parsing error response:', parseError)
        }
        throw new Error(errorMessage)
      }

      // Check if response is intent confirmation
      const data = await response.json()

      if (data.type === 'intent-confirmation') {
        // Intent confirmation response - show IntentConfirmation component
        setDraftSpec(data.draftSpec)
        setSessionId(data.sessionId)
        setShowIntentConfirmation(true)
        setIsLoading(false)
      } else {
        // Regular streaming response - use existing flow
        // This shouldn't happen in the current implementation, but handle it gracefully
        toast({
          title: 'Unexpected response',
          description: 'Received an unexpected response type from the server.',
          variant: 'destructive',
        })
        setIsLoading(false)
      }
    } catch (error) {
      console.error('Error:', error)

      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Sorry, there was an error processing your message. Please try again.'

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })

      setIsLoading(false)
    }
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
    <div className="flex flex-col h-[calc(100vh-56px)] md:h-[calc(100vh-56px)]">
      {/* Back navigation to app's chat list */}
      <div className="flex items-center px-4 py-2 border-b border-border dark:border-input bg-white dark:bg-black">
        <Link
          href={`/apps/${appId}/chats`}
          className="flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to chats
        </Link>
      </div>
      <ResizableLayout
        className="flex-1 min-h-0"
        singlePanelMode={false}
        activePanel={activePanel === 'chat' ? 'left' : 'right'}
        leftPanel={
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto">
              {showIntentConfirmation && draftSpec ? (
                // Intent confirmation state - show IntentConfirmation component
                <div className="flex items-center justify-center h-full p-4">
                  <IntentConfirmation
                    draftSpec={draftSpec}
                    onConfirm={handleConfirm}
                    onRefine={handleRefine}
                  />
                </div>
              ) : isBuilding ? (
                // Building state - show loading message
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">
                        Building your app...
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Your app is being generated. This may take a moment.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                // Normal chat state - show chat messages
                <ChatMessages
                  chatHistory={chatHistory}
                  isLoading={isLoading}
                  currentChat={currentChat || null}
                  onStreamingComplete={handleStreamingComplete}
                  onChatData={handleChatData}
                  onStreamingStarted={() => setIsLoading(false)}
                />
              )}
            </div>

            <ChatInput
              message={message}
              setMessage={setMessage}
              onSubmit={handleSubmitWithAttachments}
              isLoading={isLoading || isBuilding || showIntentConfirmation}
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
