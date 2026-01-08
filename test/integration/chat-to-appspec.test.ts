/**
 * Integration Tests: Chat → AppSpec → v0 Flow
 *
 * Tests the full flow from user chat message to AppSpec generation,
 * intent confirmation, and v0 preview generation.
 *
 * @module test/integration/chat-to-appspec
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { FastformAppSpec } from '@/lib/types/appspec'

// Mock external dependencies
vi.mock('@/app/(auth)/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/db/queries', () => ({
  createChatOwnership: vi.fn(),
  createAnonymousChatLog: vi.fn(),
  getChatCountByUserId: vi.fn().mockResolvedValue(0),
  getChatCountByIP: vi.fn().mockResolvedValue(0),
  getAppById: vi.fn(),
}))

// Create stable mock functions for v0-sdk using vi.hoisted to ensure they're available
// before vi.mock() runs (vi.mock is hoisted to top of file)
const { mockV0ChatsCreate, mockV0ChatsSendMessage, mockV0ChatsGet } = vi.hoisted(() => ({
  mockV0ChatsCreate: vi.fn(),
  mockV0ChatsSendMessage: vi.fn(),
  mockV0ChatsGet: vi.fn(),
}))

vi.mock('v0-sdk', () => ({
  createClient: vi.fn(() => ({
    chats: {
      create: mockV0ChatsCreate,
      sendMessage: mockV0ChatsSendMessage,
      get: mockV0ChatsGet,
    },
  })),
}))

vi.mock('@/lib/ai/appspec-generator', () => ({
  createDraftAppSpec: vi.fn(),
  regenerateAppSpec: vi.fn(),
  AppSpecValidationError: class extends Error {
    validationErrors: string[]
    constructor(message: string, errors: string[]) {
      super(message)
      this.validationErrors = errors
    }
  },
  AppSpecGenerationError: class extends Error {},
}))

// Import after mocks are set up
import { POST } from '@/app/api/chat/route'
import { auth } from '@/app/(auth)/auth'
import { getAppById } from '@/lib/db/queries'
import {
  createDraftAppSpec,
  regenerateAppSpec,
} from '@/lib/ai/appspec-generator'

/**
 * Creates a mock authenticated session
 */
