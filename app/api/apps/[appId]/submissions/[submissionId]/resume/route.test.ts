import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { FastformAppSpec } from '@/lib/types/appspec'

// Mock server-only module
vi.mock('server-only', () => ({}))

// Mock jose library
vi.mock('jose', () => ({
  jwtVerify: vi.fn(),
  SignJWT: vi.fn(),
}))

// Mock dependencies
vi.mock('@/lib/db/queries')
vi.mock('@/lib/submissions/validation')
vi.mock('@/lib/auth/jwt')
vi.mock('@/lib/types/appspec', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    isValidAppSpec: vi.fn(() => true),
  }
})

// Import after mocks are set up
const { GET, PATCH } = await import('./route')
const queries = await import('@/lib/db/queries')
const validation = await import('@/lib/submissions/validation')
const jwt = await import('@/lib/auth/jwt')

describe('Resume Submission API', () => {
  const mockAppId = '123e4567-e89b-12d3-a456-426614174000'
  const mockSubmissionId = 'sub-123'
  const mockJWTSecret = 'test-secret-key-12345'
  const mockToken = 'valid.jwt.token'

  const mockAppSpec: FastformAppSpec = {
    id: mockAppId,
    version: '0.3' as const,
    meta: {
      name: 'Test App',
      slug: 'test-app',
      description: 'Test description',
      orgId: 'org-123',
      orgSlug: 'test-org',
    },
    theme: { preset: 'healthcare-calm' as const },
    roles: [{ id: 'PATIENT' as const, authRequired: false }],
    pages: [
      {
        id: 'page-1',
        route: '/',
        role: 'PATIENT' as const,
        type: 'form' as const,
        title: 'Test Form',
        fields: [
          {
            id: 'name',
            type: 'text' as const,
            label: 'Name',
            required: true,
          },
          {
            id: 'email',
            type: 'email' as const,
            label: 'Email',
            required: true,
          },
          {
            id: 'phone',
            type: 'tel' as const,
            label: 'Phone',
            required: false,
          },
        ],
      },
    ],
    workflow: {
      states: [
        'DRAFT' as const,
        'SUBMITTED' as const,
        'UNDER_REVIEW' as const,
        'NEEDS_INFO' as const,
        'APPROVED' as const,
      ],
      initialState: 'DRAFT' as const,
      transitions: [],
    },
    api: {
      baseUrl: '{{FASTFORM_API_URL}}' as const,
      endpoints: {
        createSubmission: '/api/submissions',
        getSubmission: '/api/submissions/:id',
        resubmitSubmission: '/api/submissions/:id/resubmit',
        staffLogin: '/api/auth/login',
        staffLogout: '/api/auth/logout',
        staffSession: '/api/auth/session',
        listSubmissions: '/api/submissions',
        getSubmissionDetail: '/api/submissions/:id',
        transitionSubmission: '/api/submissions/:id/transition',
        trackEvent: '/api/analytics',
      },
    },
    analytics: { events: [] },
    environments: {
      staging: {
        domain: 'staging.example.com',
        apiUrl: 'https://api.staging.example.com',
      },
      production: { domain: 'example.com', apiUrl: 'https://api.example.com' },
    },
  }

  const mockApp = {
    id: mockAppId,
    userId: 'user-123',
    name: 'Test App',
    spec: mockAppSpec,
    jwtSecret: mockJWTSecret,
    createdAt: new Date(),
  }

  const mockSubmission = {
    id: mockSubmissionId,
    appId: mockAppId,
    data: {
      name: 'John Doe',
      email: 'john@example.com',
    },
    status: 'NEEDS_INFO',
    submittedBy: 'john@example.com',
    assignedTo: null,
    deleted: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  }

  const mockHistory = [
    {
      id: 'hist-1',
      submissionId: mockSubmissionId,
      status: 'SUBMITTED',
      updatedBy: 'john@example.com',
      notes: null,
      createdAt: new Date('2024-01-01T00:00:00Z'),
    },
    {
      id: 'hist-2',
      submissionId: mockSubmissionId,
      status: 'UNDER_REVIEW',
      updatedBy: 'staff@example.com',
      notes: null,
      createdAt: new Date('2024-01-02T00:00:00Z'),
    },
    {
      id: 'hist-3',
      submissionId: mockSubmissionId,
      status: 'NEEDS_INFO',
      updatedBy: 'staff@example.com',
      notes: 'Please provide your phone number',
      createdAt: new Date('2024-01-03T00:00:00Z'),
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============================================================================
  // GET TESTS - Retrieve submission for editing
  // ============================================================================

  describe('GET /api/apps/[appId]/submissions/[submissionId]/resume', () => {
    it('should successfully retrieve submission in NEEDS_INFO status for editing', async () => {
      // Setup
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
      vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
      vi.mocked(queries.getSubmissionById).mockResolvedValue(mockSubmission)
      vi.mocked(queries.getSubmissionHistory).mockResolvedValue(mockHistory)

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'GET',
          headers: { authorization: `Bearer ${mockToken}` },
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      // Execute
      const response = await GET(request, { params })
      const json = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.submission.id).toBe(mockSubmissionId)
      expect(json.submission.status).toBe('NEEDS_INFO')
      expect(json.submission.data).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
      })
      expect(json.submission.staffNotes).toBe('Please provide your phone number')
      expect(json.submission.history).toHaveLength(3)
    })

    it('should return 400 when submission is not in NEEDS_INFO status', async () => {
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
      vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
      vi.mocked(queries.getSubmissionById).mockResolvedValue({
        ...mockSubmission,
        status: 'APPROVED',
      })

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'GET',
          headers: { authorization: `Bearer ${mockToken}` },
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await GET(request, { params })
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.success).toBe(false)
      expect(json.error).toBe('This submission cannot be resumed')
      expect(json.details).toBe('Submission is not in NEEDS_INFO status')
    })

    it('should return 401 when authorization header is missing', async () => {
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(null)

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'GET',
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await GET(request, { params })
      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json.success).toBe(false)
      expect(json.error).toBe('Authentication required')
    })

    it('should return 404 when app does not exist', async () => {
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(undefined)

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'GET',
          headers: { authorization: `Bearer ${mockToken}` },
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await GET(request, { params })
      const json = await response.json()

      expect(response.status).toBe(404)
      expect(json.success).toBe(false)
      expect(json.error).toBe('App not found')
    })

    it('should return 404 when submission does not exist', async () => {
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
      vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
      vi.mocked(queries.getSubmissionById).mockResolvedValue(undefined)

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'GET',
          headers: { authorization: `Bearer ${mockToken}` },
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await GET(request, { params })
      const json = await response.json()

      expect(response.status).toBe(404)
      expect(json.success).toBe(false)
      expect(json.error).toBe('Submission not found')
    })

    it('should return 404 when submission is soft deleted', async () => {
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
      vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
      vi.mocked(queries.getSubmissionById).mockResolvedValue({
        ...mockSubmission,
        deleted: new Date(),
      })

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'GET',
          headers: { authorization: `Bearer ${mockToken}` },
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await GET(request, { params })
      const json = await response.json()

      expect(response.status).toBe(404)
      expect(json.success).toBe(false)
      expect(json.error).toBe('Submission has been deleted')
    })

    it('should return 401 when JWT verification fails', async () => {
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
      vi.mocked(jwt.verifyAppJWT).mockRejectedValue(new Error('Invalid token'))

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'GET',
          headers: { authorization: `Bearer ${mockToken}` },
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await GET(request, { params })
      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json.success).toBe(false)
      expect(json.error).toBe('Authentication failed')
    })
  })

  // ============================================================================
  // PATCH TESTS - Resume and update submission
  // ============================================================================

  describe('PATCH /api/apps/[appId]/submissions/[submissionId]/resume', () => {
    it('should successfully update submission and transition to UNDER_REVIEW', async () => {
      const updatedData = {
        phone: '555-1234',
      }

      const updatedSubmission = {
        ...mockSubmission,
        data: {
          name: 'John Doe',
          email: 'john@example.com',
          phone: '555-1234',
        },
        status: 'UNDER_REVIEW',
        updatedAt: new Date('2024-01-04T00:00:00Z'),
      }

      // Setup
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
      vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
      vi.mocked(queries.getSubmissionById).mockResolvedValue(mockSubmission)
      vi.mocked(validation.validateSubmission).mockReturnValue({ valid: true, errors: [] })
      vi.mocked(validation.sanitizeSubmissionData).mockReturnValue(updatedSubmission.data)
      vi.mocked(queries.updateSubmissionData).mockResolvedValue([updatedSubmission])
      vi.mocked(queries.createSubmissionHistory).mockResolvedValue([
        {
          id: 'hist-4',
          submissionId: mockSubmissionId,
          status: 'UNDER_REVIEW',
          updatedBy: 'john@example.com',
          notes: 'User resubmitted with additional information',
          createdAt: new Date('2024-01-04T00:00:00Z'),
        },
      ])

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'PATCH',
          headers: { authorization: `Bearer ${mockToken}` },
          body: JSON.stringify({ data: updatedData }),
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      // Execute
      const response = await PATCH(request, { params })
      const json = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.submission.id).toBe(mockSubmissionId)
      expect(json.submission.status).toBe('UNDER_REVIEW')
      expect(json.submission.message).toBe('Submission updated and moved to review')

      // Verify data was merged correctly
      expect(validation.validateSubmission).toHaveBeenCalledWith(
        {
          name: 'John Doe',
          email: 'john@example.com',
          phone: '555-1234',
        },
        mockAppSpec
      )

      // Verify update was called with merged data
      expect(queries.updateSubmissionData).toHaveBeenCalledWith({
        submissionId: mockSubmissionId,
        data: updatedSubmission.data,
        status: 'UNDER_REVIEW',
      })

      // Verify audit trail was created
      expect(queries.createSubmissionHistory).toHaveBeenCalledWith({
        submissionId: mockSubmissionId,
        status: 'UNDER_REVIEW',
        updatedBy: 'john@example.com',
        notes: 'User resubmitted with additional information',
      })
    })

    it('should merge updated data with existing data correctly', async () => {
      const updatedData = {
        phone: '555-1234',
        email: 'newemail@example.com', // Override existing field
      }

      const expectedMergedData = {
        name: 'John Doe', // Preserved from existing
        email: 'newemail@example.com', // Updated
        phone: '555-1234', // Added
      }

      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
      vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
      vi.mocked(queries.getSubmissionById).mockResolvedValue(mockSubmission)
      vi.mocked(validation.validateSubmission).mockReturnValue({ valid: true, errors: [] })
      vi.mocked(validation.sanitizeSubmissionData).mockReturnValue(expectedMergedData)
      vi.mocked(queries.updateSubmissionData).mockResolvedValue([
        {
          ...mockSubmission,
          data: expectedMergedData,
          status: 'UNDER_REVIEW',
        },
      ])
      vi.mocked(queries.createSubmissionHistory).mockResolvedValue([mockHistory[0]])

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'PATCH',
          headers: { authorization: `Bearer ${mockToken}` },
          body: JSON.stringify({ data: updatedData }),
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await PATCH(request, { params })

      expect(response.status).toBe(200)
      expect(validation.validateSubmission).toHaveBeenCalledWith(
        expectedMergedData,
        mockAppSpec
      )
    })

    it('should return 400 when validation fails on updated data', async () => {
      const updatedData = {
        email: 'invalid-email', // Invalid email format
      }

      const validationErrors = [
        {
          field: 'email',
          message: 'Email must be a valid email address',
          code: 'INVALID_FORMAT' as const,
        },
      ]

      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
      vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
      vi.mocked(queries.getSubmissionById).mockResolvedValue(mockSubmission)
      vi.mocked(validation.validateSubmission).mockReturnValue({
        valid: false,
        errors: validationErrors,
      })

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'PATCH',
          headers: { authorization: `Bearer ${mockToken}` },
          body: JSON.stringify({ data: updatedData }),
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await PATCH(request, { params })
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.success).toBe(false)
      expect(json.error).toBe('Validation failed')
      expect(json.validationErrors).toEqual(validationErrors)
    })

    it('should return 400 when submission is not in NEEDS_INFO status', async () => {
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
      vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
      vi.mocked(queries.getSubmissionById).mockResolvedValue({
        ...mockSubmission,
        status: 'APPROVED',
      })

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'PATCH',
          headers: { authorization: `Bearer ${mockToken}` },
          body: JSON.stringify({ data: { phone: '555-1234' } }),
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await PATCH(request, { params })
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.success).toBe(false)
      expect(json.error).toBe('This submission cannot be resumed')
    })

    it('should return 401 when authorization header is missing', async () => {
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(null)

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'PATCH',
          body: JSON.stringify({ data: { phone: '555-1234' } }),
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await PATCH(request, { params })
      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json.success).toBe(false)
      expect(json.error).toBe('Authentication required')
    })

    it('should return 401 when JWT verification fails', async () => {
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
      vi.mocked(jwt.verifyAppJWT).mockRejectedValue(new Error('Token expired'))

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'PATCH',
          headers: { authorization: `Bearer ${mockToken}` },
          body: JSON.stringify({ data: { phone: '555-1234' } }),
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await PATCH(request, { params })
      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json.success).toBe(false)
      expect(json.error).toBe('Authentication failed')
    })

    it('should return 401 when JWT appId does not match URL appId', async () => {
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
      vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: 'different-app-id' })

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'PATCH',
          headers: { authorization: `Bearer ${mockToken}` },
          body: JSON.stringify({ data: { phone: '555-1234' } }),
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await PATCH(request, { params })
      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json.success).toBe(false)
      expect(json.error).toBe('Authentication failed')
      expect(json.message).toBe('Token does not match app ID')
    })

    it('should return 404 when app does not exist', async () => {
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(undefined)

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'PATCH',
          headers: { authorization: `Bearer ${mockToken}` },
          body: JSON.stringify({ data: { phone: '555-1234' } }),
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await PATCH(request, { params })
      const json = await response.json()

      expect(response.status).toBe(404)
      expect(json.success).toBe(false)
      expect(json.error).toBe('App not found')
    })

    it('should return 404 when submission does not exist', async () => {
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
      vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
      vi.mocked(queries.getSubmissionById).mockResolvedValue(undefined)

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'PATCH',
          headers: { authorization: `Bearer ${mockToken}` },
          body: JSON.stringify({ data: { phone: '555-1234' } }),
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await PATCH(request, { params })
      const json = await response.json()

      expect(response.status).toBe(404)
      expect(json.success).toBe(false)
      expect(json.error).toBe('Submission not found')
    })

    it('should return 404 when submission does not belong to app', async () => {
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
      vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
      vi.mocked(queries.getSubmissionById).mockResolvedValue({
        ...mockSubmission,
        appId: 'different-app-id',
      })

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'PATCH',
          headers: { authorization: `Bearer ${mockToken}` },
          body: JSON.stringify({ data: { phone: '555-1234' } }),
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await PATCH(request, { params })
      const json = await response.json()

      expect(response.status).toBe(404)
      expect(json.success).toBe(false)
      expect(json.error).toBe('Submission does not belong to this app')
    })

    it('should return 400 when submission is soft deleted', async () => {
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
      vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
      vi.mocked(queries.getSubmissionById).mockResolvedValue({
        ...mockSubmission,
        deleted: new Date(),
      })

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'PATCH',
          headers: { authorization: `Bearer ${mockToken}` },
          body: JSON.stringify({ data: { phone: '555-1234' } }),
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await PATCH(request, { params })
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.success).toBe(false)
      expect(json.error).toBe('Cannot update deleted submission')
    })

    it('should return 400 when request body is missing data field', async () => {
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
      vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'PATCH',
          headers: { authorization: `Bearer ${mockToken}` },
          body: JSON.stringify({}),
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await PATCH(request, { params })
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.success).toBe(false)
      expect(json.error).toBe('Invalid request')
      expect(json.message).toBe('Request body must contain a "data" object')
    })

    it('should return 400 when request body has invalid JSON', async () => {
      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
      vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'PATCH',
          headers: { authorization: `Bearer ${mockToken}` },
          body: 'invalid json',
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await PATCH(request, { params })
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.success).toBe(false)
      expect(json.error).toBe('Invalid request')
    })

    it('should handle missing required fields in merged data', async () => {
      const submissionWithoutEmail = {
        ...mockSubmission,
        data: {
          name: 'John Doe',
          // email is missing
        },
      }

      const validationErrors = [
        {
          field: 'email',
          message: 'Email is required',
          code: 'REQUIRED' as const,
        },
      ]

      vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
      vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
      vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
      vi.mocked(queries.getSubmissionById).mockResolvedValue(submissionWithoutEmail)
      vi.mocked(validation.validateSubmission).mockReturnValue({
        valid: false,
        errors: validationErrors,
      })

      const request = new NextRequest(
        `http://localhost/api/apps/${mockAppId}/submissions/${mockSubmissionId}/resume`,
        {
          method: 'PATCH',
          headers: { authorization: `Bearer ${mockToken}` },
          body: JSON.stringify({ data: { phone: '555-1234' } }),
        }
      )

      const params = Promise.resolve({ appId: mockAppId, submissionId: mockSubmissionId })

      const response = await PATCH(request, { params })
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.success).toBe(false)
      expect(json.error).toBe('Validation failed')
      expect(json.validationErrors).toEqual(validationErrors)
    })
  })
})
