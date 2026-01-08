/**
 * Tests for AppSpec Generation in Chat API
 *
 * Tests the new AppSpec generation flow for first messages in new chats.
 * Validates intent confirmation, draft regeneration, and fallback behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { FastformAppSpec } from '@/lib/types/appspec'

// Mock auth
const mockAuth = vi.fn()
vi.mock('@/app/(auth)/auth', () => ({
  auth: () => mockAuth(),
}))

// Mock database queries
const mockGetAppById = vi.fn()
const mockGetChatCountByUserId = vi.fn()
const mockCreateChatOwnership = vi.fn()

vi.mock('@/lib/db/queries', () => ({
  getAppById: (args: { appId: string }) => mockGetAppById(args),
  getChatCountByUserId: (args: any) => mockGetChatCountByUserId(args),
  getChatCountByIP: vi.fn().mockResolvedValue(0),
  createChatOwnership: (args: any) => mockCreateChatOwnership(args),
  createAnonymousChatLog: vi.fn(),
}))

// Mock entitlements
vi.mock('@/lib/entitlements', () => ({
  entitlementsByUserType: {
    free: { maxMessagesPerDay: 100 },
    pro: { maxMessagesPerDay: 1000 },
  },
  anonymousEntitlements: { maxMessagesPerDay: 10 },
}))

// Mock errors
vi.mock('@/lib/errors', () => ({
  ChatSDKError: class ChatSDKError extends Error {
    toResponse() {
      return new Response(JSON.stringify({ error: this.message }), {
        status: 429,
      })
    }
  },
}))

// Mock AppSpec generator
const mockCreateDraftAppSpec = vi.fn()
const mockRegenerateAppSpec = vi.fn()

vi.mock('@/lib/ai/appspec-generator', () => ({
  createDraftAppSpec: (intent: string, history: any[]) =>
    mockCreateDraftAppSpec(intent, history),
  regenerateAppSpec: (currentSpec: any, newMessage: string) =>
    mockRegenerateAppSpec(currentSpec, newMessage),
  AppSpecValidationError: class AppSpecValidationError extends Error {
    validationErrors?: string[]
    constructor(message: string, validationErrors?: string[]) {
      super(message)
      this.name = 'AppSpecValidationError'
      this.validationErrors = validationErrors
    }
  },
  AppSpecGenerationError: class AppSpecGenerationError extends Error {
    cause?: unknown
    constructor(message: string, cause?: unknown) {
      super(message)
      this.name = 'AppSpecGenerationError'
      this.cause = cause
    }
  },
}))

// Mock v0-sdk
vi.mock('v0-sdk', () => ({
  createClient: vi.fn(() => ({
    chats: {
      create: vi.fn(),
      sendMessage: vi.fn(),
    },
  })),
}))

describe('POST /api/chat - AppSpec Generation', () => {
  const mockUserId = 'user-123'
  const mockAppId = 'app-456'

  const mockDraftSpec: FastformAppSpec = {
    id: 'draft-spec-id',
    version: '0.3',
    meta: {
      name: 'Test Healthcare App',
      slug: 'test-healthcare-app',
      description: 'A test healthcare application',
      orgId: '{{ORG_ID_UUID}}',
      orgSlug: 'test-org',
    },
    theme: {
      preset: 'healthcare-calm',
    },
    roles: [
      { id: 'PATIENT', authRequired: false },
      { id: 'STAFF', authRequired: true, routePrefix: '/staff' },
    ],
    pages: [],
    workflow: {
      states: ['DRAFT', 'SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'REJECTED'],
      initialState: 'DRAFT',
      transitions: [],
    },
    api: {
      baseUrl: '{{FASTFORM_API_URL}}',
      endpoints: {
        createSubmission: '/api/submissions',
        getSubmission: '/api/submissions/[id]',
        resubmitSubmission: '/api/submissions/[id]/resubmit',
        staffLogin: '/api/auth/staff/login',
        staffLogout: '/api/auth/staff/logout',
        staffSession: '/api/auth/staff/session',
        listSubmissions: '/api/staff/submissions',
        getSubmissionDetail: '/api/staff/submissions/[id]',
        transitionSubmission: '/api/staff/submissions/[id]/transition',
        trackEvent: '/api/analytics/track',
      },
    },
    analytics: {
      events: [],
    },
    environments: {
      staging: {
        domain: '{{APP_SLUG}}.staging.fastform.app',
        apiUrl: 'https://api.staging.fastform.app',
      },
      production: {
        domain: '{{APP_SLUG}}.fastform.app',
        apiUrl: 'https://api.fastform.app',
      },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock authenticated session
    mockAuth.mockResolvedValue({
      user: {
        id: mockUserId,
        email: 'test@example.com',
        type: 'free',
      },
      expires: '2026-12-31',
    } as any)

    // Mock app ownership
    mockGetAppById.mockResolvedValue({
      id: mockAppId,
      userId: mockUserId,
      name: 'Test App',
    } as any)

    // Mock rate limiting
    mockGetChatCountByUserId.mockResolvedValue(0)
  })

  describe('First Message - Create Draft AppSpec', () => {
    it('should generate draft AppSpec for first message in new chat', async () => {
      mockCreateDraftAppSpec.mockResolvedValue(mockDraftSpec)

      const { POST } = await import('../route')

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'I need a patient intake form for my dental practice',
          appId: mockAppId,
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.type).toBe('intent-confirmation')
      expect(data.draftSpec).toEqual(mockDraftSpec)
      expect(data.sessionId).toBeDefined()
      expect(typeof data.sessionId).toBe('string')

      expect(mockCreateDraftAppSpec).toHaveBeenCalledWith(
        'I need a patient intake form for my dental practice',
        [],
      )
      expect(mockCreateDraftAppSpec).toHaveBeenCalledTimes(1)
    })

    it('should return 403 if user does not own the app', async () => {
      mockGetAppById.mockResolvedValue({
        id: mockAppId,
        userId: 'different-user-id',
        name: 'Test App',
      } as any)

      const { POST } = await import('../route')

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Create a form',
          appId: mockAppId,
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden - you do not own this app')
      expect(mockCreateDraftAppSpec).not.toHaveBeenCalled()
    })

    it('should return 404 if app does not exist', async () => {
      mockGetAppById.mockResolvedValue(null)

      const { POST } = await import('../route')

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Create a form',
          appId: mockAppId,
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('App not found')
      expect(mockCreateDraftAppSpec).not.toHaveBeenCalled()
    })
  })

  describe('Follow-up Messages - Regenerate Draft AppSpec', () => {
    it('should create new draft if sessionId does not exist in memory', async () => {
      mockCreateDraftAppSpec.mockResolvedValue(mockDraftSpec)

      const { POST } = await import('../route')

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Create a form',
          appId: mockAppId,
          sessionId: 'non-existent-session',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.type).toBe('intent-confirmation')
      expect(data.sessionId).toBeDefined()
      expect(data.sessionId).not.toBe('non-existent-session')

      expect(mockCreateDraftAppSpec).toHaveBeenCalled()
      expect(mockRegenerateAppSpec).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should return 500 with details for AppSpecValidationError', async () => {
      const AppSpecValidationError = (
        await import('@/lib/ai/appspec-generator')
      ).AppSpecValidationError

      const validationError = new AppSpecValidationError('Invalid schema', [
        'Missing meta.name',
        'Invalid theme.preset',
      ])
      mockCreateDraftAppSpec.mockRejectedValue(validationError)

      const { POST } = await import('../route')

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Create a form',
          appId: mockAppId,
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to generate AppSpec')
      expect(data.details).toBe('Invalid schema')
      expect(data.validationErrors).toEqual([
        'Missing meta.name',
        'Invalid theme.preset',
      ])
    })

    it('should return 500 with details for AppSpecGenerationError', async () => {
      const AppSpecGenerationError = (
        await import('@/lib/ai/appspec-generator')
      ).AppSpecGenerationError

      const generationError = new AppSpecGenerationError('LLM failed')
      mockCreateDraftAppSpec.mockRejectedValue(generationError)

      const { POST } = await import('../route')

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Create a form',
          appId: mockAppId,
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to generate AppSpec')
      expect(data.details).toBe('LLM failed')
      expect(data.validationErrors).toBeUndefined()
    })
  })

  describe('Existing Chat Flow - No AppSpec Generation', () => {
    it('should skip AppSpec generation when no appId is provided', async () => {
      const { POST } = await import('../route')

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Create something',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('appId is required for new chats')
      expect(mockCreateDraftAppSpec).not.toHaveBeenCalled()
    })

    it('should skip AppSpec generation for anonymous users', async () => {
      mockAuth.mockResolvedValue(null)

      const { POST } = await import('../route')

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Create a form',
          appId: mockAppId,
        }),
      })

      await POST(request)

      expect(mockCreateDraftAppSpec).not.toHaveBeenCalled()
    })
  })

  describe('Response Format', () => {
    it('should return correct intent-confirmation response structure', async () => {
      mockCreateDraftAppSpec.mockResolvedValue(mockDraftSpec)

      const { POST } = await import('../route')

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Create a form',
          appId: mockAppId,
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data).toMatchObject({
        type: 'intent-confirmation',
        draftSpec: expect.objectContaining({
          id: expect.any(String),
          version: '0.3',
          meta: expect.any(Object),
          theme: expect.any(Object),
          roles: expect.any(Array),
          pages: expect.any(Array),
          workflow: expect.any(Object),
          api: expect.any(Object),
          analytics: expect.any(Object),
          environments: expect.any(Object),
        }),
        sessionId: expect.any(String),
      })
    })
  })
})