const createMockSession = (userId: string = 'test-user-id') => ({
  user: {
    id: userId,
    email: 'test@example.com',
    name: 'Test User',
    type: 'regular' as const,
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
})

/**
 * Creates a valid mock AppSpec for testing
 */
const createMockAppSpec = (overrides?: Partial<FastformAppSpec>): FastformAppSpec => ({
  id: '123e4567-e89b-12d3-a456-426614174000',
  version: '0.3',
  meta: {
    name: 'Patient Intake Form',
    slug: 'patient-intake-form',
    description: 'A patient intake form for the clinic',
    orgId: 'org-123',
    orgSlug: 'test-clinic',
  },
  theme: {
    preset: 'healthcare-calm',
  },
  roles: [
    { id: 'PATIENT', authRequired: false },
    { id: 'STAFF', authRequired: true, routePrefix: '/staff' },
  ],
  pages: [
    {
      id: 'welcome',
      route: '/',
      role: 'PATIENT',
      type: 'welcome',
      title: 'Welcome to Patient Intake',
    },
    {
      id: 'intake-form',
      route: '/intake',
      role: 'PATIENT',
      type: 'form',
      title: 'Patient Information',
      fields: [
        {
          id: 'full_name',
          type: 'text',
          label: 'Full Name',
          required: true,
        },
        {
          id: 'email',
          type: 'email',
          label: 'Email Address',
          required: true,
        },
        {
          id: 'phone',
          type: 'tel',
          label: 'Phone Number',
          required: true,
        },
      ],
    },
    {
      id: 'staff-login',
      route: '/staff/login',
      role: 'STAFF',
      type: 'login',
      title: 'Staff Login',
    },
  ],
  workflow: {
    states: ['DRAFT', 'SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'REJECTED'],
    initialState: 'DRAFT',
    transitions: [
      { from: 'DRAFT', to: 'SUBMITTED', allowedRoles: ['PATIENT'] },
      { from: 'SUBMITTED', to: 'APPROVED', allowedRoles: ['STAFF'] },
      { from: 'SUBMITTED', to: 'REJECTED', allowedRoles: ['STAFF'] },
      { from: 'SUBMITTED', to: 'NEEDS_INFO', allowedRoles: ['STAFF'] },
      { from: 'NEEDS_INFO', to: 'SUBMITTED', allowedRoles: ['PATIENT'] },
    ],
  },
  api: {
    baseUrl: '{{FASTFORM_API_URL}}',
    endpoints: {
      createSubmission: 'POST /api/apps/:appId/submissions',
      getSubmission: 'GET /api/apps/:appId/submissions/:id',
      resubmitSubmission: 'POST /api/apps/:appId/submissions/:id/resubmit',
      staffLogin: 'POST /api/apps/:appId/staff/login',
      staffLogout: 'POST /api/apps/:appId/staff/logout',
      staffSession: 'GET /api/apps/:appId/staff/session',
      listSubmissions: 'GET /api/apps/:appId/staff/inbox',
      getSubmissionDetail: 'GET /api/apps/:appId/staff/submissions/:id',
      transitionSubmission: 'POST /api/apps/:appId/staff/submissions/:id/transition',
      trackEvent: 'POST /api/apps/:appId/events',
    },
  },
  analytics: {
    events: [
      { name: 'page_view', trigger: 'pageview', page: '/' },
      { name: 'form_submit', trigger: 'submit' },
    ],
  },
  environments: {
    staging: {
      domain: 'patient-intake-form-test-clinic-staging.getfastform.com',
      apiUrl: 'https://api-staging.getfastform.com',
    },
    production: {
      domain: 'patient-intake-form-test-clinic.getfastform.com',
      apiUrl: 'https://api.getfastform.com',
    },
  },
  ...overrides,
})

/**
 * Creates a mock NextRequest for testing
 */
const createMockRequest = (body: Record<string, unknown>): NextRequest => {
  return new NextRequest('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '127.0.0.1',
    },
    body: JSON.stringify(body),
  })
}

