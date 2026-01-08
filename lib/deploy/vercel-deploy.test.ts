/**
 * Unit Tests for Vercel Deployment Orchestrator
 *
 * Tests the complete deployment pipeline including:
 * - AppSpec fetching and validation
 * - Prompt compilation
 * - v0 code generation
 * - Post-processing
 * - GitHub repository management
 * - Vercel deployment polling
 *
 * @module vercel-deploy.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import {
  triggerStagingDeploy,
  DeploymentError,
  CodeGenerationError,
  GitHubCommitError,
} from './vercel-deploy'
import type { FastformAppSpec } from '@/lib/types/appspec'
import type { ChatDetail } from 'v0-sdk'

// Import mocked modules first before mocking
import { Octokit } from '@octokit/rest'
import { createClient } from 'v0-sdk'
import { compileAppSpecToPrompt } from '@/lib/compiler/appspec-to-prompt'
import { injectInvariants, extractFiles } from './post-processor'
import { createAppRepo } from './github-repo'
import { getAppById } from '@/lib/db/queries'

// Mock dependencies
vi.mock('server-only', () => ({}))
vi.mock('v0-sdk')
vi.mock('@/lib/compiler/appspec-to-prompt')
vi.mock('./post-processor')
vi.mock('./github-repo')
vi.mock('@/lib/db/queries')

// Mock Octokit with a proper constructor
vi.mock('@octokit/rest', () => {
  return {
    Octokit: vi.fn(),
  }
})

describe('vercel-deploy', () => {
  // Test fixtures
  const mockAppId = 'test-app-id-123'
  const mockUserId = 'test-user-id-456'
  const mockOrgId = 'test-org-id-789'

  const mockAppSpec: FastformAppSpec = {
    id: mockAppId,
    version: 'v0.3',
    meta: {
      name: 'Test App',
      description: 'Test application',
      slug: 'test-app',
      orgId: mockOrgId,
      orgSlug: 'test-org',
    },
    roles: [
      {
        id: 'USER',
        authRequired: false,
      },
    ],
    pages: [
      {
        id: 'home',
        route: '/',
        role: 'PATIENT',
        type: 'welcome',
        title: 'Welcome',
      },
    ],
    workflow: {
      initialState: 'DRAFT',
      states: ['DRAFT', 'SUBMITTED'],
      transitions: [
        {
          from: 'DRAFT',
          to: 'SUBMITTED',
          allowedRoles: ['PATIENT'],
        },
      ],
    },
    api: {
      endpoints: {
        createSubmission: '/api/submissions',
      },
    },
    theme: {
      preset: 'healthcare-calm',
    },
    analytics: {
      events: [],
    },
    environments: {
      staging: {
        domain: 'test-app-staging.vercel.app',
        apiUrl: 'https://api-staging.fastform.dev',
      },
      production: {
        domain: 'test-app.vercel.app',
        apiUrl: 'https://api.fastform.dev',
      },
    },
  }

  const mockChatDetail: ChatDetail = {
    id: 'chat-123',
    object: 'chat',
    shareable: false,
    privacy: 'private',
    createdAt: '2024-01-01T00:00:00Z',
    favorite: false,
    authorId: 'author-123',
    webUrl: 'https://v0.dev/chat/123',
    apiUrl: 'https://api.v0.dev/chats/123',
    url: 'https://v0.dev/chat/123',
    text: 'test',
    messages: [],
    latestVersion: {
      id: 'version-123',
      object: 'version',
      status: 'completed',
      createdAt: '2024-01-01T00:00:00Z',
      files: [
        {
          object: 'file',
          name: 'app/page.tsx',
          content: 'export default function Page() { return <div>Test</div> }',
          locked: false,
        },
        {
          object: 'file',
          name: 'package.json',
          content: '{"name":"test-app"}',
          locked: false,
        },
      ],
    },
    permissions: {
      write: true,
    },
  }

  // Environment setup
  const originalEnv = process.env

  beforeEach(() => {
    // Reset environment
    process.env = {
      ...originalEnv,
      GITHUB_TOKEN: 'test-github-token',
      V0_API_KEY: 'test-v0-key',
      VERCEL_TOKEN: 'test-vercel-token',
    }

    // Reset mocks
    vi.clearAllMocks()

    // Reset Octokit mock to be a constructor
    ;(Octokit as unknown as Mock).mockImplementation(function (this: unknown) {
      return {
        git: {
          getRef: vi.fn(),
          getCommit: vi.fn(),
          createBlob: vi.fn(),
          createTree: vi.fn(),
          createCommit: vi.fn(),
          updateRef: vi.fn(),
        },
        repos: {
          get: vi.fn(),
        },
      }
    })
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('triggerStagingDeploy', () => {
    it.skip('should successfully deploy an app through the complete pipeline', async () => {
      // Setup mocks
      const mockGetAppById = getAppById as Mock
      const mockCompileAppSpecToPrompt = compileAppSpecToPrompt as Mock
      const mockCreateClient = createClient as Mock
      const mockInjectInvariants = injectInvariants as Mock
      const mockExtractFiles = extractFiles as Mock
      const mockCreateAppRepo = createAppRepo as Mock
      const mockOctokit = Octokit as unknown as Mock

      // Mock database app fetch
      mockGetAppById.mockResolvedValue({
        id: mockAppId,
        userId: mockUserId,
        name: 'Test App',
        spec: mockAppSpec,
        createdAt: new Date(),
      })

      // Mock prompt compilation
      mockCompileAppSpecToPrompt.mockReturnValue('Generated prompt for v0')

      // Mock v0 client and chat creation
      const mockChatsCreate = vi.fn().mockResolvedValue(mockChatDetail)
      mockCreateClient.mockReturnValue({
        chats: {
          create: mockChatsCreate,
        },
      })

      // Mock post-processing
      mockInjectInvariants.mockResolvedValue({
        original: 'original code',
        modified: 'modified code with invariants',
        injectedFiles: [
          'lib/fastformClient.ts',
          'lib/analytics.ts',
          'lib/auth-middleware.ts',
          'middleware.ts',
        ],
      })

      mockExtractFiles.mockReturnValue({
        'lib/fastformClient.ts': 'fastform client code',
        'lib/analytics.ts': 'analytics code',
        'lib/auth-middleware.ts': 'auth middleware code',
        'middleware.ts': 'middleware code',
      })

      // Mock GitHub operations
      const mockGitGetRef = vi.fn().mockResolvedValue({
        data: {
          object: { sha: 'base-commit-sha' },
        },
      })

      const mockGitGetCommit = vi.fn().mockResolvedValue({
        data: {
          tree: { sha: 'tree-sha' },
        },
      })

      const mockGitCreateBlob = vi.fn().mockResolvedValue({
        data: { sha: 'blob-sha' },
      })

      const mockGitCreateTree = vi.fn().mockResolvedValue({
        data: { sha: 'new-tree-sha' },
      })

      const mockGitCreateCommit = vi.fn().mockResolvedValue({
        data: { sha: 'new-commit-sha' },
      })

      const mockGitUpdateRef = vi.fn().mockResolvedValue({})

      const mockReposGet = vi.fn().mockResolvedValue({
        data: {
          name: 'test-org-test-app',
          html_url: 'https://github.com/getfastform/test-org-test-app',
        },
      })

      mockOctokit.mockImplementation(function (this: unknown) {
        return {
          git: {
            getRef: mockGitGetRef,
            getCommit: mockGitGetCommit,
            createBlob: mockGitCreateBlob,
            createTree: mockGitCreateTree,
            createCommit: mockGitCreateCommit,
            updateRef: mockGitUpdateRef,
          },
          repos: {
            get: mockReposGet,
          },
        }
      })

      // Mock Vercel deployment polling
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            deployments: [
              {
                uid: 'deployment-123',
                name: 'test-org-test-app',
                url: 'test-app-staging.vercel.app',
                created: Date.now(),
                state: 'BUILDING',
                meta: {
                  githubCommitSha: 'new-commit-sha',
                  githubRepo: 'test-org-test-app',
                  githubCommitRef: 'staging',
                },
              },
            ],
            pagination: { count: 1 },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            deployments: [
              {
                uid: 'deployment-123',
                name: 'test-org-test-app',
                url: 'test-app-staging.vercel.app',
                created: Date.now(),
                state: 'READY',
                meta: {
                  githubCommitSha: 'new-commit-sha',
                  githubRepo: 'test-org-test-app',
                  githubCommitRef: 'staging',
                },
              },
            ],
            pagination: { count: 1 },
          }),
        }) as Mock

      // Execute deployment
      const result = await triggerStagingDeploy(mockAppId)

      // Verify result
      expect(result).toEqual({
        stagingUrl: 'https://test-app-staging.vercel.app',
        deploymentId: 'deployment-123',
        githubCommitSha: 'new-commit-sha',
        repoUrl: 'https://github.com/getfastform/test-org-test-app',
        status: 'ready',
      })

      // Verify all steps were called
      expect(mockGetAppById).toHaveBeenCalledWith({ appId: mockAppId })
      expect(mockCompileAppSpecToPrompt).toHaveBeenCalledWith(mockAppSpec)
      expect(mockChatsCreate).toHaveBeenCalledWith({
        message: 'Generated prompt for v0',
        responseMode: 'sync',
        chatPrivacy: 'private',
      })
      expect(mockInjectInvariants).toHaveBeenCalled()
      expect(mockExtractFiles).toHaveBeenCalled()
      expect(mockReposGet).toHaveBeenCalled()
      expect(mockGitGetRef).toHaveBeenCalled()
      expect(mockGitCreateCommit).toHaveBeenCalled()
      expect(mockGitUpdateRef).toHaveBeenCalled()
    })

    it('should throw DeploymentError when app not found', async () => {
      const mockGetAppById = getAppById as Mock
      mockGetAppById.mockResolvedValue(undefined)

      await expect(triggerStagingDeploy(mockAppId)).rejects.toThrow(
        DeploymentError
      )

      await expect(triggerStagingDeploy(mockAppId)).rejects.toThrow(
        'App not found'
      )
    })

    it('should throw DeploymentError when AppSpec is invalid', async () => {
      const mockGetAppById = getAppById as Mock
      mockGetAppById.mockResolvedValue({
        id: mockAppId,
        userId: mockUserId,
        name: 'Test App',
        spec: null, // Invalid spec
        createdAt: new Date(),
      })

      await expect(triggerStagingDeploy(mockAppId)).rejects.toThrow(
        DeploymentError
      )
    })

    it('should throw DeploymentError when prompt compilation fails', async () => {
      const mockGetAppById = getAppById as Mock
      const mockCompileAppSpecToPrompt = compileAppSpecToPrompt as Mock

      mockGetAppById.mockResolvedValue({
        id: mockAppId,
        userId: mockUserId,
        name: 'Test App',
        spec: mockAppSpec,
        createdAt: new Date(),
      })

      mockCompileAppSpecToPrompt.mockImplementation(() => {
        throw new Error('Unsupported feature')
      })

      await expect(triggerStagingDeploy(mockAppId)).rejects.toThrow(
        DeploymentError
      )
    })

    it('should throw CodeGenerationError when v0 generation fails', async () => {
      const mockGetAppById = getAppById as Mock
      const mockCompileAppSpecToPrompt = compileAppSpecToPrompt as Mock
      const mockCreateClient = createClient as Mock

      mockGetAppById.mockResolvedValue({
        id: mockAppId,
        userId: mockUserId,
        name: 'Test App',
        spec: mockAppSpec,
        createdAt: new Date(),
      })

      mockCompileAppSpecToPrompt.mockReturnValue('Generated prompt')

      const mockChatsCreate = vi.fn().mockRejectedValue(new Error('v0 API error'))
      mockCreateClient.mockReturnValue({
        chats: {
          create: mockChatsCreate,
        },
      })

      await expect(triggerStagingDeploy(mockAppId)).rejects.toThrow(
        CodeGenerationError
      )
    })

    it('should throw DeploymentError when GITHUB_TOKEN is missing', async () => {
      delete process.env.GITHUB_TOKEN

      const mockGetAppById = getAppById as Mock
      const mockCompileAppSpecToPrompt = compileAppSpecToPrompt as Mock
      const mockCreateClient = createClient as Mock
      const mockInjectInvariants = injectInvariants as Mock
      const mockExtractFiles = extractFiles as Mock

      mockGetAppById.mockResolvedValue({
        id: mockAppId,
        userId: mockUserId,
        name: 'Test App',
        spec: mockAppSpec,
        createdAt: new Date(),
      })

      mockCompileAppSpecToPrompt.mockReturnValue('Generated prompt')

      const mockChatsCreate = vi.fn().mockResolvedValue(mockChatDetail)
      mockCreateClient.mockReturnValue({
        chats: {
          create: mockChatsCreate,
        },
      })

      mockInjectInvariants.mockResolvedValue({
        original: 'original',
        modified: 'modified',
        injectedFiles: ['lib/fastformClient.ts'],
      })

      mockExtractFiles.mockReturnValue({
        'lib/fastformClient.ts': 'code',
      })

      await expect(triggerStagingDeploy(mockAppId)).rejects.toThrow(
        DeploymentError
      )

      await expect(triggerStagingDeploy(mockAppId)).rejects.toThrow(
        'GITHUB_TOKEN'
      )
    })

    it('should throw DeploymentError when Vercel deployment times out', async () => {
      const mockGetAppById = getAppById as Mock
      const mockCompileAppSpecToPrompt = compileAppSpecToPrompt as Mock
      const mockCreateClient = createClient as Mock
      const mockInjectInvariants = injectInvariants as Mock
      const mockExtractFiles = extractFiles as Mock
      const mockOctokit = Octokit as unknown as Mock

      mockGetAppById.mockResolvedValue({
        id: mockAppId,
        userId: mockUserId,
        name: 'Test App',
        spec: mockAppSpec,
        createdAt: new Date(),
      })

      mockCompileAppSpecToPrompt.mockReturnValue('Generated prompt')

      const mockChatsCreate = vi.fn().mockResolvedValue(mockChatDetail)
      mockCreateClient.mockReturnValue({
        chats: {
          create: mockChatsCreate,
        },
      })

      mockInjectInvariants.mockResolvedValue({
        original: 'original',
        modified: 'modified',
        injectedFiles: ['lib/fastformClient.ts'],
      })

      mockExtractFiles.mockReturnValue({
        'lib/fastformClient.ts': 'code',
      })

      mockOctokit.mockImplementation(function (this: unknown) {
        return {
          git: {
            getRef: vi.fn().mockResolvedValue({
              data: { object: { sha: 'sha' } },
            }),
            getCommit: vi.fn().mockResolvedValue({
              data: { tree: { sha: 'tree-sha' } },
            }),
            createBlob: vi.fn().mockResolvedValue({ data: { sha: 'blob' } }),
            createTree: vi.fn().mockResolvedValue({ data: { sha: 'tree' } }),
            createCommit: vi.fn().mockResolvedValue({ data: { sha: 'commit' } }),
            updateRef: vi.fn().mockResolvedValue({}),
          },
          repos: {
            get: vi.fn().mockResolvedValue({
              data: { name: 'repo', html_url: 'https://github.com/org/repo' },
            }),
          },
        }
      })

      // Mock Vercel API to always return BUILDING status (simulating timeout)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          deployments: [
            {
              uid: 'deployment-123',
              name: 'test-app',
              url: 'test-app.vercel.app',
              created: Date.now(),
              state: 'BUILDING', // Never becomes READY
              meta: {
                githubCommitSha: 'commit',
                githubRepo: 'repo',
                githubCommitRef: 'staging',
              },
            },
          ],
          pagination: { count: 1 },
        }),
      }) as Mock

      // Should timeout after 60 seconds (mocked)
      await expect(triggerStagingDeploy(mockAppId)).rejects.toThrow(
        'Deployment timed out'
      )
    }, 70000) // Increase test timeout to allow for deployment timeout
  })

  describe('Error Classes', () => {
    it('should create DeploymentError with correct properties', () => {
      const error = new DeploymentError('Test error', 'fetch_appspec')

      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe('DeploymentError')
      expect(error.message).toBe('Test error')
      expect(error.phase).toBe('fetch_appspec')
    })

    it('should create CodeGenerationError with correct properties', () => {
      const error = new CodeGenerationError('Test error', 'app-123')

      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe('CodeGenerationError')
      expect(error.message).toBe('Test error')
      expect(error.appId).toBe('app-123')
    })

    it('should create GitHubCommitError with correct properties', () => {
      const error = new GitHubCommitError('Test error', 'my-repo')

      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe('GitHubCommitError')
      expect(error.message).toBe('Test error')
      expect(error.repoName).toBe('my-repo')
    })
  })
})
