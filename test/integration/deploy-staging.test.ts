/**
 * Integration Tests: Staging Deployment Flow
 *
 * Tests the complete staging deployment pipeline including:
 * - AppSpec fetching and compilation
 * - v0 code generation
 * - Post-processing with invariants
 * - GitHub repository creation and commits
 * - Vercel deployment polling
 *
 * @module test/integration/deploy-staging
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { FastformAppSpec } from '@/lib/types/appspec'
import type { ChatDetail } from 'v0-sdk'

// Mock Octokit - use class pattern for proper constructor mocking
const mockOctokitReposGet = vi.fn()
const mockOctokitReposCreate = vi.fn()
const mockOctokitReposGetBranch = vi.fn()
const mockOctokitGitCreateTree = vi.fn()
const mockOctokitGitCreateCommit = vi.fn()
const mockOctokitGitUpdateRef = vi.fn()
const mockOctokitGitCreateBlob = vi.fn()
const mockOctokitGitGetRef = vi.fn()
const mockOctokitGitGetCommit = vi.fn()

vi.mock('@octokit/rest', () => {
  return {
    Octokit: class MockOctokit {
      repos = {
        get: mockOctokitReposGet,
        createForOrg: mockOctokitReposCreate,
        getBranch: mockOctokitReposGetBranch,
      }
      git = {
        createTree: mockOctokitGitCreateTree,
        createCommit: mockOctokitGitCreateCommit,
        updateRef: mockOctokitGitUpdateRef,
        createBlob: mockOctokitGitCreateBlob,
        getRef: mockOctokitGitGetRef,
        getCommit: mockOctokitGitGetCommit,
      }
    },
  }
})

// Mock v0-sdk
const mockV0ChatsCreate = vi.fn()
vi.mock('v0-sdk', () => ({
  createClient: vi.fn(() => ({
    chats: {
      create: mockV0ChatsCreate,
    },
  })),
}))

// Mock database queries
vi.mock('@/lib/db/queries', () => ({
  getAppById: vi.fn(),
}))

// Mock post-processor
vi.mock('@/lib/deploy/post-processor', () => ({
  injectInvariants: vi.fn(),
  extractFiles: vi.fn(),
}))

// Mock github-repo
vi.mock('@/lib/deploy/github-repo', () => ({
  createAppRepo: vi.fn(),
}))

// Mock fetch for Vercel API
const originalFetch = global.fetch
const mockFetch = vi.fn()

// Mock 'server-only' import
vi.mock('server-only', () => ({}))

// Import after mocks
import { getAppById } from '@/lib/db/queries'
import { injectInvariants, extractFiles } from '@/lib/deploy/post-processor'
import { createAppRepo } from '@/lib/deploy/github-repo'
import {
	  triggerStagingDeploy,
	  DeploymentError,
	  CodeGenerationError,
	  type StagingDeploymentResult,
	} from '@/lib/deploy/vercel-deploy'

/**
 * Creates a valid mock AppSpec for testing
 */
const createMockAppSpec = (overrides?: Partial<FastformAppSpec>): FastformAppSpec => ({
  id: 'app-123',
  version: '0.3',
  meta: {
    name: 'Patient Intake Form',
    slug: 'patient-intake-form',
    description: 'A patient intake form',
    orgId: 'org-12345678-abcd',
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
      title: 'Welcome',
    },
    {
      id: 'intake',
      route: '/intake',
      role: 'PATIENT',
      type: 'form',
      title: 'Patient Intake',
      fields: [
        { id: 'name', type: 'text', label: 'Name', required: true },
        { id: 'email', type: 'email', label: 'Email', required: true },
      ],
    },
  ],
  workflow: {
    states: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'],
    initialState: 'DRAFT',
    transitions: [
      { from: 'DRAFT', to: 'SUBMITTED', allowedRoles: ['PATIENT'] },
      { from: 'SUBMITTED', to: 'APPROVED', allowedRoles: ['STAFF'] },
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
    events: [{ name: 'page_view', trigger: 'pageview', page: '/' }],
  },
  environments: {
    staging: {
      domain: 'patient-intake-form-staging.getfastform.com',
      apiUrl: 'https://api-staging.getfastform.com',
    },
    production: {
      domain: 'patient-intake-form.getfastform.com',
      apiUrl: 'https://api.getfastform.com',
    },
  },
  ...overrides,
})

