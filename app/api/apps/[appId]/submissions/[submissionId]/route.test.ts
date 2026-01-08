/**
 * Submission Detail and Actions API Tests
 *
 * Comprehensive test suite for submission management endpoints.
 * Tests authentication, authorization, workflow transitions, and error handling.
 *
 * @module api/apps/[appId]/submissions/[submissionId]/route.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, PATCH, DELETE } from './route'
import type { FastformAppSpec } from '@/lib/types/appspec'

// Mock authentication
vi.mock('@/app/(auth)/auth', () => ({
  auth: vi.fn(),
}))

// Mock database queries
vi.mock('@/lib/db/queries', () => ({
  getAppById: vi.fn(),
  getSubmissionById: vi.fn(),
  updateSubmission: vi.fn(),
  softDeleteSubmission: vi.fn(),
  getSubmissionHistory: vi.fn(),
  createSubmissionHistory: vi.fn(),
}))

// Mock validation
vi.mock('@/lib/submissions/validation', () => ({
  validateTransition: vi.fn(),
}))

// Import mocked modules
import { auth } from '@/app/(auth)/auth'
import {
  getAppById,
  getSubmissionById,
  updateSubmission,
  softDeleteSubmission,
  getSubmissionHistory,
  createSubmissionHistory,
} from '@/lib/db/queries'
import { validateTransition } from '@/lib/submissions/validation'

// Test fixtures
const mockSession = {
  user: {
    id: 'user-123',
    email: 'staff@example.com',
  },
}

const mockAdminSession = {
  user: {
    id: 'admin-123',
    email: 'admin@example.com',
  },
}

const mockDifferentUserSession = {
  user: {
    id: 'user-456',
    email: 'other@example.com',
  },
}

const mockApp = {
  id: 'app-123',
  userId: 'user-123',
  name: 'Test App',
  spec: {
    id: 'app-123',
    version: '0.3',
    meta: {
      name: 'Test App',
      slug: 'test-app',
      description: 'Test',
      orgId: 'org-1',
      orgSlug: 'org-1',
    },
    workflow: {
      states: ['DRAFT', 'SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'REJECTED'],
      initialState: 'DRAFT' as const,
      transitions: [
        {
          from: 'SUBMITTED',
          to: 'UNDER_REVIEW' as any,
          allowedRoles: ['STAFF' as const],
        },
        {
          from: 'UNDER_REVIEW' as any,
          to: 'APPROVED',
          allowedRoles: ['STAFF' as const],
        },
      ],
    },
  } as FastformAppSpec,
  createdAt: new Date(),
}

const mockSubmission = {
  id: 'submission-123',
  appId: 'app-123',
  data: { name: 'John Doe', email: 'john@example.com' },
  status: 'SUBMITTED',
  submittedBy: 'patient@example.com',
  assignedTo: null,
  deleted: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

const mockHistory = [
  {
    id: 'history-1',
    submissionId: 'submission-123',
    status: 'SUBMITTED',
    updatedBy: 'patient@example.com',
    notes: 'Initial submission',
    createdAt: new Date('2024-01-01'),
  },
]

// Helper to create NextRequest
function createRequest(
  method: string,
  url: string,
  body?: unknown
): NextRequest {
  const requestInit: RequestInit = {
    method,
  }

  if (body) {
    requestInit.body = JSON.stringify(body)
    requestInit.headers = {
      'Content-Type': 'application/json',
    }
  }

  return new NextRequest(url, requestInit)
}

// Helper to create params
async function createParams(appId: string, submissionId: string) {
  return Promise.resolve({ appId, submissionId })
}

describe('GET /api/apps/[appId]/submissions/[submissionId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return submission details with history for authenticated staff user', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(getAppById).mockResolvedValue(mockApp as any)
    vi.mocked(getSubmissionById).mockResolvedValue(mockSubmission as any)
    vi.mocked(getSubmissionHistory).mockResolvedValue(mockHistory as any)

    const request = createRequest(
      'GET',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123'
    )
    const params = createParams('app-123', 'submission-123')

    const response = await GET(request, { params })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.submission.id).toBe('submission-123')
    expect(data.submission.data).toEqual({
      name: 'John Doe',
      email: 'john@example.com',
    })
    expect(data.submission.history).toHaveLength(1)
    expect(data.submission.history[0].status).toBe('SUBMITTED')
  })

  it('should return 401 when user is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const request = createRequest(
      'GET',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123'
    )
    const params = createParams('app-123', 'submission-123')

    const response = await GET(request, { params })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 403 when user does not own the app', async () => {
    vi.mocked(auth).mockResolvedValue(mockDifferentUserSession as any)
    vi.mocked(getAppById).mockResolvedValue(mockApp as any)

    const request = createRequest(
      'GET',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123'
    )
    const params = createParams('app-123', 'submission-123')

    const response = await GET(request, { params })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Forbidden')
  })

  it('should return 404 when app does not exist', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(getAppById).mockResolvedValue(undefined)

    const request = createRequest(
      'GET',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123'
    )
    const params = createParams('app-123', 'submission-123')

    const response = await GET(request, { params })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.success).toBe(false)
    expect(data.error).toBe('App not found')
  })

  it('should return 404 when submission does not exist', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(getAppById).mockResolvedValue(mockApp as any)
    vi.mocked(getSubmissionById).mockResolvedValue(undefined)

    const request = createRequest(
      'GET',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123'
    )
    const params = createParams('app-123', 'submission-123')

    const response = await GET(request, { params })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Submission not found')
  })

  it('should return 404 when submission belongs to different app', async () => {
    const wrongAppSubmission = { ...mockSubmission, appId: 'different-app' }
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(getAppById).mockResolvedValue(mockApp as any)
    vi.mocked(getSubmissionById).mockResolvedValue(wrongAppSubmission as any)

    const request = createRequest(
      'GET',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123'
    )
    const params = createParams('app-123', 'submission-123')

    const response = await GET(request, { params })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Submission does not belong to this app')
  })

  it('should return 404 when submission is soft deleted', async () => {
    const deletedSubmission = { ...mockSubmission, deleted: new Date() }
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(getAppById).mockResolvedValue(mockApp as any)
    vi.mocked(getSubmissionById).mockResolvedValue(deletedSubmission as any)

    const request = createRequest(
      'GET',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123'
    )
    const params = createParams('app-123', 'submission-123')

    const response = await GET(request, { params })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Submission has been deleted')
  })
})

describe('PATCH /api/apps/[appId]/submissions/[submissionId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should update submission status with valid transition', async () => {
    const updatedSubmission = { ...mockSubmission, status: 'UNDER_REVIEW' }
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(getAppById).mockResolvedValue(mockApp as any)
    vi.mocked(getSubmissionById).mockResolvedValue(mockSubmission as any)
    vi.mocked(validateTransition).mockReturnValue({
      valid: true,
      errors: [],
    })
    vi.mocked(updateSubmission).mockResolvedValue([updatedSubmission] as any)
    vi.mocked(createSubmissionHistory).mockResolvedValue([] as any)

    const request = createRequest(
      'PATCH',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123',
      {
        status: 'UNDER_REVIEW',
        notes: 'Starting review',
      }
    )
    const params = createParams('app-123', 'submission-123')

    const response = await PATCH(request, { params })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.submission.status).toBe('UNDER_REVIEW')
    expect(vi.mocked(updateSubmission)).toHaveBeenCalledWith({
      submissionId: 'submission-123',
      status: 'UNDER_REVIEW',
      assignedTo: undefined,
    })
    expect(vi.mocked(createSubmissionHistory)).toHaveBeenCalledWith({
      submissionId: 'submission-123',
      status: 'UNDER_REVIEW',
      updatedBy: 'staff@example.com',
      notes: 'Starting review',
    })
  })

  it('should update submission with assignment', async () => {
    const updatedSubmission = {
      ...mockSubmission,
      status: 'UNDER_REVIEW',
      assignedTo: 'admin@example.com',
    }
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(getAppById).mockResolvedValue(mockApp as any)
    vi.mocked(getSubmissionById).mockResolvedValue(mockSubmission as any)
    vi.mocked(validateTransition).mockReturnValue({
      valid: true,
      errors: [],
    })
    vi.mocked(updateSubmission).mockResolvedValue([updatedSubmission] as any)
    vi.mocked(createSubmissionHistory).mockResolvedValue([] as any)

    const request = createRequest(
      'PATCH',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123',
      {
        status: 'UNDER_REVIEW',
        assignedTo: 'admin@example.com',
      }
    )
    const params = createParams('app-123', 'submission-123')

    const response = await PATCH(request, { params })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(vi.mocked(updateSubmission)).toHaveBeenCalledWith({
      submissionId: 'submission-123',
      status: 'UNDER_REVIEW',
      assignedTo: 'admin@example.com',
    })
  })

  it('should return 400 when status is missing', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)

    const request = createRequest(
      'PATCH',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123',
      {
        notes: 'Some notes',
      }
    )
    const params = createParams('app-123', 'submission-123')

    const response = await PATCH(request, { params })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Status is required')
  })

  it('should return 400 when workflow transition is invalid', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(getAppById).mockResolvedValue(mockApp as any)
    vi.mocked(getSubmissionById).mockResolvedValue(mockSubmission as any)
    vi.mocked(validateTransition).mockReturnValue({
      valid: false,
      errors: [
        {
          field: 'status',
          message: 'Invalid transition from SUBMITTED to APPROVED',
          code: 'INVALID_TRANSITION',
        },
      ],
    })

    const request = createRequest(
      'PATCH',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123',
      {
        status: 'APPROVED',
      }
    )
    const params = createParams('app-123', 'submission-123')

    const response = await PATCH(request, { params })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Invalid workflow transition')
  })

  it('should return 403 when non-admin tries to approve', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(getAppById).mockResolvedValue(mockApp as any)
    vi.mocked(getSubmissionById).mockResolvedValue(mockSubmission as any)
    vi.mocked(validateTransition).mockReturnValue({
      valid: true,
      errors: [],
    })

    const request = createRequest(
      'PATCH',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123',
      {
        status: 'APPROVED',
      }
    )
    const params = createParams('app-123', 'submission-123')

    const response = await PATCH(request, { params })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Insufficient permissions')
  })

  it('should allow admin to approve', async () => {
    const updatedSubmission = { ...mockSubmission, status: 'APPROVED' }
    vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
    vi.mocked(getAppById).mockResolvedValue({
      ...mockApp,
      userId: 'admin-123',
    } as any)
    vi.mocked(getSubmissionById).mockResolvedValue(mockSubmission as any)
    vi.mocked(validateTransition).mockReturnValue({
      valid: true,
      errors: [],
    })
    vi.mocked(updateSubmission).mockResolvedValue([updatedSubmission] as any)
    vi.mocked(createSubmissionHistory).mockResolvedValue([] as any)

    const request = createRequest(
      'PATCH',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123',
      {
        status: 'APPROVED',
      }
    )
    const params = createParams('app-123', 'submission-123')

    const response = await PATCH(request, { params })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.submission.status).toBe('APPROVED')
  })

  it('should return 403 when non-admin tries to reject', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(getAppById).mockResolvedValue(mockApp as any)
    vi.mocked(getSubmissionById).mockResolvedValue(mockSubmission as any)
    vi.mocked(validateTransition).mockReturnValue({
      valid: true,
      errors: [],
    })

    const request = createRequest(
      'PATCH',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123',
      {
        status: 'REJECTED',
      }
    )
    const params = createParams('app-123', 'submission-123')

    const response = await PATCH(request, { params })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Insufficient permissions')
  })

  it('should return 400 when trying to update deleted submission', async () => {
    const deletedSubmission = { ...mockSubmission, deleted: new Date() }
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(getAppById).mockResolvedValue(mockApp as any)
    vi.mocked(getSubmissionById).mockResolvedValue(deletedSubmission as any)

    const request = createRequest(
      'PATCH',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123',
      {
        status: 'UNDER_REVIEW',
      }
    )
    const params = createParams('app-123', 'submission-123')

    const response = await PATCH(request, { params })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Cannot update deleted submission')
  })
})

describe('DELETE /api/apps/[appId]/submissions/[submissionId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should soft delete submission with admin role', async () => {
    vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
    vi.mocked(getAppById).mockResolvedValue({
      ...mockApp,
      userId: 'admin-123',
    } as any)
    vi.mocked(getSubmissionById).mockResolvedValue(mockSubmission as any)
    vi.mocked(softDeleteSubmission).mockResolvedValue([] as any)
    vi.mocked(createSubmissionHistory).mockResolvedValue([] as any)

    const request = createRequest(
      'DELETE',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123'
    )
    const params = createParams('app-123', 'submission-123')

    const response = await DELETE(request, { params })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.message).toBe('Submission deleted successfully')
    expect(vi.mocked(softDeleteSubmission)).toHaveBeenCalledWith({
      submissionId: 'submission-123',
    })
    expect(vi.mocked(createSubmissionHistory)).toHaveBeenCalledWith({
      submissionId: 'submission-123',
      status: 'DELETED',
      updatedBy: 'admin@example.com',
      notes: 'Submission deleted by admin',
    })
  })

  it('should return 403 when non-admin tries to delete', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)

    const request = createRequest(
      'DELETE',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123'
    )
    const params = createParams('app-123', 'submission-123')

    const response = await DELETE(request, { params })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Forbidden - Admin role required')
  })

  it('should return 400 when submission is already deleted', async () => {
    const deletedSubmission = { ...mockSubmission, deleted: new Date() }
    vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
    vi.mocked(getAppById).mockResolvedValue({
      ...mockApp,
      userId: 'admin-123',
    } as any)
    vi.mocked(getSubmissionById).mockResolvedValue(deletedSubmission as any)

    const request = createRequest(
      'DELETE',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123'
    )
    const params = createParams('app-123', 'submission-123')

    const response = await DELETE(request, { params })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Submission already deleted')
  })

  it('should return 404 when submission does not exist', async () => {
    vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
    vi.mocked(getAppById).mockResolvedValue({
      ...mockApp,
      userId: 'admin-123',
    } as any)
    vi.mocked(getSubmissionById).mockResolvedValue(undefined)

    const request = createRequest(
      'DELETE',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123'
    )
    const params = createParams('app-123', 'submission-123')

    const response = await DELETE(request, { params })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Submission not found')
  })

  it('should return 401 when user is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const request = createRequest(
      'DELETE',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123'
    )
    const params = createParams('app-123', 'submission-123')

    const response = await DELETE(request, { params })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Unauthorized')
  })
})

describe('Error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle database errors in GET', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(getAppById).mockRejectedValue(new Error('Database error'))

    const request = createRequest(
      'GET',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123'
    )
    const params = createParams('app-123', 'submission-123')

    const response = await GET(request, { params })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Failed to fetch submission')
  })

  it('should handle database errors in PATCH', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(getAppById).mockRejectedValue(new Error('Database error'))

    const request = createRequest(
      'PATCH',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123',
      { status: 'UNDER_REVIEW' }
    )
    const params = createParams('app-123', 'submission-123')

    const response = await PATCH(request, { params })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Failed to update submission')
  })

  it('should handle database errors in DELETE', async () => {
    vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
    vi.mocked(getAppById).mockRejectedValue(new Error('Database error'))

    const request = createRequest(
      'DELETE',
      'http://localhost:3000/api/apps/app-123/submissions/submission-123'
    )
    const params = createParams('app-123', 'submission-123')

    const response = await DELETE(request, { params })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Failed to delete submission')
  })
})
