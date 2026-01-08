/**
 * Tests for staging deployment API endpoint
 *
 * These tests verify the complete deployment endpoint functionality including:
 * - Authentication and authorization
 * - Request validation
 * - Deployment orchestration
 * - Error handling for all deployment phases
 * - Response format validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock auth
const mockAuth = vi.fn()
vi.mock('@/app/(auth)/auth', () => ({
  auth: () => mockAuth(),
}))

// Mock database queries
const mockGetAppById = vi.fn()
vi.mock('@/lib/db/queries', () => ({
  getAppById: (args: { appId: string }) => mockGetAppById(args),
}))

// Mock deployment functions
const mockTriggerStagingDeploy = vi.fn()
const DeploymentError = class DeploymentError extends Error {
  phase: string
  constructor(message: string, phase: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'DeploymentError'
    this.phase = phase
  }
}
const CodeGenerationError = class CodeGenerationError extends Error {
  appId: string
  constructor(message: string, appId: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'CodeGenerationError'
    this.appId = appId
  }
}
const GitHubCommitError = class GitHubCommitError extends Error {
  repoName: string
  constructor(message: string, repoName: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'GitHubCommitError'
    this.repoName = repoName
  }
}

vi.mock('@/lib/deploy/vercel-deploy', () => ({
  triggerStagingDeploy: (appId: string) => mockTriggerStagingDeploy(appId),
  DeploymentError,
  CodeGenerationError,
  GitHubCommitError,
}))

// Import the route handlers after mocks are set up
const { POST, GET } = await import('./route')

describe('POST /api/apps/[appId]/deploy/staging', () => {
  const mockAppId = 'test-app-id'
  const mockUserId = 'test-user-id'
  const mockRequest = new NextRequest('http://localhost:3000/api/apps/test-app-id/deploy/staging', {
    method: 'POST',
  })
  const mockParams = Promise.resolve({ appId: mockAppId })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication & Authorization', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const response = await POST(mockRequest, { params: mockParams })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Authentication required' })
    })

    it('should return 401 when session has no user ID', async () => {
      mockAuth.mockResolvedValue({
        user: { id: undefined },
      } as any)

      const response = await POST(mockRequest, { params: mockParams })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Authentication required' })
    })

    it('should return 404 when app does not exist', async () => {
      mockAuth.mockResolvedValue({
        user: { id: mockUserId },
      } as any)
      mockGetAppById.mockResolvedValue(undefined)

      const response = await POST(mockRequest, { params: mockParams })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data).toEqual({ error: 'App not found' })
    })

    it('should return 403 when user does not own the app', async () => {
      mockAuth.mockResolvedValue({
        user: { id: mockUserId },
      } as any)
      mockGetAppById.mockResolvedValue({
        id: mockAppId,
        userId: 'different-user-id',
        name: 'Test App',
        spec: { id: 'app-1', meta: { name: 'Test' }, pages: [] },
      } as any)

      const response = await POST(mockRequest, { params: mockParams })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: 'Forbidden: You do not have permission to deploy this app',
      })
    })
  })

  describe('AppSpec Validation', () => {
    it('should return 400 when app has no AppSpec', async () => {
      mockAuth.mockResolvedValue({
        user: { id: mockUserId },
      } as any)
      mockGetAppById.mockResolvedValue({
        id: mockAppId,
        userId: mockUserId,
        name: 'Test App',
        spec: null,
      } as any)

      const response = await POST(mockRequest, { params: mockParams })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'App has no AppSpec',
        details: 'You must confirm an AppSpec before deploying',
      })
    })

    it('should return 400 when app has empty AppSpec object', async () => {
      mockAuth.mockResolvedValue({
        user: { id: mockUserId },
      } as any)
      mockGetAppById.mockResolvedValue({
        id: mockAppId,
        userId: mockUserId,
        name: 'Test App',
        spec: {},
      } as any)

      const response = await POST(mockRequest, { params: mockParams })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'App has no AppSpec',
        details: 'You must confirm an AppSpec before deploying',
      })
    })
  })

  describe('Successful Deployment', () => {
    it('should successfully trigger deployment and return result', async () => {
      const mockDeploymentResult = {
        stagingUrl: 'https://test-app.vercel.app',
        deploymentId: 'deployment-123',
        githubCommitSha: 'abc123',
        repoUrl: 'https://github.com/getfastform/test-app',
        status: 'ready' as const,
      }

      mockAuth.mockResolvedValue({
        user: { id: mockUserId },
      } as any)
      mockGetAppById.mockResolvedValue({
        id: mockAppId,
        userId: mockUserId,
        name: 'Test App',
        spec: {
          id: 'app-1',
          meta: { name: 'Test App', slug: 'test-app', orgId: mockUserId },
          pages: [],
        },
      } as any)
      mockTriggerStagingDeploy.mockResolvedValue(mockDeploymentResult)

      const response = await POST(mockRequest, { params: mockParams })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        deployment: {
          status: 'ready',
          stagingUrl: 'https://test-app.vercel.app',
          deploymentId: 'deployment-123',
          githubCommitSha: 'abc123',
          repoUrl: 'https://github.com/getfastform/test-app',
          message: 'Deployment completed successfully',
        },
      })
      expect(mockTriggerStagingDeploy).toHaveBeenCalledWith(mockAppId)
    })
  })

  describe('Deployment Error Handling', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: { id: mockUserId },
      } as any)
      mockGetAppById.mockResolvedValue({
        id: mockAppId,
        userId: mockUserId,
        name: 'Test App',
        spec: {
          id: 'app-1',
          meta: { name: 'Test App', slug: 'test-app', orgId: mockUserId },
          pages: [],
        },
      } as any)
    })

    it('should handle DeploymentError with phase information', async () => {
      const deploymentError = new DeploymentError(
        'Failed to compile AppSpec',
        'compile_prompt'
      )
      mockTriggerStagingDeploy.mockRejectedValue(deploymentError)

      const response = await POST(mockRequest, { params: mockParams })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Deployment failed',
        phase: 'compile_prompt',
        details: 'Failed to compile AppSpec',
      })
    })

    it('should handle CodeGenerationError with app ID', async () => {
      const codeGenError = new CodeGenerationError(
        'v0 generation failed',
        mockAppId
      )
      mockTriggerStagingDeploy.mockRejectedValue(codeGenError)

      const response = await POST(mockRequest, { params: mockParams })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Code generation failed',
        phase: 'generate_code',
        details: 'v0 generation failed',
        appId: mockAppId,
      })
    })

    it('should handle GitHubCommitError with repo name', async () => {
      const gitHubError = new GitHubCommitError(
        'Failed to push to staging branch',
        'test-app'
      )
      mockTriggerStagingDeploy.mockRejectedValue(gitHubError)

      const response = await POST(mockRequest, { params: mockParams })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'GitHub commit failed',
        phase: 'commit_code',
        details: 'Failed to push to staging branch',
        repoName: 'test-app',
      })
    })

    it('should handle generic errors', async () => {
      const genericError = new Error('Unexpected error')
      mockTriggerStagingDeploy.mockRejectedValue(genericError)

      const response = await POST(mockRequest, { params: mockParams })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Deployment failed',
        details: 'Unexpected error',
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockTriggerStagingDeploy.mockRejectedValue('String error')

      const response = await POST(mockRequest, { params: mockParams })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Deployment failed',
        details: 'Unknown error',
      })
    })
  })
})

describe('GET /api/apps/[appId]/deploy/staging', () => {
  const mockAppId = 'test-app-id'
  const mockUserId = 'test-user-id'
  const mockRequest = new NextRequest('http://localhost:3000/api/apps/test-app-id/deploy/staging', {
    method: 'GET',
  })
  const mockParams = Promise.resolve({ appId: mockAppId })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication & Authorization', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const response = await GET(mockRequest, { params: mockParams })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Authentication required' })
    })

    it('should return 404 when app does not exist', async () => {
      mockAuth.mockResolvedValue({
        user: { id: mockUserId },
      } as any)
      mockGetAppById.mockResolvedValue(undefined)

      const response = await GET(mockRequest, { params: mockParams })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data).toEqual({ error: 'App not found' })
    })

    it('should return 403 when user does not own the app', async () => {
      mockAuth.mockResolvedValue({
        user: { id: mockUserId },
      } as any)
      mockGetAppById.mockResolvedValue({
        id: mockAppId,
        userId: 'different-user-id',
        name: 'Test App',
      } as any)

      const response = await GET(mockRequest, { params: mockParams })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: 'Forbidden: You do not have permission to access this app',
      })
    })
  })

  describe('Deployment Status Retrieval', () => {
    it('should return no deployment status when no deployments exist', async () => {
      mockAuth.mockResolvedValue({
        user: { id: mockUserId },
      } as any)
      mockGetAppById.mockResolvedValue({
        id: mockAppId,
        userId: mockUserId,
        name: 'Test App',
      } as any)

      const response = await GET(mockRequest, { params: mockParams })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        deployment: {
          status: 'no_deployment',
          stagingUrl: null,
          deploymentId: null,
          message: 'No deployment found. Trigger a deployment to get started.',
        },
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockAuth.mockResolvedValue({
        user: { id: mockUserId },
      } as any)
      mockGetAppById.mockRejectedValue(new Error('Database connection failed'))

      const response = await GET(mockRequest, { params: mockParams })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Failed to retrieve deployment status',
        details: 'Database connection failed',
      })
    })
  })
})