describe('Chat to AppSpec Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('First Message - Draft AppSpec Generation', () => {
    it('should generate draft AppSpec for first message in new chat', async () => {
      // Arrange
      const mockSession = createMockSession()
      const mockApp = {
        id: 'app-123',
        userId: 'test-user-id',
        name: 'Test App',
        spec: {}, // Empty spec triggers AppSpec generation
        createdAt: new Date(),
      }
      const mockDraftSpec = createMockAppSpec()

      vi.mocked(auth).mockResolvedValue(mockSession)
      vi.mocked(getAppById).mockResolvedValue(mockApp)
      vi.mocked(createDraftAppSpec).mockResolvedValue(mockDraftSpec)

      const request = createMockRequest({
        message: 'I need a patient intake form for my clinic',
        appId: 'app-123',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.type).toBe('intent-confirmation')
      expect(data.draftSpec).toBeDefined()
      expect(data.draftSpec.meta.name).toBe('Patient Intake Form')
      expect(data.sessionId).toBeDefined()
      expect(typeof data.sessionId).toBe('string')

      // Verify createDraftAppSpec was called with correct params
      expect(createDraftAppSpec).toHaveBeenCalledWith(
        'I need a patient intake form for my clinic',
        []
      )
    })

    it('should regenerate AppSpec when user continues chat before confirmation', async () => {
      // Arrange
      const mockSession = createMockSession()
      const mockApp = {
        id: 'app-123',
        userId: 'test-user-id',
        name: 'Test App',
        spec: {},
        createdAt: new Date(),
      }

      // First request to create draft
      const initialDraftSpec = createMockAppSpec()
      vi.mocked(auth).mockResolvedValue(mockSession)
      vi.mocked(getAppById).mockResolvedValue(mockApp)
      vi.mocked(createDraftAppSpec).mockResolvedValue(initialDraftSpec)

      const firstRequest = createMockRequest({
        message: 'I need a patient intake form for my clinic',
        appId: 'app-123',
      })

      const firstResponse = await POST(firstRequest)
      const firstData = await firstResponse.json()
      const sessionId = firstData.sessionId

      // Second request with session ID to regenerate
      const updatedDraftSpec = createMockAppSpec({
        meta: {
          name: 'Patient Intake Form with Insurance',
          slug: 'patient-intake-form-insurance',
          description: 'A patient intake form with insurance collection',
          orgId: 'org-123',
          orgSlug: 'test-clinic',
        },
      })
      vi.mocked(regenerateAppSpec).mockResolvedValue(updatedDraftSpec)

      const secondRequest = createMockRequest({
        message: 'Also add fields for insurance information',
        appId: 'app-123',
        sessionId,
      })

      // Act
      const secondResponse = await POST(secondRequest)
      const secondData = await secondResponse.json()

      // Assert
      expect(secondResponse.status).toBe(200)
      expect(secondData.type).toBe('intent-confirmation')
      expect(secondData.draftSpec.meta.name).toBe('Patient Intake Form with Insurance')
      expect(secondData.sessionId).toBe(sessionId) // Same session

      // Verify regenerateAppSpec was called
      expect(regenerateAppSpec).toHaveBeenCalledWith(
        initialDraftSpec,
        'Also add fields for insurance information'
      )
    })
  })

  describe('Authorization', () => {
    it('should allow anonymous request with mocked v0 response', async () => {
      // Arrange
      vi.mocked(auth).mockResolvedValue(null)

      // Mock v0-sdk to return a valid chat response for anonymous users
      mockV0ChatsCreate.mockResolvedValue({
        id: 'anonymous-chat-123',
        title: 'Test Chat',
        latestVersion: { id: 'v1', status: 'ready', files: [] },
        versions: [],
      })

      const request = createMockRequest({
        message: 'I need a patient intake form',
        // Note: Anonymous users don't need appId - they go directly to v0 SDK
      })

      // Act
      const response = await POST(request)

      // Assert - Anonymous users bypass AppSpec generation and use v0 SDK directly
      // The response should succeed with the mocked v0 response
      expect(response.status).toBe(200)
      expect(mockV0ChatsCreate).toHaveBeenCalled()
    })

    it('should reject request when user does not own the app', async () => {
      // Arrange
      const mockSession = createMockSession('different-user-id')
      const mockApp = {
        id: 'app-123',
        userId: 'test-user-id', // Different from session user
        name: 'Test App',
        spec: {},
        createdAt: new Date(),
      }

      vi.mocked(auth).mockResolvedValue(mockSession)
      vi.mocked(getAppById).mockResolvedValue(mockApp)

      const request = createMockRequest({
        message: 'I need a patient intake form',
        appId: 'app-123',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden - you do not own this app')
    })

    it('should reject request when app is not found', async () => {
      // Arrange
      const mockSession = createMockSession()
      vi.mocked(auth).mockResolvedValue(mockSession)
      vi.mocked(getAppById).mockResolvedValue(null)

      const request = createMockRequest({
        message: 'I need a patient intake form',
        appId: 'non-existent-app',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(404)
      expect(data.error).toBe('App not found')
    })
  })

  describe('Validation', () => {
    it('should reject request without message', async () => {
      // Arrange
      vi.mocked(auth).mockResolvedValue(createMockSession())

      const request = createMockRequest({
        appId: 'app-123',
        // message is missing
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.error).toBe('Message is required')
    })

    it('should require appId for new authenticated chats', async () => {
      // Arrange
      const mockSession = createMockSession()
      vi.mocked(auth).mockResolvedValue(mockSession)

      const request = createMockRequest({
        message: 'I need a patient intake form',
        // appId is missing
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.error).toBe('appId is required for new chats')
    })
  })

  describe('Error Handling', () => {
    it('should handle AppSpec generation errors gracefully', async () => {
      // Arrange
      const mockSession = createMockSession()
      const mockApp = {
        id: 'app-123',
        userId: 'test-user-id',
        name: 'Test App',
        spec: {},
        createdAt: new Date(),
      }

      vi.mocked(auth).mockResolvedValue(mockSession)
      vi.mocked(getAppById).mockResolvedValue(mockApp)

      // Import the error classes for proper instanceof checks
      const { AppSpecGenerationError } = await import('@/lib/ai/appspec-generator')
      vi.mocked(createDraftAppSpec).mockRejectedValue(
        new AppSpecGenerationError('LLM service unavailable')
      )

      const request = createMockRequest({
        message: 'I need a patient intake form',
        appId: 'app-123',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to generate AppSpec')
      expect(data.details).toBe('LLM service unavailable')
    })

    it('should handle AppSpec validation errors with details', async () => {
      // Arrange
      const mockSession = createMockSession()
      const mockApp = {
        id: 'app-123',
        userId: 'test-user-id',
        name: 'Test App',
        spec: {},
        createdAt: new Date(),
      }

      vi.mocked(auth).mockResolvedValue(mockSession)
      vi.mocked(getAppById).mockResolvedValue(mockApp)

      // Import the error classes for proper instanceof checks
      const { AppSpecValidationError } = await import('@/lib/ai/appspec-generator')
      const validationError = new AppSpecValidationError(
        'Invalid AppSpec',
        ['Missing required field: meta.name', 'Invalid theme preset']
      )
      vi.mocked(createDraftAppSpec).mockRejectedValue(validationError)

      const request = createMockRequest({
        message: 'I need a patient intake form',
        appId: 'app-123',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to generate AppSpec')
      expect(data.validationErrors).toEqual([
        'Missing required field: meta.name',
        'Invalid theme preset',
      ])
    })
  })

  describe('AppSpec Content Validation', () => {
    it('should generate AppSpec with all required fields', async () => {
      // Arrange
      const mockSession = createMockSession()
      const mockApp = {
        id: 'app-123',
        userId: 'test-user-id',
        name: 'Test App',
        spec: {},
        createdAt: new Date(),
      }
      const mockDraftSpec = createMockAppSpec()

      vi.mocked(auth).mockResolvedValue(mockSession)
      vi.mocked(getAppById).mockResolvedValue(mockApp)
      vi.mocked(createDraftAppSpec).mockResolvedValue(mockDraftSpec)

      const request = createMockRequest({
        message: 'I need a patient intake form for my clinic',
        appId: 'app-123',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert - Verify AppSpec structure
      const spec = data.draftSpec
      expect(spec.id).toBeDefined()
      expect(spec.version).toBe('0.3')
      expect(spec.meta).toBeDefined()
      expect(spec.meta.name).toBeDefined()
      expect(spec.meta.slug).toBeDefined()
      expect(spec.theme).toBeDefined()
      expect(spec.roles).toBeDefined()
      expect(spec.roles.length).toBeGreaterThan(0)
      expect(spec.pages).toBeDefined()
      expect(spec.pages.length).toBeGreaterThan(0)
      expect(spec.workflow).toBeDefined()
      expect(spec.workflow.states).toBeDefined()
      expect(spec.workflow.transitions).toBeDefined()
      expect(spec.api).toBeDefined()
      expect(spec.environments).toBeDefined()
    })

    it('should include form fields in generated AppSpec', async () => {
      // Arrange
      const mockSession = createMockSession()
      const mockApp = {
        id: 'app-123',
        userId: 'test-user-id',
        name: 'Test App',
        spec: {},
        createdAt: new Date(),
      }
      const mockDraftSpec = createMockAppSpec()

      vi.mocked(auth).mockResolvedValue(mockSession)
      vi.mocked(getAppById).mockResolvedValue(mockApp)
      vi.mocked(createDraftAppSpec).mockResolvedValue(mockDraftSpec)

      const request = createMockRequest({
        message: 'I need a patient intake form with name, email, and phone',
        appId: 'app-123',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert - Verify form fields
      const formPage = data.draftSpec.pages.find((p: { type: string }) => p.type === 'form')
      expect(formPage).toBeDefined()
      expect(formPage.fields).toBeDefined()
      expect(formPage.fields.length).toBeGreaterThan(0)

      // Verify field structure
      const nameField = formPage.fields.find((f: { id: string }) => f.id === 'full_name')
      expect(nameField).toBeDefined()
      expect(nameField.type).toBe('text')
      expect(nameField.label).toBe('Full Name')
      expect(nameField.required).toBe(true)
    })
  })

  describe('Session Management', () => {
    it('should generate new sessionId for first message', async () => {
      // Arrange
      const mockSession = createMockSession()
      const mockApp = {
        id: 'app-123',
        userId: 'test-user-id',
        name: 'Test App',
        spec: {},
        createdAt: new Date(),
      }
      const mockDraftSpec = createMockAppSpec()

      vi.mocked(auth).mockResolvedValue(mockSession)
      vi.mocked(getAppById).mockResolvedValue(mockApp)
      vi.mocked(createDraftAppSpec).mockResolvedValue(mockDraftSpec)

      const request = createMockRequest({
        message: 'I need a patient intake form',
        appId: 'app-123',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(data.sessionId).toBeDefined()
      // UUID format check
      expect(data.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    })

    it('should maintain sessionId when regenerating AppSpec', async () => {
      // Arrange
      const mockSession = createMockSession()
      const mockApp = {
        id: 'app-123',
        userId: 'test-user-id',
        name: 'Test App',
        spec: {},
        createdAt: new Date(),
      }
      const initialDraftSpec = createMockAppSpec()
      const updatedDraftSpec = createMockAppSpec({
        meta: {
          ...createMockAppSpec().meta,
          name: 'Updated Form',
        },
      })

      vi.mocked(auth).mockResolvedValue(mockSession)
      vi.mocked(getAppById).mockResolvedValue(mockApp)
      vi.mocked(createDraftAppSpec).mockResolvedValue(initialDraftSpec)

      // First request
      const firstRequest = createMockRequest({
        message: 'I need a patient intake form',
        appId: 'app-123',
      })
      const firstResponse = await POST(firstRequest)
      const firstData = await firstResponse.json()
      const originalSessionId = firstData.sessionId

      // Setup for second request
      vi.mocked(regenerateAppSpec).mockResolvedValue(updatedDraftSpec)

      // Second request with same session
      const secondRequest = createMockRequest({
        message: 'Add more fields',
        appId: 'app-123',
        sessionId: originalSessionId,
      })

      // Act
      const secondResponse = await POST(secondRequest)
      const secondData = await secondResponse.json()

      // Assert - Session ID should be preserved
      expect(secondData.sessionId).toBe(originalSessionId)
    })
  })

  describe('Existing AppSpec Handling', () => {
    it('should skip AppSpec generation if app already has a spec', async () => {
      // Arrange
      const mockSession = createMockSession()
      const existingSpec = createMockAppSpec()
      const mockApp = {
        id: 'app-123',
        userId: 'test-user-id',
        name: 'Test App',
        spec: existingSpec, // App already has a spec
        createdAt: new Date(),
      }

      vi.mocked(auth).mockResolvedValue(mockSession)
      vi.mocked(getAppById).mockResolvedValue(mockApp)

      const request = createMockRequest({
        message: 'Add a new field',
        appId: 'app-123',
      })

      // Act
      await POST(request)

      // Assert - Should not trigger AppSpec generation
      expect(createDraftAppSpec).not.toHaveBeenCalled()
      // Falls through to v0 SDK flow (rate limit check, etc.)
    })
  })
})
