'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, Loader2, ExternalLink, Rocket, CheckCircle2, AlertCircle } from 'lucide-react'
import { ChatMessages } from '@/components/chat/chat-messages'
import { ChatInput } from '@/components/chat/chat-input'
import { PreviewPanel } from '@/components/chat/preview-panel'
import { ResizableLayout } from '@/components/shared/resizable-layout'
import { BottomToolbar } from '@/components/shared/bottom-toolbar'
import { useChat } from '@/hooks/use-chat'
import {
  type ImageAttachment,
  clearPromptFromStorage,
} from '@/components/ai-elements/prompt-input'
import IntentConfirmation from '@/components/chat/intent-confirmation'
import type { FastformAppSpec } from '@/lib/types/appspec'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import useSWR from 'swr'
import type { App } from '@/lib/db/schema'

interface ChatDetailClientProps {
  appId: string
  chatId: string
}

interface StagingDeploymentState {
  url: string
  status: string
  deploymentId: string
}

interface ProductionDeploymentState {
  url: string
  status: string
  deploymentId: string
  mergedAt?: string
  githubCommitSha?: string
  repoUrl?: string
}

interface DeploymentErrorState {
  message: string
  phase?: string
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

  // Deployment state
  const [stagingDeployment, setStagingDeployment] = useState<StagingDeploymentState | null>(null)
  const [productionDeployment, setProductionDeployment] = useState<ProductionDeploymentState | null>(null)
  const [isDeploying, setIsDeploying] = useState(false)
  const [isPromoting, setIsPromoting] = useState(false)
  const [showPromoteDialog, setShowPromoteDialog] = useState(false)
  const [deploymentError, setDeploymentError] = useState<DeploymentErrorState | null>(null)

  const { toast } = useToast()

  // Fetch app data to check if spec exists
  const { data: appData } = useSWR<{ data: App }>(
    `/api/apps/${appId}`,
    async (url: string) => {
      const response = await fetch(url)
      if (!response.ok) throw new Error('Failed to fetch app')
      return response.json()
    }
  )

  const app = appData?.data
  const hasSpec = app?.spec && typeof app.spec === 'object' && Object.keys(app.spec).length > 0
  const {
    message,
    setMessage,
    currentChat,
    isLoading,
    setIsLoading,
    chatHistory,
    isLoadingChat,
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

  // Handle deployment to staging
  const handleDeployToStaging = async () => {
    setIsDeploying(true)
    setDeploymentError(null)

    try {
      const response = await fetch(`/api/apps/${appId}/deploy/staging`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Deployment failed')
      }

      setStagingDeployment({
        url: data.deployment.stagingUrl,
        status: data.deployment.status,
        deploymentId: data.deployment.deploymentId,
      })

      toast({
        title: 'Deployment successful!',
        description: 'Your app has been deployed to staging.',
      })
    } catch (error) {
      console.error('Deployment error:', error)

      const errorMessage = error instanceof Error ? error.message : 'Failed to deploy app'

      setDeploymentError({
        message: errorMessage,
      })

      toast({
        title: 'Deployment failed',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setIsDeploying(false)
    }
  }

  // Handle promotion to production
  const handlePromoteToProduction = async () => {
    setIsPromoting(true)
    setShowPromoteDialog(false)

    try {
      const response = await fetch(`/api/apps/${appId}/deploy/production`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        // Handle specific error cases
        let errorMessage = data.message || 'Failed to promote to production'

        if (data.phase === 'verify_staging') {
          errorMessage = `Cannot promote to production: ${data.message}`
        } else if (data.phase) {
          errorMessage = `Production promotion failed during ${data.phase}: ${data.message}`
        }

        throw new Error(errorMessage)
      }

      // Success - update production deployment state
      setProductionDeployment({
        url: data.deployment.productionUrl,
        status: data.deployment.status,
        deploymentId: data.deployment.deploymentId,
        mergedAt: data.deployment.mergedAt,
        githubCommitSha: data.deployment.githubCommitSha,
        repoUrl: data.deployment.repoUrl,
      })

      toast({
        title: 'Successfully promoted to production!',
        description: 'Your app is now publicly accessible.',
      })
    } catch (error) {
      console.error('Error promoting to production:', error)

      toast({
        title: 'Production promotion failed',
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsPromoting(false)
    }
  }

  // Open the confirmation dialog
  const handlePromoteClick = () => {
    setShowPromoteDialog(true)
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
                <>
                  <ChatMessages
                    chatHistory={chatHistory}
                    isLoading={isLoading}
                    currentChat={currentChat || null}
                    onStreamingComplete={handleStreamingComplete}
                    onChatData={handleChatData}
                    onStreamingStarted={() => setIsLoading(false)}
                  />

                  {hasSpec && !showIntentConfirmation && !isBuilding && (
                    <div className="px-4 py-3 border-t border-border dark:border-input bg-muted/30">
                      <div className="max-w-3xl mx-auto space-y-3">
                        {deploymentError && (
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Deployment Failed</AlertTitle>
                            <AlertDescription>
                              {deploymentError.message}
                              {deploymentError.phase && (
                                <span className="block text-xs mt-1">
                                  Phase: {deploymentError.phase}
                                </span>
                              )}
                            </AlertDescription>
                          </Alert>
                        )}

                        {stagingDeployment ? (
                          <div className="space-y-3">
                            <Alert>
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              <AlertTitle>Staging Deployment Ready</AlertTitle>
                              <AlertDescription>
                                <div className="space-y-2">
                                  <p className="text-sm">
                                    Your app has been successfully deployed to staging.
                                  </p>
                                  <Button
                                    asChild
                                    variant="outline"
                                    size="sm"
                                    className="w-full sm:w-auto"
                                  >
                                    <a
                                      href={stagingDeployment.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                      View Staging App
                                    </a>
                                  </Button>
                                </div>
                              </AlertDescription>
                            </Alert>

                            {/* Production Deployment Section */}
                            {productionDeployment ? (
                              <Alert>
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                                <AlertTitle>Production Deployment Live</AlertTitle>
                                <AlertDescription>
                                  <div className="space-y-2">
                                    <p className="text-sm font-medium text-green-600 dark:text-green-400">
                                      Your app is now publicly accessible!
                                    </p>
                                    <Button
                                      asChild
                                      variant="outline"
                                      size="sm"
                                      className="w-full sm:w-auto"
                                    >
                                      <a
                                        href={productionDeployment.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                        View Production App
                                      </a>
                                    </Button>
                                  </div>
                                </AlertDescription>
                              </Alert>
                            ) : (
                              <Button
                                onClick={handlePromoteClick}
                                disabled={isPromoting}
                                variant="secondary"
                                className="w-full"
                                size="lg"
                              >
                                {isPromoting ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Promoting to Production...</span>
                                  </>
                                ) : (
                                  <>
                                    <Rocket className="h-4 w-4" />
                                    <span>Promote to Production</span>
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        ) : (
                          <Button
                            onClick={handleDeployToStaging}
                            disabled={isDeploying}
                            className="w-full"
                            size="lg"
                          >
                            {isDeploying ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Deploying to Staging...</span>
                              </>
                            ) : (
                              <>
                                <Rocket className="h-4 w-4" />
                                <span>Deploy to Staging</span>
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </>
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

      {/* Promote to Production Confirmation Dialog */}
      <AlertDialog open={showPromoteDialog} onOpenChange={setShowPromoteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promote to Production?</AlertDialogTitle>
            <AlertDialogDescription>
              This will make your app publicly accessible. Are you sure you want
              to promote to production?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePromoteToProduction}>
              Promote to Production
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
