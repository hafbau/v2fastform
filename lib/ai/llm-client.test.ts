/**
 * Unit tests for LLM Client
 *
 * @module ai/llm-client.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  generateAppSpec,
  validateAppSpec,
  AppSpecGenerationError,
  NoProvidersConfiguredError,
  type Message,
} from './llm-client'
import type { FastformAppSpec } from '@/lib/types/appspec'

// Mock the ai SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
}))

vi.mock('@ai-sdk/azure', () => ({
  createAzure: vi.fn(() => vi.fn()),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn()),
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn()),
}))

// Import mocked generateText
import { generateText } from 'ai'

describe('llm-client', () => {
  // Store original env
  const originalEnv = process.env

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv }
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore environment after each test
    process.env = originalEnv
  })

  describe('NoProvidersConfiguredError', () => {
    it('should throw when no providers are configured', async () => {
      // Clear all provider env vars
      delete process.env.AZURE_OPENAI_ENDPOINT
      delete process.env.AZURE_OPENAI_KEY
      delete process.env.OPENAI_API_KEY
      delete process.env.ANTHROPIC_API_KEY

      await expect(
        generateAppSpec('Create a patient intake form', [])
      ).rejects.toThrow(NoProvidersConfiguredError)
    })

    it('should have correct error message', () => {
      const error = new NoProvidersConfiguredError()
      expect(error.message).toContain('No LLM providers configured')
      expect(error.message).toContain('AZURE_OPENAI_ENDPOINT')
      expect(error.message).toContain('OPENAI_API_KEY')
      expect(error.message).toContain('ANTHROPIC_API_KEY')
    })
  })

  describe('AppSpecGenerationError', () => {
    it('should include provider name and message', () => {
      const error = new AppSpecGenerationError(
        'Test error',
        'TestProvider',
        new Error('Original error')
      )
      expect(error.message).toBe('Test error')
      expect(error.provider).toBe('TestProvider')
      expect(error.cause).toBeInstanceOf(Error)
      expect(error.name).toBe('AppSpecGenerationError')
    })
  })

  describe('generateAppSpec validation', () => {
    it('should reject empty user intent', async () => {
      process.env.OPENAI_API_KEY = 'test-key'

      await expect(generateAppSpec('', [])).rejects.toThrow(
        'User intent cannot be empty'
      )
    })

    it('should reject whitespace-only user intent', async () => {
      process.env.OPENAI_API_KEY = 'test-key'

      await expect(generateAppSpec('   ', [])).rejects.toThrow(
        'User intent cannot be empty'
      )
    })
  })

  describe('generateAppSpec with valid response', () => {
    const mockValidAppSpec: FastformAppSpec = {
      id: '{{APP_ID_UUID}}',
      version: '0.3',
      meta: {
        name: 'Test App',
        slug: 'test-app',
        description: 'A test application',
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
      pages: [
        {
          id: 'welcome',
          route: '/',
          role: 'PATIENT',
          type: 'welcome',
          title: 'Welcome',
        },
      ],
      workflow: {
        states: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'],
        initialState: 'DRAFT',
        transitions: [
          {
            from: 'DRAFT',
            to: 'SUBMITTED',
            allowedRoles: ['PATIENT'],
          },
        ],
      },
      api: {
        baseUrl: '{{FASTFORM_API_URL}}',
        endpoints: {
          createSubmission: '/api/apps/{{APP_ID_UUID}}/submissions',
          getSubmission: '/api/apps/{{APP_ID_UUID}}/submissions/[id]',
          resubmitSubmission:
            '/api/apps/{{APP_ID_UUID}}/submissions/[id]/resubmit',
          staffLogin: '/api/apps/{{APP_ID_UUID}}/staff/login',
          staffLogout: '/api/apps/{{APP_ID_UUID}}/staff/logout',
          staffSession: '/api/apps/{{APP_ID_UUID}}/staff/session',
          listSubmissions: '/api/apps/{{APP_ID_UUID}}/staff/submissions',
          getSubmissionDetail:
            '/api/apps/{{APP_ID_UUID}}/staff/submissions/[id]',
          transitionSubmission:
            '/api/apps/{{APP_ID_UUID}}/staff/submissions/[id]/transition',
          trackEvent: '/api/apps/{{APP_ID_UUID}}/analytics/events',
        },
      },
      analytics: {
        events: [
          {
            name: 'page_view',
            trigger: 'pageview',
          },
        ],
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

    it('should successfully generate AppSpec with OpenAI', async () => {
      process.env.OPENAI_API_KEY = 'test-key'

      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify(mockValidAppSpec),
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      } as any)

      const result = await generateAppSpec('Create a patient intake form', [])

      expect(result).toEqual(mockValidAppSpec)
      expect(generateText).toHaveBeenCalledTimes(1)
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Create a patient intake form'),
          system: expect.stringContaining('FastformAppSpec v0.3'),
          temperature: 0.7,
          maxTokens: 4000,
        })
      )
    })

    it('should include conversation history in prompt', async () => {
      process.env.OPENAI_API_KEY = 'test-key'

      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify(mockValidAppSpec),
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      } as any)

      const history: Message[] = [
        { role: 'user', content: 'I need a form' },
        { role: 'assistant', content: 'What type of form?' },
      ]

      await generateAppSpec('Create a patient intake form', history)

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('CONVERSATION HISTORY'),
        })
      )
    })

    it('should handle markdown code block wrapping', async () => {
      process.env.OPENAI_API_KEY = 'test-key'

      const wrappedResponse = '```json\n' + JSON.stringify(mockValidAppSpec) + '\n```'

      vi.mocked(generateText).mockResolvedValue({
        text: wrappedResponse,
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      } as any)

      const result = await generateAppSpec('Create a patient intake form', [])

      expect(result).toEqual(mockValidAppSpec)
    })

    it('should handle code block without json language identifier', async () => {
      process.env.OPENAI_API_KEY = 'test-key'

      const wrappedResponse = '```\n' + JSON.stringify(mockValidAppSpec) + '\n```'

      vi.mocked(generateText).mockResolvedValue({
        text: wrappedResponse,
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      } as any)

      const result = await generateAppSpec('Create a patient intake form', [])

      expect(result).toEqual(mockValidAppSpec)
    })
  })

  describe('generateAppSpec with invalid responses', () => {
    it('should reject invalid JSON', async () => {
      process.env.OPENAI_API_KEY = 'test-key'

      vi.mocked(generateText).mockResolvedValue({
        text: 'This is not valid JSON {',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      } as any)

      await expect(
        generateAppSpec('Create a patient intake form', [])
      ).rejects.toThrow(AppSpecGenerationError)
    })

    it('should reject JSON that does not match schema', async () => {
      process.env.OPENAI_API_KEY = 'test-key'

      const invalidSpec = {
        id: 'test',
        version: '0.2', // Wrong version
        meta: {},
      }

      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify(invalidSpec),
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      } as any)

      await expect(
        generateAppSpec('Create a patient intake form', [])
      ).rejects.toThrow('does not match FastformAppSpec v0.3 schema')
    })
  })

  describe('provider fallback logic', () => {
    const mockValidAppSpec: FastformAppSpec = {
      id: '{{APP_ID_UUID}}',
      version: '0.3',
      meta: {
        name: 'Test App',
        slug: 'test-app',
        description: 'A test application',
        orgId: '{{ORG_ID_UUID}}',
        orgSlug: 'test-org',
      },
      theme: {
        preset: 'healthcare-calm',
      },
      roles: [
        { id: 'PATIENT', authRequired: false },
        { id: 'STAFF', authRequired: true },
      ],
      pages: [
        {
          id: 'welcome',
          route: '/',
          role: 'PATIENT',
          type: 'welcome',
          title: 'Welcome',
        },
      ],
      workflow: {
        states: ['DRAFT', 'SUBMITTED'],
        initialState: 'DRAFT',
        transitions: [
          {
            from: 'DRAFT',
            to: 'SUBMITTED',
            allowedRoles: ['PATIENT'],
          },
        ],
      },
      api: {
        baseUrl: '{{FASTFORM_API_URL}}',
        endpoints: {
          createSubmission: '/api/apps/{{APP_ID_UUID}}/submissions',
          getSubmission: '/api/apps/{{APP_ID_UUID}}/submissions/[id]',
          resubmitSubmission:
            '/api/apps/{{APP_ID_UUID}}/submissions/[id]/resubmit',
          staffLogin: '/api/apps/{{APP_ID_UUID}}/staff/login',
          staffLogout: '/api/apps/{{APP_ID_UUID}}/staff/logout',
          staffSession: '/api/apps/{{APP_ID_UUID}}/staff/session',
          listSubmissions: '/api/apps/{{APP_ID_UUID}}/staff/submissions',
          getSubmissionDetail:
            '/api/apps/{{APP_ID_UUID}}/staff/submissions/[id]',
          transitionSubmission:
            '/api/apps/{{APP_ID_UUID}}/staff/submissions/[id]/transition',
          trackEvent: '/api/apps/{{APP_ID_UUID}}/analytics/events',
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

    it('should try Azure first if configured', async () => {
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test-resource.openai.azure.com'
      process.env.AZURE_OPENAI_KEY = 'azure-key'
      process.env.OPENAI_API_KEY = 'openai-key'

      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify(mockValidAppSpec),
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      } as any)

      await generateAppSpec('Create a patient intake form', [])

      // Should succeed on first try (Azure)
      expect(generateText).toHaveBeenCalledTimes(1)
    })

    it('should fallback to OpenAI if Azure fails', async () => {
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test-resource.openai.azure.com'
      process.env.AZURE_OPENAI_KEY = 'azure-key'
      process.env.OPENAI_API_KEY = 'openai-key'

      vi.mocked(generateText)
        .mockRejectedValueOnce(new Error('Azure failed'))
        .mockResolvedValueOnce({
          text: JSON.stringify(mockValidAppSpec),
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        } as any)

      await generateAppSpec('Create a patient intake form', [])

      // Should try Azure, then OpenAI
      expect(generateText).toHaveBeenCalledTimes(2)
    })

    it('should fallback to Anthropic if OpenAI fails', async () => {
      process.env.OPENAI_API_KEY = 'openai-key'
      process.env.ANTHROPIC_API_KEY = 'anthropic-key'

      vi.mocked(generateText)
        .mockRejectedValueOnce(new Error('OpenAI failed'))
        .mockResolvedValueOnce({
          text: JSON.stringify(mockValidAppSpec),
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        } as any)

      await generateAppSpec('Create a patient intake form', [])

      // Should try OpenAI, then Anthropic
      expect(generateText).toHaveBeenCalledTimes(2)
    })

    it('should fail if all providers fail', async () => {
      process.env.OPENAI_API_KEY = 'openai-key'
      process.env.ANTHROPIC_API_KEY = 'anthropic-key'

      vi.mocked(generateText)
        .mockRejectedValueOnce(new Error('OpenAI failed'))
        .mockRejectedValueOnce(new Error('Anthropic failed'))

      await expect(
        generateAppSpec('Create a patient intake form', [])
      ).rejects.toThrow('Failed to generate AppSpec with all configured providers')
    })
  })

  describe('validateAppSpec', () => {
    it('should validate a correct AppSpec', () => {
      const validSpec: FastformAppSpec = {
        id: '{{APP_ID_UUID}}',
        version: '0.3',
        meta: {
          name: 'Test App',
          slug: 'test-app',
          description: 'A test application',
          orgId: '{{ORG_ID_UUID}}',
          orgSlug: 'test-org',
        },
        theme: {
          preset: 'healthcare-calm',
        },
        roles: [
          { id: 'PATIENT', authRequired: false },
          { id: 'STAFF', authRequired: true },
        ],
        pages: [
          {
            id: 'welcome',
            route: '/',
            role: 'PATIENT',
            type: 'welcome',
            title: 'Welcome',
          },
        ],
        workflow: {
          states: ['DRAFT', 'SUBMITTED'],
          initialState: 'DRAFT',
          transitions: [
            {
              from: 'DRAFT',
              to: 'SUBMITTED',
              allowedRoles: ['PATIENT'],
            },
          ],
        },
        api: {
          baseUrl: '{{FASTFORM_API_URL}}',
          endpoints: {
            createSubmission: '/api/apps/{{APP_ID_UUID}}/submissions',
            getSubmission: '/api/apps/{{APP_ID_UUID}}/submissions/[id]',
            resubmitSubmission:
              '/api/apps/{{APP_ID_UUID}}/submissions/[id]/resubmit',
            staffLogin: '/api/apps/{{APP_ID_UUID}}/staff/login',
            staffLogout: '/api/apps/{{APP_ID_UUID}}/staff/logout',
            staffSession: '/api/apps/{{APP_ID_UUID}}/staff/session',
            listSubmissions: '/api/apps/{{APP_ID_UUID}}/staff/submissions',
            getSubmissionDetail:
              '/api/apps/{{APP_ID_UUID}}/staff/submissions/[id]',
            transitionSubmission:
              '/api/apps/{{APP_ID_UUID}}/staff/submissions/[id]/transition',
            trackEvent: '/api/apps/{{APP_ID_UUID}}/analytics/events',
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

      expect(validateAppSpec(validSpec)).toBe(true)
    })

    it('should reject invalid objects', () => {
      expect(validateAppSpec(null)).toBe(false)
      expect(validateAppSpec(undefined)).toBe(false)
      expect(validateAppSpec({})).toBe(false)
      expect(validateAppSpec({ version: '0.3' })).toBe(false)
    })
  })
})
