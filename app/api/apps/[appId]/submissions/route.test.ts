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

// Import after mocks are set up
const { POST, GET } = await import('./route')
const queries = await import('@/lib/db/queries')
const validation = await import('@/lib/submissions/validation')
const jwt = await import('@/lib/auth/jwt')

describe('POST /api/apps/[appId]/submissions', () => {
  const mockAppId = '123e4567-e89b-12d3-a456-426614174000'
  const mockJWTSecret = 'test-secret-key-12345'
  const mockToken = 'valid.jwt.token'

  const mockApp = {
    id: mockAppId,
    userId: 'user-123',
    name: 'Test App',
    spec: {
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
          ],
        },
      ],
      workflow: {
        states: ['DRAFT' as const, 'SUBMITTED' as const],
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
        staging: { domain: 'staging.example.com', apiUrl: 'https://api.staging.example.com' },
        production: { domain: 'example.com', apiUrl: 'https://api.example.com' },
      },
    } as FastformAppSpec,
    jwtSecret: mockJWTSecret,
    createdAt: new Date(),
  }

  const mockSubmissionData = {
    name: 'John Doe',
    email: 'john@example.com',
  }

  const mockSubmission = {
    id: 'sub-123',
    appId: mockAppId,
    data: mockSubmissionData,
    status: 'SUBMITTED',
    submittedBy: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    assignedTo: null,
    deleted: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should successfully create a submission with valid data', async () => {
    // Setup
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
    vi.mocked(validation.validateSubmission).mockReturnValue({ valid: true, errors: [] })
    vi.mocked(validation.sanitizeSubmissionData).mockReturnValue(mockSubmissionData)
    vi.mocked(queries.createSubmission).mockResolvedValue([mockSubmission])

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'POST',
      headers: { authorization: `Bearer ${mockToken}` },
      body: JSON.stringify({ data: mockSubmissionData }),
    })

    const params = Promise.resolve({ appId: mockAppId })

    // Execute
    const response = await POST(request, { params })
    const json = await response.json()

    // Assert
    expect(response.status).toBe(201)
    expect(json.success).toBe(true)
    expect(json.submission.id).toBe('sub-123')
    expect(json.submission.status).toBe('SUBMITTED')
    expect(queries.createSubmission).toHaveBeenCalledWith({
      appId: mockAppId,
      data: mockSubmissionData,
      status: 'SUBMITTED',
      submittedBy: null,
    })
  })

  it('should create submission with submittedBy identifier', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
    vi.mocked(validation.validateSubmission).mockReturnValue({ valid: true, errors: [] })
    vi.mocked(validation.sanitizeSubmissionData).mockReturnValue(mockSubmissionData)
    vi.mocked(queries.createSubmission).mockResolvedValue([
      { ...mockSubmission, submittedBy: 'user@example.com' },
    ])

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'POST',
      headers: { authorization: `Bearer ${mockToken}` },
      body: JSON.stringify({
        data: mockSubmissionData,
        submittedBy: 'user@example.com',
      }),
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await POST(request, { params })
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.submission.submittedBy).toBe('user@example.com')
    expect(queries.createSubmission).toHaveBeenCalledWith({
      appId: mockAppId,
      data: mockSubmissionData,
      status: 'SUBMITTED',
      submittedBy: 'user@example.com',
    })
  })

  it('should return 401 when authorization header is missing', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(null)

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'POST',
      body: JSON.stringify({ data: mockSubmissionData }),
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await POST(request, { params })
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Authentication required')
  })

  it('should return 401 when authorization header is malformed', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(null)

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'POST',
      headers: { authorization: 'InvalidFormat' },
      body: JSON.stringify({ data: mockSubmissionData }),
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await POST(request, { params })
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.success).toBe(false)
  })

  it('should return 404 when app does not exist', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(undefined)

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'POST',
      headers: { authorization: `Bearer ${mockToken}` },
      body: JSON.stringify({ data: mockSubmissionData }),
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await POST(request, { params })
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.success).toBe(false)
    expect(json.error).toBe('App not found')
  })

  it('should return 403 when app has no JWT secret configured', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue({
      ...mockApp,
      jwtSecret: null,
    })

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'POST',
      headers: { authorization: `Bearer ${mockToken}` },
      body: JSON.stringify({ data: mockSubmissionData }),
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await POST(request, { params })
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.success).toBe(false)
    expect(json.error).toBe('App not configured')
  })

  it('should return 401 when JWT verification fails', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockRejectedValue(new Error('Invalid token'))

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'POST',
      headers: { authorization: `Bearer ${mockToken}` },
      body: JSON.stringify({ data: mockSubmissionData }),
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await POST(request, { params })
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Authentication failed')
  })

  it('should return 401 when JWT appId does not match URL appId', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: 'different-app-id' })

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'POST',
      headers: { authorization: `Bearer ${mockToken}` },
      body: JSON.stringify({ data: mockSubmissionData }),
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await POST(request, { params })
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.message).toContain('does not match app ID')
  })

  it('should return 400 when request body is invalid JSON', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'POST',
      headers: { authorization: `Bearer ${mockToken}` },
      body: 'invalid json',
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await POST(request, { params })
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Invalid request')
  })

  it('should return 400 when data field is missing', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'POST',
      headers: { authorization: `Bearer ${mockToken}` },
      body: JSON.stringify({ submittedBy: 'test' }),
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await POST(request, { params })
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.message).toContain('must contain a "data" object')
  })

  it('should return 404 when app has no spec configured', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue({
      ...mockApp,
      spec: null,
    })
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'POST',
      headers: { authorization: `Bearer ${mockToken}` },
      body: JSON.stringify({ data: mockSubmissionData }),
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await POST(request, { params })
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.success).toBe(false)
    expect(json.error).toBe('App configuration error')
  })

  it('should return 400 when validation fails with missing required field', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
    vi.mocked(validation.validateSubmission).mockReturnValue({
      valid: false,
      errors: [
        {
          field: 'email',
          message: 'Email is required',
          code: 'REQUIRED',
        },
      ],
    })

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'POST',
      headers: { authorization: `Bearer ${mockToken}` },
      body: JSON.stringify({ data: { name: 'John' } }),
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await POST(request, { params })
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Validation failed')
    expect(json.validationErrors).toHaveLength(1)
    expect(json.validationErrors[0].field).toBe('email')
  })

  it('should return 400 when validation fails with invalid format', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
    vi.mocked(validation.validateSubmission).mockReturnValue({
      valid: false,
      errors: [
        {
          field: 'email',
          message: 'Email must be a valid email address',
          code: 'INVALID_FORMAT',
        },
      ],
    })

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'POST',
      headers: { authorization: `Bearer ${mockToken}` },
      body: JSON.stringify({ data: { name: 'John', email: 'invalid-email' } }),
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await POST(request, { params })
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.validationErrors[0].code).toBe('INVALID_FORMAT')
  })

  it('should sanitize submission data before storing', async () => {
    const unsafeData = {
      name: 'John<script>alert("xss")</script>',
      email: 'john@example.com',
    }

    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
    vi.mocked(validation.validateSubmission).mockReturnValue({ valid: true, errors: [] })
    vi.mocked(validation.sanitizeSubmissionData).mockReturnValue(mockSubmissionData)
    vi.mocked(queries.createSubmission).mockResolvedValue([mockSubmission])

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'POST',
      headers: { authorization: `Bearer ${mockToken}` },
      body: JSON.stringify({ data: unsafeData }),
    })

    const params = Promise.resolve({ appId: mockAppId })
    await POST(request, { params })

    expect(validation.sanitizeSubmissionData).toHaveBeenCalledWith(unsafeData)
  })

  it('should return 500 when database creation fails', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
    vi.mocked(validation.validateSubmission).mockReturnValue({ valid: true, errors: [] })
    vi.mocked(validation.sanitizeSubmissionData).mockReturnValue(mockSubmissionData)
    vi.mocked(queries.createSubmission).mockRejectedValue(new Error('Database error'))

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'POST',
      headers: { authorization: `Bearer ${mockToken}` },
      body: JSON.stringify({ data: mockSubmissionData }),
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await POST(request, { params })
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Internal server error')
  })
})