/**
 * Creates a mock v0 ChatDetail response
 */
const createMockChatDetail = (): ChatDetail => ({
  id: 'chat-123',
  title: 'Patient Intake Form',
  latestVersion: {
    id: 'version-1',
    status: 'ready',
    files: [
      { name: 'app/page.tsx', content: 'export default function Home() { return <div>Hello</div> }' },
      { name: 'app/layout.tsx', content: 'export default function Layout({ children }) { return <html>{children}</html> }' },
      { name: 'components/intake-form.tsx', content: 'export function IntakeForm() { return <form></form> }' },
    ],
  },
  versions: [],
})

/**
 * Creates a mock injection result
 */
const createMockInjectionResult = () => ({
  code: 'processed code',
  injectedFiles: [
    'lib/auth/middleware.ts',
    'lib/api/submissions.ts',
  ],
  originalFiles: [
    'app/page.tsx',
    'app/layout.tsx',
  ],
})

describe('Staging Deployment Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    global.fetch = mockFetch

    // Setup environment variables
    vi.stubEnv('GITHUB_TOKEN', 'ghp_test_token')
    vi.stubEnv('V0_API_KEY', 'v0_test_key')
    vi.stubEnv('VERCEL_TOKEN', 'vercel_test_token')
    vi.stubEnv('GITHUB_ORG', 'getfastform')
  })

  afterEach(() => {
    vi.resetAllMocks()
    vi.useRealTimers()
    vi.unstubAllEnvs()
    global.fetch = originalFetch
  })

  describe('Successful Deployment Flow', () => {
    it('should complete full staging deployment pipeline', async () => {
      // Arrange
      const mockAppSpec = createMockAppSpec()
      const mockChatDetail = createMockChatDetail()
      const mockInjectionResult = createMockInjectionResult()

      // Mock database query
      vi.mocked(getAppById).mockResolvedValue({
        id: 'app-123',
        userId: 'user-123',
        name: 'Patient Intake',
        spec: mockAppSpec,
        jwtSecret: null,
        createdAt: new Date(),
      })

      // Mock v0 code generation
      mockV0ChatsCreate.mockResolvedValue(mockChatDetail)

      // Mock post-processor
      vi.mocked(injectInvariants).mockResolvedValue(mockInjectionResult)
      vi.mocked(extractFiles).mockReturnValue({
        'lib/auth/middleware.ts': 'export function authMiddleware() {}',
        'lib/api/submissions.ts': 'export function submitForm() {}',
      })

      // Mock GitHub - repo exists
      mockOctokitReposGet.mockResolvedValue({
        data: { name: 'org-1234-patient-intake-form' },
      })

      // Mock GitHub - get ref for staging branch
      mockOctokitGitGetRef.mockResolvedValue({
        data: {
          ref: 'refs/heads/staging',
          object: { sha: 'parent-sha-123' },
        },
      })

      // Mock GitHub - get commit for parent
      mockOctokitGitGetCommit.mockResolvedValue({
        data: {
          sha: 'parent-sha-123',
          tree: { sha: 'parent-tree-sha' },
        },
      })

      // Mock GitHub - create blobs for files
      mockOctokitGitCreateBlob.mockResolvedValue({
        data: { sha: 'blob-sha-123' },
      })

      // Mock GitHub - create tree
      mockOctokitGitCreateTree.mockResolvedValue({
        data: { sha: 'tree-sha-123' },
      })

      // Mock GitHub - create commit
      mockOctokitGitCreateCommit.mockResolvedValue({
        data: { sha: 'commit-sha-123' },
      })

      // Mock GitHub - update ref
      mockOctokitGitUpdateRef.mockResolvedValue({
        data: { ref: 'refs/heads/staging' },
      })

      // Mock Vercel API - deployment status
      // Repo name is ${userId.slice(0,8)}-${meta.slug} = 'org-1234-patient-intake-form'
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          deployments: [
            {
              uid: 'deploy-123',
              name: 'org-1234-patient-intake-form',
              url: 'org-1234-patient-intake-form-staging.vercel.app',
              state: 'READY',
              meta: {
                githubCommitSha: 'commit-sha-123',
                githubCommitRef: 'staging',
              },
            },
          ],
        }),
      })

      // Act - Start deployment and advance timers concurrently
      const deployPromise = triggerStagingDeploy('app-123')
      await vi.runAllTimersAsync()
      const result = await deployPromise

      // Assert
      expect(result).toBeDefined()
      expect(result.status).toBe('ready')
      expect(result.stagingUrl).toContain('vercel.app')
      expect(result.deploymentId).toBe('deploy-123')
      expect(result.githubCommitSha).toBe('commit-sha-123')
      expect(result.repoUrl).toContain('github.com')

      // Verify pipeline steps were called
      expect(getAppById).toHaveBeenCalledWith({ appId: 'app-123' })
      expect(mockV0ChatsCreate).toHaveBeenCalled()
      expect(injectInvariants).toHaveBeenCalled()
      expect(mockOctokitGitCreateCommit).toHaveBeenCalled()
    })

    it('should create new repository if it does not exist', async () => {
      // Arrange
      const mockAppSpec = createMockAppSpec()
      const mockChatDetail = createMockChatDetail()
      const mockInjectionResult = createMockInjectionResult()

      vi.mocked(getAppById).mockResolvedValue({
        id: 'app-123',
        userId: 'user-123',
        name: 'Patient Intake',
        spec: mockAppSpec,
        jwtSecret: null,
        createdAt: new Date(),
      })

      mockV0ChatsCreate.mockResolvedValue(mockChatDetail)
      vi.mocked(injectInvariants).mockResolvedValue(mockInjectionResult)
      vi.mocked(extractFiles).mockReturnValue({})

      // Mock GitHub - repo NOT found (404)
      mockOctokitReposGet.mockRejectedValue({ status: 404 })

      // Mock createAppRepo
      vi.mocked(createAppRepo).mockResolvedValue({
        repoUrl: 'https://github.com/getfastform/org-12345-patient-intake-form',
        repoName: 'org-12345-patient-intake-form',
      })

      // Mock remaining GitHub operations
      mockOctokitGitGetRef.mockResolvedValue({
        data: { ref: 'refs/heads/staging', object: { sha: 'parent-sha' } },
      })
      mockOctokitGitGetCommit.mockResolvedValue({
        data: { sha: 'parent-sha', tree: { sha: 'tree-sha' } },
      })
      mockOctokitGitCreateBlob.mockResolvedValue({ data: { sha: 'blob-sha' } })
      mockOctokitGitCreateTree.mockResolvedValue({ data: { sha: 'tree-sha' } })
      mockOctokitGitCreateCommit.mockResolvedValue({ data: { sha: 'commit-sha' } })
      mockOctokitGitUpdateRef.mockResolvedValue({ data: { ref: 'refs/heads/staging' } })

      // Mock Vercel - repo name is org-1234-patient-intake-form
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          deployments: [{
            uid: 'deploy-123',
            name: 'org-1234-patient-intake-form',
            url: 'org-1234-patient-intake-form-staging.vercel.app',
            state: 'READY',
            meta: { githubCommitSha: 'commit-sha', githubCommitRef: 'staging' },
          }],
        }),
      })

      // Act - Start deployment and advance timers concurrently
      const deployPromise = triggerStagingDeploy('app-123')
      await vi.runAllTimersAsync()
      await deployPromise

      // Assert - createAppRepo should be called with orgId and slug
      expect(createAppRepo).toHaveBeenCalledWith(
        'org-12345678-abcd',
        'patient-intake-form'
      )
    })
  })

  describe('Phase 1: Fetch AppSpec', () => {
    it('should throw error when app is not found', async () => {
      // Arrange
      vi.mocked(getAppById).mockResolvedValue(null)

      // Act & Assert
      await expect(triggerStagingDeploy('non-existent-app')).rejects.toThrow(
        DeploymentError
      )
      await expect(triggerStagingDeploy('non-existent-app')).rejects.toThrow(
        'App not found'
      )
    })

    it('should throw error when AppSpec is invalid', async () => {
      // Arrange
      vi.mocked(getAppById).mockResolvedValue({
        id: 'app-123',
        userId: 'user-123',
        name: 'Test',
        spec: null, // Invalid spec
        jwtSecret: null,
        createdAt: new Date(),
      })

      // Act & Assert
      await expect(triggerStagingDeploy('app-123')).rejects.toThrow(
        DeploymentError
      )
    })

    it('should throw error when AppSpec is missing required fields', async () => {
      // Arrange
      vi.mocked(getAppById).mockResolvedValue({
        id: 'app-123',
        userId: 'user-123',
        name: 'Test',
        spec: { version: '0.3' }, // Missing id, meta, pages
        jwtSecret: null,
        createdAt: new Date(),
      })

      // Act & Assert
      await expect(triggerStagingDeploy('app-123')).rejects.toThrow(
        'AppSpec missing required fields'
      )
    })
  })

  describe('Phase 3: Code Generation', () => {
    it('should throw CodeGenerationError when v0 fails', async () => {
      // Arrange
      const mockAppSpec = createMockAppSpec()
      vi.mocked(getAppById).mockResolvedValue({
        id: 'app-123',
        userId: 'user-123',
        name: 'Test',
        spec: mockAppSpec,
        jwtSecret: null,
        createdAt: new Date(),
      })

      mockV0ChatsCreate.mockRejectedValue(new Error('v0 API unavailable'))

      // Act & Assert
      await expect(triggerStagingDeploy('app-123')).rejects.toThrow(
        CodeGenerationError
      )
    })

    it('should throw error when v0 returns no files', async () => {
      // Arrange
      const mockAppSpec = createMockAppSpec()
      vi.mocked(getAppById).mockResolvedValue({
        id: 'app-123',
        userId: 'user-123',
        name: 'Test',
        spec: mockAppSpec,
        jwtSecret: null,
        createdAt: new Date(),
      })

      mockV0ChatsCreate.mockResolvedValue({
        id: 'chat-123',
        latestVersion: {
          id: 'v1',
          status: 'ready',
          files: [], // No files generated
        },
      })

      // Act & Assert
      await expect(triggerStagingDeploy('app-123')).rejects.toThrow(
        'no files were generated'
      )
    })

    it('should throw error when v0 generation fails', async () => {
      // Arrange
      const mockAppSpec = createMockAppSpec()
      vi.mocked(getAppById).mockResolvedValue({
        id: 'app-123',
        userId: 'user-123',
        name: 'Test',
        spec: mockAppSpec,
        jwtSecret: null,
        createdAt: new Date(),
      })

      mockV0ChatsCreate.mockResolvedValue({
        id: 'chat-123',
        latestVersion: {
          id: 'v1',
          status: 'failed', // Generation failed
          files: [],
        },
      })

      // Act & Assert
      await expect(triggerStagingDeploy('app-123')).rejects.toThrow(
        CodeGenerationError
      )
    })
  })

  describe('Phase 4: Post-Processing', () => {
    it('should inject invariant files into generated code', async () => {
      // Arrange
      const mockAppSpec = createMockAppSpec()
      const mockChatDetail = createMockChatDetail()
      const mockInjectionResult = createMockInjectionResult()

      vi.mocked(getAppById).mockResolvedValue({
        id: 'app-123',
        userId: 'user-123',
        name: 'Test',
        spec: mockAppSpec,
        jwtSecret: null,
        createdAt: new Date(),
      })

      mockV0ChatsCreate.mockResolvedValue(mockChatDetail)
      vi.mocked(injectInvariants).mockResolvedValue(mockInjectionResult)
      vi.mocked(extractFiles).mockReturnValue({
        'lib/auth/middleware.ts': 'auth code',
        'lib/api/submissions.ts': 'submissions code',
      })

      // Setup remaining mocks for completion
      mockOctokitReposGet.mockResolvedValue({ data: { name: 'repo' } })
      mockOctokitGitGetRef.mockResolvedValue({
        data: { ref: 'refs/heads/staging', object: { sha: 'sha' } },
      })
      mockOctokitGitGetCommit.mockResolvedValue({
        data: { sha: 'sha', tree: { sha: 'tree' } },
      })
      mockOctokitGitCreateBlob.mockResolvedValue({ data: { sha: 'blob' } })
      mockOctokitGitCreateTree.mockResolvedValue({ data: { sha: 'tree' } })
      mockOctokitGitCreateCommit.mockResolvedValue({ data: { sha: 'commit' } })
      mockOctokitGitUpdateRef.mockResolvedValue({ data: {} })
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          deployments: [{
            uid: 'deploy',
            name: 'org-1234-patient-intake-form',
            url: 'org-1234-patient-intake-form-staging.vercel.app',
            state: 'READY',
            meta: { githubCommitSha: 'commit', githubCommitRef: 'staging' },
          }],
        }),
      })

      // Act - Start deployment and advance timers concurrently
      const deployPromise = triggerStagingDeploy('app-123')
      await vi.runAllTimersAsync()
      await deployPromise

      // Assert - verify injectInvariants was called with AppSpec
      expect(injectInvariants).toHaveBeenCalled()
      const [, appSpecArg] = (vi.mocked(injectInvariants).mock.calls[0] ?? [])
      expect(appSpecArg).toEqual(mockAppSpec)
    })

    it('should throw error when post-processing fails', async () => {
      // Arrange
      const mockAppSpec = createMockAppSpec()
      const mockChatDetail = createMockChatDetail()

      vi.mocked(getAppById).mockResolvedValue({
        id: 'app-123',
        userId: 'user-123',
        name: 'Test',
        spec: mockAppSpec,
        jwtSecret: null,
        createdAt: new Date(),
      })

      mockV0ChatsCreate.mockResolvedValue(mockChatDetail)
      vi.mocked(injectInvariants).mockRejectedValue(
        new Error('Post-processing failed')
      )

      // Act & Assert
      await expect(triggerStagingDeploy('app-123')).rejects.toThrow(
        'Post-processing failed'
      )
    })
  })

  describe('Phase 6: GitHub Commit', () => {
    it('should commit files to staging branch', async () => {
      // Arrange - full setup
      const mockAppSpec = createMockAppSpec()
      const mockChatDetail = createMockChatDetail()
      const mockInjectionResult = createMockInjectionResult()

      vi.mocked(getAppById).mockResolvedValue({
        id: 'app-123',
        userId: 'user-123',
        name: 'Test',
        spec: mockAppSpec,
        jwtSecret: null,
        createdAt: new Date(),
      })

      mockV0ChatsCreate.mockResolvedValue(mockChatDetail)
      vi.mocked(injectInvariants).mockResolvedValue(mockInjectionResult)
      vi.mocked(extractFiles).mockReturnValue({})

      mockOctokitReposGet.mockResolvedValue({ data: { name: 'repo' } })
      mockOctokitGitGetRef.mockResolvedValue({
        data: { ref: 'refs/heads/staging', object: { sha: 'parent-sha' } },
      })
      mockOctokitGitGetCommit.mockResolvedValue({
        data: { sha: 'parent-sha', tree: { sha: 'parent-tree' } },
      })
      mockOctokitGitCreateBlob.mockResolvedValue({ data: { sha: 'blob-sha' } })
      mockOctokitGitCreateTree.mockResolvedValue({ data: { sha: 'new-tree-sha' } })
      mockOctokitGitCreateCommit.mockResolvedValue({ data: { sha: 'new-commit-sha' } })
      mockOctokitGitUpdateRef.mockResolvedValue({ data: {} })

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          deployments: [{
            uid: 'deploy',
            name: 'org-1234-patient-intake-form',
            url: 'org-1234-patient-intake-form-staging.vercel.app',
            state: 'READY',
            meta: { githubCommitSha: 'new-commit-sha', githubCommitRef: 'staging' },
          }],
        }),
      })

      // Act - Start deployment and advance timers concurrently
      const deployPromise = triggerStagingDeploy('app-123')
      await vi.runAllTimersAsync()
      const result = await deployPromise

      // Assert
      expect(mockOctokitGitCreateCommit).toHaveBeenCalled()
      expect(mockOctokitGitUpdateRef).toHaveBeenCalled()
      expect(result.githubCommitSha).toBe('new-commit-sha')
    })
  })

  describe('Phase 7: Vercel Deployment Polling', () => {
    it('should poll Vercel until deployment is ready', async () => {
      // Arrange
      const mockAppSpec = createMockAppSpec()
      const mockChatDetail = createMockChatDetail()

      vi.mocked(getAppById).mockResolvedValue({
        id: 'app-123',
        userId: 'user-123',
        name: 'Test',
        spec: mockAppSpec,
        jwtSecret: null,
        createdAt: new Date(),
      })

      mockV0ChatsCreate.mockResolvedValue(mockChatDetail)
      vi.mocked(injectInvariants).mockResolvedValue(createMockInjectionResult())
      vi.mocked(extractFiles).mockReturnValue({})

      mockOctokitReposGet.mockResolvedValue({ data: { name: 'repo' } })
      mockOctokitGitGetRef.mockResolvedValue({
        data: { ref: 'refs/heads/staging', object: { sha: 'sha' } },
      })
      mockOctokitGitGetCommit.mockResolvedValue({
        data: { sha: 'sha', tree: { sha: 'tree' } },
      })
      mockOctokitGitCreateBlob.mockResolvedValue({ data: { sha: 'blob' } })
      mockOctokitGitCreateTree.mockResolvedValue({ data: { sha: 'tree' } })
      mockOctokitGitCreateCommit.mockResolvedValue({ data: { sha: 'commit' } })
      mockOctokitGitUpdateRef.mockResolvedValue({ data: {} })

      // Mock Vercel polling - first BUILDING, then READY
      let callCount = 0
      mockFetch.mockImplementation(() => {
        callCount++
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            deployments: [{
              uid: 'deploy-123',
              name: 'org-1234-patient-intake-form',
              url: 'org-1234-patient-intake-form-staging.vercel.app',
              state: callCount === 1 ? 'BUILDING' : 'READY',
              meta: { githubCommitSha: 'commit', githubCommitRef: 'staging' },
            }],
          }),
        })
      })

      // Act - Start deployment and advance timers concurrently
      const deployPromise = triggerStagingDeploy('app-123')
      await vi.runAllTimersAsync()
      const result = await deployPromise

      // Assert
      expect(result.status).toBe('ready')
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should throw error when deployment fails', async () => {
      // Arrange
      const mockAppSpec = createMockAppSpec()
      const mockChatDetail = createMockChatDetail()

      vi.mocked(getAppById).mockResolvedValue({
        id: 'app-123',
        userId: 'user-123',
        name: 'Test',
        spec: mockAppSpec,
        jwtSecret: null,
        createdAt: new Date(),
      })

      mockV0ChatsCreate.mockResolvedValue(mockChatDetail)
      vi.mocked(injectInvariants).mockResolvedValue(createMockInjectionResult())
      vi.mocked(extractFiles).mockReturnValue({})

      mockOctokitReposGet.mockResolvedValue({ data: { name: 'repo' } })
      mockOctokitGitGetRef.mockResolvedValue({
        data: { ref: 'refs/heads/staging', object: { sha: 'sha' } },
      })
      mockOctokitGitGetCommit.mockResolvedValue({
        data: { sha: 'sha', tree: { sha: 'tree' } },
      })
      mockOctokitGitCreateBlob.mockResolvedValue({ data: { sha: 'blob' } })
      mockOctokitGitCreateTree.mockResolvedValue({ data: { sha: 'tree' } })
      mockOctokitGitCreateCommit.mockResolvedValue({ data: { sha: 'commit' } })
      mockOctokitGitUpdateRef.mockResolvedValue({ data: {} })

      // Mock Vercel - deployment ERROR
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          deployments: [{
            uid: 'deploy-123',
            name: 'org-1234-patient-intake-form',
            url: 'org-1234-patient-intake-form-staging.vercel.app',
            state: 'ERROR',
            meta: { githubCommitSha: 'commit', githubCommitRef: 'staging' },
          }],
        }),
      })

	      // Act & Assert - Start deployment, flush timers, and verify rejection
	      // Don't await runAllTimersAsync separately - let the rejection assertion handle it
	      const deployPromise = triggerStagingDeploy('app-123')
	      void vi.runAllTimersAsync() // Trigger timer flush without awaiting
	      await expect(deployPromise).rejects.toThrow(DeploymentError)
	    })
	  })

  describe('Environment Variable Validation', () => {
    it('should throw error when GITHUB_TOKEN is missing', async () => {
      // Arrange
      vi.stubEnv('GITHUB_TOKEN', '')
      const mockAppSpec = createMockAppSpec()

      vi.mocked(getAppById).mockResolvedValue({
        id: 'app-123',
        userId: 'user-123',
        name: 'Test',
        spec: mockAppSpec,
        jwtSecret: null,
        createdAt: new Date(),
      })

      mockV0ChatsCreate.mockResolvedValue(createMockChatDetail())
      vi.mocked(injectInvariants).mockResolvedValue(createMockInjectionResult())
      vi.mocked(extractFiles).mockReturnValue({})

      // Act & Assert
      await expect(triggerStagingDeploy('app-123')).rejects.toThrow(
        'GITHUB_TOKEN'
      )
    })

    it('should throw error when V0_API_KEY is missing', async () => {
      // Arrange
      vi.stubEnv('V0_API_KEY', '')
      const mockAppSpec = createMockAppSpec()

      vi.mocked(getAppById).mockResolvedValue({
        id: 'app-123',
        userId: 'user-123',
        name: 'Test',
        spec: mockAppSpec,
        jwtSecret: null,
        createdAt: new Date(),
      })

      // Act & Assert
      await expect(triggerStagingDeploy('app-123')).rejects.toThrow(
        'V0_API_KEY'
      )
    })
  })

  describe('Result Structure', () => {
    it('should return complete StagingDeploymentResult', async () => {
      // Arrange - full setup
      const mockAppSpec = createMockAppSpec()
      const mockChatDetail = createMockChatDetail()

      vi.mocked(getAppById).mockResolvedValue({
        id: 'app-123',
        userId: 'user-123',
        name: 'Test',
        spec: mockAppSpec,
        jwtSecret: null,
        createdAt: new Date(),
      })

      mockV0ChatsCreate.mockResolvedValue(mockChatDetail)
      vi.mocked(injectInvariants).mockResolvedValue(createMockInjectionResult())
      vi.mocked(extractFiles).mockReturnValue({})

      mockOctokitReposGet.mockResolvedValue({ data: { name: 'repo' } })
      mockOctokitGitGetRef.mockResolvedValue({
        data: { ref: 'refs/heads/staging', object: { sha: 'sha' } },
      })
      mockOctokitGitGetCommit.mockResolvedValue({
        data: { sha: 'sha', tree: { sha: 'tree' } },
      })
      mockOctokitGitCreateBlob.mockResolvedValue({ data: { sha: 'blob' } })
      mockOctokitGitCreateTree.mockResolvedValue({ data: { sha: 'tree' } })
      mockOctokitGitCreateCommit.mockResolvedValue({ data: { sha: 'final-commit-sha' } })
      mockOctokitGitUpdateRef.mockResolvedValue({ data: {} })

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          deployments: [{
            uid: 'vercel-deploy-id',
            name: 'org-1234-patient-intake-form',
            url: 'org-1234-patient-intake-form-staging.vercel.app',
            state: 'READY',
            meta: { githubCommitSha: 'final-commit-sha', githubCommitRef: 'staging' },
          }],
        }),
      })

      // Act - Start deployment and advance timers concurrently
      const deployPromise = triggerStagingDeploy('app-123')
      await vi.runAllTimersAsync()
      const result: StagingDeploymentResult = await deployPromise

      // Assert - verify all fields are present and typed correctly
      expect(result.stagingUrl).toBeDefined()
      expect(typeof result.stagingUrl).toBe('string')

      expect(result.deploymentId).toBeDefined()
      expect(typeof result.deploymentId).toBe('string')

      expect(result.githubCommitSha).toBeDefined()
      expect(typeof result.githubCommitSha).toBe('string')

      expect(result.repoUrl).toBeDefined()
      expect(result.repoUrl).toContain('github.com')

      expect(result.status).toBe('ready')
    })
  })
})
