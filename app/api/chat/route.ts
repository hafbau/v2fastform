import { NextRequest, NextResponse } from 'next/server'
import { createClient, ChatDetail } from 'v0-sdk'
import { auth } from '@/app/(auth)/auth'
import {
  createChatOwnership,
  createAnonymousChatLog,
  getChatCountByUserId,
  getChatCountByIP,
  getAppById,
} from '@/lib/db/queries'
import {
  entitlementsByUserType,
  anonymousEntitlements,
} from '@/lib/entitlements'
import { ChatSDKError } from '@/lib/errors'
import {
  createDraftAppSpec,
  regenerateAppSpec,
  AppSpecValidationError,
  AppSpecGenerationError,
} from '@/lib/ai/appspec-generator'
import type { FastformAppSpec } from '@/lib/types/appspec'
import { randomUUID } from 'crypto'

// Create v0 client with custom baseUrl if V0_API_URL is set
const v0 = createClient(
  process.env.V0_API_URL ? { baseUrl: process.env.V0_API_URL } : {},
)

/**
 * In-memory storage for draft AppSpecs before user confirmation.
 * Map structure: sessionId -> FastformAppSpec
 *
 * NOTE: This is temporary storage for the chat → AppSpec flow.
 * Confirmed AppSpecs will be persisted to the database via a separate endpoint.
 *
 * SCALING CONSIDERATION:
 * This in-memory storage works well for single-instance deployments.
 * For multi-instance deployments (e.g., multiple Vercel serverless functions),
 * consider migrating to Redis or another distributed cache:
 *
 * 1. Redis (recommended): Use @upstash/redis for serverless-friendly Redis
 *    - Set: await redis.set(`draft:${sessionId}`, JSON.stringify(spec), { ex: 3600 })
 *    - Get: const spec = await redis.get(`draft:${sessionId}`)
 *
 * 2. Database: Store drafts in a `draft_appspecs` table with TTL
 *    - Simple but adds database load
 *
 * For now, in-memory is acceptable since:
 * - Draft lifetime is short (< 1 hour)
 * - User typically completes flow in same session
 * - Lost drafts can be regenerated from conversation
 */
const draftAppSpecs = new Map<string, FastformAppSpec>()

/**
 * Cleanup interval for stale drafts (older than 1 hour).
 * Runs every 15 minutes to prevent memory leaks.
 *
 * Note: In serverless environments, this interval may not run reliably.
 * The TTL approach with Redis handles this automatically.
 */
const DRAFT_EXPIRY_MS = 60 * 60 * 1000 // 1 hour
const draftTimestamps = new Map<string, number>()

