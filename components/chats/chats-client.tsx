'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { ChatInput } from '@/components/chat/chat-input'
import { type ImageAttachment } from '@/components/ai-elements/prompt-input'
import IntentConfirmation from '@/components/chat/intent-confirmation'
import type { FastformAppSpec } from '@/lib/types/appspec'
import { useToast } from '@/hooks/use-toast'
import { Bot, Loader2, User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface V0Chat {
  id: string
  object: 'chat'
  name?: string
  messages?: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  createdAt: string
  updatedAt: string
}

interface ChatsResponse {
  object: 'list'
  data: V0Chat[]
}

interface ChatsClientProps {
  appId: string
}

interface HistoryItem {
  id: string
  role: 'user' | 'assistant'
  type: 'text' | 'intent-confirmation'
  content?: string
  spec?: FastformAppSpec
  attachments?: ImageAttachment[]
}

export function ChatsClient({ appId }: ChatsClientProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { data, error, isLoading: isLoadingChats } = useSWR<ChatsResponse>(
    `/api/chats?appId=${appId}`
  )
  const chats = data?.data || []

  // Chat input state
  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState<ImageAttachment[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Interaction History for "New Chat" flow
  const [history, setHistory] = useState<HistoryItem[]>([])
  
  // Intent confirmation state
  const [sessionId, setSessionId] = useState<string | null>(null)
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const getFirstUserMessage = (chat: V0Chat) => {
    const firstUserMessage = chat.messages?.find((msg) => msg.role === 'user')
    return firstUserMessage?.content || 'No messages'
  }

  // Scroll to bottom when history changes
  useEffect(() => {
    if (history.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [history, isSubmitting])

  // Core logic to create chat
  const createChat = async (
    userMessage: string, 
    submittedAttachments: Array<{ url: string }> | undefined,
    currentSessionId: string | null
  ) => {
    try {
      // Create chat with the message under this app
      const chatResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          appId,
          sessionId: currentSessionId, // Pass existing session ID if refining
          streaming: false, // Ensure we get JSON back for intent confirmation
          attachments: submittedAttachments,
        }),
      })

      if (!chatResponse.ok) {
        throw new Error('Failed to create chat')
      }

      const chatData = await chatResponse.json()
      
      // Handle Intent Confirmation Flow
      if (chatData.type === 'intent-confirmation') {
        const spec = chatData.draftSpec
        setSessionId(chatData.sessionId)
        
        // Add assistant response to history
        setHistory(prev => [
          ...prev, 
          { 
            id: Date.now().toString(),
            role: 'assistant', 
            type: 'intent-confirmation', 
            spec 
          }
        ])
        
        setIsSubmitting(false)
        return
      }

      const chatId = chatData.id

      if (!chatId) {
        throw new Error('Could not get chat ID from response')
      }

      // Clear message and redirect
      setMessage('')
      setAttachments([])
      setSessionId(null)
      router.push(`/apps/${appId}/chats/${chatId}`)
    } catch (error) {
      console.error('Error creating chat:', error)
      toast({
        title: 'Error',
        description: 'Failed to create chat. Please try again.',
        variant: 'destructive',
      })
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>,
    submittedAttachments?: Array<{ url: string }>
  ) => {
    e.preventDefault()
    if (!message.trim() || isSubmitting) return

    const currentMessage = message.trim()
    const formattedAttachments = submittedAttachments 
      ? submittedAttachments 
      : attachments.map(a => ({ url: a.url }))

    // Add user message to history
    setHistory(prev => [
      ...prev, 
      { 
        id: Date.now().toString(),
        role: 'user', 
        type: 'text', 
        content: currentMessage,
        attachments: attachments // Store original attachments for display
      }
    ])

    setMessage('')
    setAttachments([])
    setIsSubmitting(true)

    await createChat(currentMessage, formattedAttachments, sessionId)
  }

  const handleConfirm = async (editedSpec: FastformAppSpec) => {
    setIsSubmitting(true)

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

      // 2. Hide confirmation / Clear draft spec
      
      // 3. Create the actual chat
      // Re-send the *original* user intention (or last user message) to start the conversation
      const lastUserMsg = [...history].reverse().find(h => h.role === 'user')?.content || ''
      
      await createChat(lastUserMsg, [], sessionId)
      
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
      setIsSubmitting(false)
    }
  }

  const handleRefine = () => {
    // Just focus input
    setIsSubmitting(false)
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  const isInteracting = history.length > 0

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black relative flex flex-col">
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex flex-col">
        
        {/* Interaction History (Active Chat Mode) */}
        {isInteracting && (
          <div className="flex-1 space-y-6 mb-8">
             {history.map((item) => (
                <div 
                  key={item.id} 
                  className={cn(
                    "flex w-full gap-4",
                    item.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  {item.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center hidden sm:flex">
                       <Bot className="w-5 h-5 text-primary" />
                    </div>
                  )}

                  <div className={cn(
                    "flex flex-col gap-2 max-w-[100%] sm:max-w-[85%]",
                    item.role === 'user' ? "items-end" : "items-start"
                  )}>
                    {/* User Text Bubble */}
                    {item.type === 'text' && (
                       <div className={cn(
                         "rounded-2xl px-4 py-3",
                         item.role === 'user' 
                           ? "bg-primary text-primary-foreground rounded-tr-sm" 
                           : "bg-muted rounded-tl-sm"
                       )}>
                          <p className="whitespace-pre-wrap">{item.content}</p>
                       </div>
                    )}
                    
                    {/* Intent Confirmation Card */}
                    {item.type === 'intent-confirmation' && item.spec && (
                       <div className="w-full bg-background rounded-lg shadow-sm border border-border overflow-hidden">
                          <IntentConfirmation 
                              draftSpec={item.spec}
                              onConfirm={handleConfirm}
                              onRefine={handleRefine}
                          />
                       </div>
                    )}

                    {/* Attachments Display */}
                    {item.attachments && item.attachments.length > 0 && (
                      <div className="flex gap-2 flex-wrap justify-end">
                        {item.attachments.map((att, i) => (
                          <div key={i} className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                             Attachment {i+1}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {item.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center hidden sm:flex">
                       <User className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
             ))}

            {isSubmitting && (
               <div className="flex w-full gap-4 justify-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center hidden sm:flex">
                       <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center">
                     <Loader2 className="w-4 h-4 animate-spin mr-2" />
                     <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
               </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}


        {/* Initial Dashboard View (Only if no interaction yet) */}
        {!isInteracting && (
          <div className="mb-12 transition-all duration-500 ease-in-out">
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Start a new conversation
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Describe what you&apos;d like to build or continue working on
              </p>
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className={cn(
           "transition-all duration-300",
           isInteracting ? "sticky bottom-8 bg-background/80 backdrop-blur-sm pt-4" : "max-w-2xl mx-auto w-full"
        )}>
           <ChatInput
              message={message}
              setMessage={setMessage}
              onSubmit={handleSubmit}
              isLoading={isSubmitting}
              showSuggestions={!isInteracting}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              textareaRef={textareaRef}
              placeholder={isInteracting ? "Refine your request..." : "Start a new project..."}
            />
        </div>

        {/* Previous Chats List - Only show if NO interaction */}
        {!isInteracting && (
          <div className="mt-12">
            {isLoadingChats && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin h-6 w-6 text-gray-400" />
                <span className="ml-2 text-gray-600 dark:text-gray-300">
                  Loading chats...
                </span>
              </div>
            )}

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4 mb-6">
                <p className="text-sm text-red-700 dark:text-red-300">
                  {error.message || 'Failed to load chats'}
                </p>
              </div>
            )}

            {!isLoadingChats && !error && chats.length > 0 && (
              <div>
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Previous Chats
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {chats.length} {chats.length === 1 ? 'chat' : 'chats'}
                  </p>
                </div>
                <div className="space-y-3">
                  {chats.map((chat) => (
                    <Link
                      key={chat.id}
                      href={`/apps/${appId}/chats/${chat.id}`}
                      className="group block"
                    >
                      <div className="border border-border dark:border-input rounded-lg p-4 hover:shadow-md transition-shadow bg-white dark:bg-gray-900">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-base font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                              {chat.name || getFirstUserMessage(chat)}
                            </h4>
                            <div className="mt-1 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                              <span>{chat.messages?.length || 0} messages</span>
                              <span>
                                Updated {new Date(chat.updatedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