describe('GET /api/apps/[appId]/submissions', () => {
  const mockAppId = '123e4567-e89b-12d3-a456-426614174000'
  const mockJWTSecret = 'test-secret-key-12345'
  const mockToken = 'valid.jwt.token'

  const mockApp = {
    id: mockAppId,
    userId: 'user-123',
    name: 'Test App',
    spec: {},
    jwtSecret: mockJWTSecret,
    createdAt: new Date(),
  }

  const mockSubmissions = [
    {
      id: 'sub-1',
      appId: mockAppId,
      data: { name: 'John' },
      status: 'SUBMITTED',
      submittedBy: 'john@example.com',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      assignedTo: null,
      deleted: null,
    },
    {
      id: 'sub-2',
      appId: mockAppId,
      data: { name: 'Jane' },
      status: 'APPROVED',
      submittedBy: 'jane@example.com',
      createdAt: new Date('2024-01-02T00:00:00Z'),
      updatedAt: new Date('2024-01-02T00:00:00Z'),
      assignedTo: null,
      deleted: null,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should successfully fetch submissions', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
    vi.mocked(queries.getSubmissionsByAppId).mockResolvedValue({
      submissions: mockSubmissions,
      total: 2,
    })

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'GET',
      headers: { authorization: `Bearer ${mockToken}` },
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await GET(request, { params })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.submissions).toHaveLength(2)
    expect(json.submissions[0].id).toBe('sub-1')
    expect(json.pagination.total).toBe(2)
  })

  it('should filter submissions by status', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
    vi.mocked(queries.getSubmissionsByAppId).mockResolvedValue({
      submissions: [mockSubmissions[0]],
      total: 1,
    })

    const request = new NextRequest('http://localhost/api/apps/123/submissions?status=SUBMITTED', {
      method: 'GET',
      headers: { authorization: `Bearer ${mockToken}` },
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await GET(request, { params })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.submissions).toHaveLength(1)
    expect(queries.getSubmissionsByAppId).toHaveBeenCalledWith({
      appId: mockAppId,
      status: 'SUBMITTED',
      page: 1,
      limit: 20,
    })
  })

  it('should support pagination with page parameter', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
    vi.mocked(queries.getSubmissionsByAppId).mockResolvedValue({
      submissions: [],
      total: 50,
    })

    const request = new NextRequest('http://localhost/api/apps/123/submissions?page=3', {
      method: 'GET',
      headers: { authorization: `Bearer ${mockToken}` },
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await GET(request, { params })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.pagination.page).toBe(3)
    expect(queries.getSubmissionsByAppId).toHaveBeenCalledWith({
      appId: mockAppId,
      status: undefined,
      page: 3,
      limit: 20,
    })
  })

  it('should support custom limit parameter', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
    vi.mocked(queries.getSubmissionsByAppId).mockResolvedValue({
      submissions: [],
      total: 100,
    })

    const request = new NextRequest('http://localhost/api/apps/123/submissions?limit=50', {
      method: 'GET',
      headers: { authorization: `Bearer ${mockToken}` },
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await GET(request, { params })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.pagination.limit).toBe(50)
  })

  it('should cap limit at 100', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
    vi.mocked(queries.getSubmissionsByAppId).mockResolvedValue({
      submissions: [],
      total: 200,
    })

    const request = new NextRequest('http://localhost/api/apps/123/submissions?limit=500', {
      method: 'GET',
      headers: { authorization: `Bearer ${mockToken}` },
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await GET(request, { params })
    const json = await response.json()

    expect(json.pagination.limit).toBe(100)
    expect(queries.getSubmissionsByAppId).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 })
    )
  })

  it('should return 400 for invalid page parameter', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })

    const request = new NextRequest('http://localhost/api/apps/123/submissions?page=invalid', {
      method: 'GET',
      headers: { authorization: `Bearer ${mockToken}` },
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await GET(request, { params })
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.message).toContain('Page must be a positive integer')
  })

  it('should return 400 for invalid limit parameter', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })

    const request = new NextRequest('http://localhost/api/apps/123/submissions?limit=-5', {
      method: 'GET',
      headers: { authorization: `Bearer ${mockToken}` },
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await GET(request, { params })
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.message).toContain('Limit must be a positive integer')
  })

  it('should return 401 when authorization header is missing', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(null)

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'GET',
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await GET(request, { params })
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Authentication required')
  })

  it('should return 404 when app does not exist', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(undefined)

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'GET',
      headers: { authorization: `Bearer ${mockToken}` },
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await GET(request, { params })
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.success).toBe(false)
    expect(json.error).toBe('App not found')
  })

  it('should return 500 when database query fails', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
    vi.mocked(queries.getSubmissionsByAppId).mockRejectedValue(new Error('Database error'))

    const request = new NextRequest('http://localhost/api/apps/123/submissions', {
      method: 'GET',
      headers: { authorization: `Bearer ${mockToken}` },
    })

    const params = Promise.resolve({ appId: mockAppId })
    const response = await GET(request, { params })
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Internal server error')
  })

  it('should combine status filter with pagination', async () => {
    vi.mocked(jwt.extractTokenFromHeader).mockReturnValue(mockToken)
    vi.mocked(queries.getAppById).mockResolvedValue(mockApp)
    vi.mocked(jwt.verifyAppJWT).mockResolvedValue({ appId: mockAppId })
    vi.mocked(queries.getSubmissionsByAppId).mockResolvedValue({
      submissions: [],
      total: 30,
    })

    const request = new NextRequest(
      'http://localhost/api/apps/123/submissions?status=APPROVED&page=2&limit=10',
      {
        method: 'GET',
        headers: { authorization: `Bearer ${mockToken}` },
      }
    )

    const params = Promise.resolve({ appId: mockAppId })
    const response = await GET(request, { params })

    expect(response.status).toBe(200)
    expect(queries.getSubmissionsByAppId).toHaveBeenCalledWith({
      appId: mockAppId,
      status: 'APPROVED',
      page: 2,
      limit: 10,
    })
  })
})