// Cleanup stale drafts periodically
setInterval(() => {
  const now = Date.now()
  for (const [sessionId, timestamp] of draftTimestamps.entries()) {
    if (now - timestamp > DRAFT_EXPIRY_MS) {
      draftAppSpecs.delete(sessionId)
      draftTimestamps.delete(sessionId)
    }
  }
}, 15 * 60 * 1000) // Run every 15 minutes

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')

  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  if (realIP) {
    return realIP
  }

  // Fallback to connection remote address or unknown
  return 'unknown'
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    const { message, chatId, streaming, attachments, appId, sessionId } =
      await request.json()

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 },
      )
    }

    // ========================================================================
    // VALIDATION: Validate appId for new authenticated chats
    // ========================================================================
    // This validation runs BEFORE AppSpec generation to ensure user has
    // permission to generate AppSpecs for this app.
    // ========================================================================
    let app: Awaited<ReturnType<typeof getAppById>>

    if (!chatId && session?.user?.id) {
      if (!appId) {
        return NextResponse.json(
          { error: 'appId is required for new chats' },
          { status: 400 },
        )
      }
      app = await getAppById({ appId })
      if (!app) {
        return NextResponse.json(
          { error: 'App not found' },
          { status: 404 },
        )
      }
      if (app.userId !== session.user.id) {
        return NextResponse.json(
          { error: 'Forbidden - you do not own this app' },
          { status: 403 },
        )
      }
    }

    // ========================================================================
    // NEW: AppSpec Generation for First Message in New Chat
    // ========================================================================
    // When user starts a new chat (no chatId) with appId, we generate a draft
    // AppSpec for confirmation before proceeding to v0 code generation.
    //
    // Flow:
    // 1. First message (no chatId, no sessionId) → createDraftAppSpec
    // 2. Follow-up before confirmation (no chatId, with sessionId) → regenerateAppSpec
    // 3. After confirmation (with chatId) → existing v0 SDK flow
    //
    // NOTE: App ownership is validated above before we reach this point.
    // ========================================================================

    // helper to check if app spec is empty
    const isSpecEmpty = app && (!app.spec || (typeof app.spec === 'object' && Object.keys(app.spec).length === 0))

    if (!chatId && appId && session?.user?.id && isSpecEmpty) {
      try {
        let draftSpec: FastformAppSpec
        let currentSessionId: string

        if (sessionId && draftAppSpecs.has(sessionId)) {
          // User is continuing chat before confirmation - regenerate AppSpec
          const existingDraft = draftAppSpecs.get(sessionId)!
          draftSpec = await regenerateAppSpec(existingDraft, message)
          currentSessionId = sessionId

          // Update draft in memory
          draftAppSpecs.set(currentSessionId, draftSpec)
          draftTimestamps.set(currentSessionId, Date.now())
        } else {
          // First message - create new draft AppSpec
          draftSpec = await createDraftAppSpec(message, [])
          currentSessionId = randomUUID()

          // Store draft in memory
          draftAppSpecs.set(currentSessionId, draftSpec)
          draftTimestamps.set(currentSessionId, Date.now())
        }

        // Return intent confirmation response
        return NextResponse.json({
          type: 'intent-confirmation',
          draftSpec,
          sessionId: currentSessionId,
        })
      } catch (error) {
        console.error('AppSpec generation error:', error)

        // Return detailed error for validation/generation failures
        if (
          error instanceof AppSpecValidationError ||
          error instanceof AppSpecGenerationError
        ) {
          return NextResponse.json(
            {
              error: 'Failed to generate AppSpec',
              details: error.message,
              validationErrors:
                error instanceof AppSpecValidationError
                  ? error.validationErrors
                  : undefined,
            },
            { status: 500 },
          )
        }

        // For unexpected errors, fall through to existing v0 SDK flow
        // This provides a graceful degradation path
        console.warn(
          'AppSpec generation failed unexpectedly, falling back to v0 SDK flow:',
          error,
        )
      }
    }

    // ========================================================================
    // EXISTING: v0 SDK Flow (unchanged)
    // ========================================================================

    // Rate limiting
    if (session?.user?.id) {
      // Authenticated user rate limiting
      let chatCount = 0
      try {
        chatCount = await getChatCountByUserId({
          userId: session.user.id,
          differenceInHours: 24,
        })
      } catch (error) {
        console.error(
          'Rate limit check failed (user), skipping rate limiting:',
          error,
        )
      }

      const userType = session.user.type
      if (chatCount >= entitlementsByUserType[userType].maxMessagesPerDay) {
        return new ChatSDKError('rate_limit:chat').toResponse()
      }
    } else {
      // Anonymous user rate limiting
      const clientIP = getClientIP(request)
      let chatCount = 0
      try {
        chatCount = await getChatCountByIP({
          ipAddress: clientIP,
          differenceInHours: 24,
        })
      } catch (error) {
        console.error(
          'Rate limit check failed (anonymous), skipping rate limiting:',
          error,
        )
      }

      if (chatCount >= anonymousEntitlements.maxMessagesPerDay) {
        return new ChatSDKError('rate_limit:chat').toResponse()
      }
    }

    let chat

    if (chatId) {
      // continue existing chat
      if (streaming) {
        // Return streaming response for existing chat
        chat = await v0.chats.sendMessage({
          chatId: chatId,
          message,
          responseMode: 'experimental_stream',
          ...(attachments && attachments.length > 0 && { attachments }),
        })

        // Return the stream directly
        return new Response(chat as ReadableStream<Uint8Array>, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      } else {
        // Non-streaming response for existing chat
        chat = await v0.chats.sendMessage({
          chatId: chatId,
          message,
          ...(attachments && attachments.length > 0 && { attachments }),
        })
      }
    } else {
      // create new chat
      if (streaming) {
        // Return streaming response
        // NOTE: For streaming new chats, ownership is created CLIENT-SIDE via the
        // handleChatData callback in home-client.tsx, which calls /api/chat/ownership
        // after receiving the chat ID from the stream. This is by design since we
        // cannot wait for stream completion server-side.
        chat = await v0.chats.create({
          message,
          responseMode: 'experimental_stream',
          ...(attachments && attachments.length > 0 && { attachments }),
        })

        // Return the stream directly
        return new Response(chat as ReadableStream<Uint8Array>, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      } else {
        // Use sync mode
        chat = await v0.chats.create({
          message,
          responseMode: 'sync',
          ...(attachments && attachments.length > 0 && { attachments }),
        })
      }
    }

    // Type guard to ensure we have a ChatDetail and not a stream
    if (chat instanceof ReadableStream) {
      throw new Error('Unexpected streaming response')
    }

    const chatDetail = chat as ChatDetail

    // Create ownership mapping or anonymous log for new chat
    if (!chatId && chatDetail.id) {
      try {
        if (session?.user?.id) {
          // Authenticated user - create ownership mapping
          // appId is validated earlier in this route; it's required for new chats
          await createChatOwnership({
            v0ChatId: chatDetail.id,
            userId: session.user.id,
            appId,
          })
        } else {
          // Anonymous user - log for rate limiting
          const clientIP = getClientIP(request)
          await createAnonymousChatLog({
            ipAddress: clientIP,
            v0ChatId: chatDetail.id,
          })
        }
      } catch (error) {
        console.error('Failed to create chat ownership/log:', error)
        // Don't fail the request if database save fails
      }
    }

    return NextResponse.json({
	      id: chatDetail.id,
	      demo: chatDetail.demo,
	      messages: chatDetail.messages?.map((msg) => ({
	        ...msg,
	        experimental_content: (msg as Record<string, unknown>)
	          .experimental_content,
	      })),
	    })
	  } catch (error) {
	    console.error('V0 API Error:', error)

    // Log more detailed error information
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }

    return NextResponse.json(
      {
        error: 'Failed to process request',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
