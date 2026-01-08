/**
 * Unit tests for AppSpec Generator Service
 *
 * @module ai/appspec-generator.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createDraftAppSpec,
  regenerateAppSpec,
  AppSpecValidationError,
  AppSpecGenerationError,
  type Message,
} from './appspec-generator'
import type { FastformAppSpec } from '@/lib/types/appspec'

// Mock dependencies
vi.mock('./llm-client', () => ({
  generateAppSpec: vi.fn(),
}))

vi.mock('@/lib/types/appspec', async () => {
  const actual = await vi.importActual<typeof import('@/lib/types/appspec')>(
    '@/lib/types/appspec'
  )
  return {
    ...actual,
    isValidAppSpec: vi.fn(),
  }
})

vi.mock('@/lib/templates/psych-intake-lite', () => ({
  PSYCH_INTAKE_TEMPLATE: {
    id: '{{APP_ID_UUID}}',
    version: '0.3',
    meta: {
      name: 'Psych Intake Lite',
      slug: 'psych-intake',
      description: 'Quick mental health intake for new patients',
      orgId: '{{ORG_ID_UUID}}',
      orgSlug: '{{ORG_SLUG}}',
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
        createSubmission: 'POST /api/apps/:appId/submissions',
        getSubmission: 'GET /api/apps/:appId/submissions/:id',
        resubmitSubmission: 'POST /api/apps/:appId/submissions/:id/resubmit',
        staffLogin: 'POST /api/apps/:appId/staff/login',
        staffLogout: 'POST /api/apps/:appId/staff/logout',
        staffSession: 'GET /api/apps/:appId/staff/session',
        listSubmissions: 'GET /api/apps/:appId/staff/inbox',
        getSubmissionDetail: 'GET /api/apps/:appId/staff/submissions/:id',
        transitionSubmission:
          'POST /api/apps/:appId/staff/submissions/:id/transition',
        trackEvent: 'POST /api/apps/:appId/events',
      },
    },
    analytics: {
      events: [],
    },
    environments: {
      staging: {
        domain: 'psych-intake-{{ORG_SLUG}}-staging.getfastform.com',
        apiUrl: 'https://api-staging.getfastform.com',
      },
      production: {
        domain: 'psych-intake-{{ORG_SLUG}}.getfastform.com',
        apiUrl: 'https://api.getfastform.com',
      },
    },
  },
}))

// Import mocked functions
import { generateAppSpec } from './llm-client'
import { isValidAppSpec } from '@/lib/types/appspec'

describe('appspec-generator', () => {
  // Mock valid AppSpec for testing
  const mockValidAppSpec: FastformAppSpec = {
    id: '{{APP_ID_UUID}}',
    version: '0.3',
    meta: {
      name: 'Dental Patient Intake',
      slug: 'dental-intake',
      description: 'Patient intake form for dental practice',
      orgId: '{{ORG_ID_UUID}}',
      orgSlug: 'dental-clinic',
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
        title: 'Welcome to Dental Intake',
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
  })

  describe('Error Classes', () => {
    describe('AppSpecValidationError', () => {
      it('should create error with message and validation errors', () => {
        const validationErrors = ['Missing meta.name', 'Invalid version']
        const error = new AppSpecValidationError(
          'Validation failed',
          validationErrors
        )

        expect(error.name).toBe('AppSpecValidationError')
        expect(error.message).toBe('Validation failed')
        expect(error.validationErrors).toEqual(validationErrors)
      })

      it('should create error without validation errors array', () => {
        const error = new AppSpecValidationError('Validation failed')

        expect(error.name).toBe('AppSpecValidationError')
        expect(error.message).toBe('Validation failed')
        expect(error.validationErrors).toBeUndefined()
      })
    })

    describe('AppSpecGenerationError', () => {
      it('should create error with message and cause', () => {
        const cause = new Error('LLM failed')
        const error = new AppSpecGenerationError('Generation failed', cause)

        expect(error.name).toBe('AppSpecGenerationError')
        expect(error.message).toBe('Generation failed')
        expect(error.cause).toBe(cause)
      })

      it('should create error without cause', () => {
        const error = new AppSpecGenerationError('Generation failed')

        expect(error.name).toBe('AppSpecGenerationError')
        expect(error.message).toBe('Generation failed')
        expect(error.cause).toBeUndefined()
      })
    })
  })

  describe('createDraftAppSpec', () => {
    it('should successfully generate valid AppSpec from user intent', async () => {
      vi.mocked(generateAppSpec).mockResolvedValue(mockValidAppSpec)
      vi.mocked(isValidAppSpec).mockReturnValue(true)

      const result = await createDraftAppSpec(
        'I need a patient intake form for my dental practice',
        []
      )

      expect(result).toEqual(mockValidAppSpec)
      expect(generateAppSpec).toHaveBeenCalledTimes(1)
      expect(isValidAppSpec).toHaveBeenCalledWith(mockValidAppSpec)
    })

    it('should use Psych Intake template as base', async () => {
      vi.mocked(generateAppSpec).mockResolvedValue(mockValidAppSpec)
      vi.mocked(isValidAppSpec).mockReturnValue(true)

      await createDraftAppSpec(
        'I need a patient intake form for my dental practice',
        []
      )

      const callArgs = vi.mocked(generateAppSpec).mock.calls[0]
      const enrichedIntent = callArgs[0]

      // Verify template is included in enriched intent
      expect(enrichedIntent).toContain('BASE TEMPLATE')
      expect(enrichedIntent).toContain('Psych Intake Lite')
    })

    it('should pass intent and history to generateAppSpec', async () => {
      vi.mocked(generateAppSpec).mockResolvedValue(mockValidAppSpec)
      vi.mocked(isValidAppSpec).mockReturnValue(true)

      const intent = 'Create a dental intake form'
      const history: Message[] = [
        { role: 'user', content: 'What can you help with?' },
        { role: 'assistant', content: 'I can create AppSpecs' },
      ]

      await createDraftAppSpec(intent, history)

      expect(generateAppSpec).toHaveBeenCalledWith(
        expect.stringContaining(intent),
        history
      )
    })

    it('should validate output using isValidAppSpec', async () => {
      vi.mocked(generateAppSpec).mockResolvedValue(mockValidAppSpec)
      vi.mocked(isValidAppSpec).mockReturnValue(true)

      await createDraftAppSpec(
        'I need a patient intake form for my dental practice',
        []
      )

      expect(isValidAppSpec).toHaveBeenCalledWith(mockValidAppSpec)
    })

    it('should throw AppSpecValidationError if validation fails', async () => {
      const invalidSpec = { ...mockValidAppSpec, version: '0.2' as '0.3' }
      vi.mocked(generateAppSpec).mockResolvedValue(invalidSpec)
      vi.mocked(isValidAppSpec).mockReturnValue(false)

      await expect(
        createDraftAppSpec(
          'I need a patient intake form for my dental practice',
          []
        )
      ).rejects.toThrow(AppSpecValidationError)

      await expect(
        createDraftAppSpec(
          'I need a patient intake form for my dental practice',
          []
        )
      ).rejects.toThrow('Generated AppSpec failed schema validation')
    })

    it('should throw AppSpecGenerationError if generation fails', async () => {
      vi.mocked(generateAppSpec).mockRejectedValue(
        new Error('LLM connection failed')
      )

      await expect(
        createDraftAppSpec(
          'I need a patient intake form for my dental practice',
          []
        )
      ).rejects.toThrow(AppSpecGenerationError)

      await expect(
        createDraftAppSpec(
          'I need a patient intake form for my dental practice',
          []
        )
      ).rejects.toThrow('Failed to generate AppSpec from user intent')
    })

    it('should handle empty history array', async () => {
      vi.mocked(generateAppSpec).mockResolvedValue(mockValidAppSpec)
      vi.mocked(isValidAppSpec).mockReturnValue(true)

      const result = await createDraftAppSpec(
        'I need a patient intake form for my dental practice',
        []
      )

      expect(result).toEqual(mockValidAppSpec)
      expect(generateAppSpec).toHaveBeenCalledWith(
        expect.any(String),
        []
      )
    })

    it('should include template in enriched intent', async () => {
      vi.mocked(generateAppSpec).mockResolvedValue(mockValidAppSpec)
      vi.mocked(isValidAppSpec).mockReturnValue(true)

      await createDraftAppSpec(
        'I need a patient intake form for my dental practice',
        []
      )

      const callArgs = vi.mocked(generateAppSpec).mock.calls[0]
      const enrichedIntent = callArgs[0]

      // Verify enriched intent structure
      expect(enrichedIntent).toContain('BASE TEMPLATE')
      expect(enrichedIntent).toContain('MY REQUIREMENTS')
      expect(enrichedIntent).toContain('INSTRUCTIONS FOR MODIFICATION')
      expect(enrichedIntent).toContain('CONSTRAINTS')
      expect(enrichedIntent).toContain(
        'I need a patient intake form for my dental practice'
      )
    })

    it('should preserve AppSpecValidationError when thrown', async () => {
      const validationError = new AppSpecValidationError(
        'Custom validation error',
        ['Missing field']
      )
      vi.mocked(generateAppSpec).mockRejectedValue(validationError)

      await expect(
        createDraftAppSpec(
          'I need a patient intake form for my dental practice',
          []
        )
      ).rejects.toThrow(validationError)
    })

    it('should preserve AppSpecGenerationError when thrown', async () => {
      const generationError = new AppSpecGenerationError(
        'Custom generation error',
        new Error('LLM error')
      )
      vi.mocked(generateAppSpec).mockRejectedValue(generationError)

      await expect(
        createDraftAppSpec(
          'I need a patient intake form for my dental practice',
          []
        )
      ).rejects.toThrow(generationError)
    })

    it('should include detailed validation errors in error message', async () => {
      const invalidSpec = { id: 'test' } as unknown as FastformAppSpec
      vi.mocked(generateAppSpec).mockResolvedValue(invalidSpec)
      vi.mocked(isValidAppSpec).mockReturnValue(false)

      try {
        await createDraftAppSpec(
          'I need a patient intake form for my dental practice',
          []
        )
        expect.fail('Should have thrown AppSpecValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(AppSpecValidationError)
        const validationError = error as AppSpecValidationError
        expect(validationError.validationErrors).toBeDefined()
        expect(Array.isArray(validationError.validationErrors)).toBe(true)
      }
    })
  })

  describe('regenerateAppSpec', () => {
    it('should successfully regenerate AppSpec with refinements', async () => {
      const updatedSpec = {
        ...mockValidAppSpec,
        meta: {
          ...mockValidAppSpec.meta,
          name: 'Updated Dental Intake',
        },
      }
      vi.mocked(generateAppSpec).mockResolvedValue(updatedSpec)
      vi.mocked(isValidAppSpec).mockReturnValue(true)

      const result = await regenerateAppSpec(
        mockValidAppSpec,
        'Add a field for insurance provider'
      )

      expect(result).toEqual(updatedSpec)
      expect(generateAppSpec).toHaveBeenCalledTimes(1)
      expect(isValidAppSpec).toHaveBeenCalledWith(updatedSpec)
    })

    it('should include current spec in conversation history', async () => {
      vi.mocked(generateAppSpec).mockResolvedValue(mockValidAppSpec)
      vi.mocked(isValidAppSpec).mockReturnValue(true)

      await regenerateAppSpec(
        mockValidAppSpec,
        'Add a field for insurance provider'
      )

      const callArgs = vi.mocked(generateAppSpec).mock.calls[0]
      const history = callArgs[1]

      expect(history).toHaveLength(2)
      expect(history[0]).toEqual({
        role: 'user',
        content: 'Generate a healthcare intake form AppSpec',
      })
      expect(history[1]).toEqual({
        role: 'assistant',
        content: expect.stringContaining(
          JSON.stringify(mockValidAppSpec, null, 2)
        ),
      })
      expect(history[1].content).toContain('Here is the current AppSpec')
    })

    it('should pass new message as user intent', async () => {
      vi.mocked(generateAppSpec).mockResolvedValue(mockValidAppSpec)
      vi.mocked(isValidAppSpec).mockReturnValue(true)

      const newMessage = 'Add a field for insurance provider'

      await regenerateAppSpec(mockValidAppSpec, newMessage)

      const callArgs = vi.mocked(generateAppSpec).mock.calls[0]
      const enrichedMessage = callArgs[0]

      expect(enrichedMessage).toContain(newMessage)
      expect(enrichedMessage).toContain('MY REQUESTED CHANGES')
      expect(enrichedMessage).toContain('INSTRUCTIONS')
      expect(enrichedMessage).toContain('CONSTRAINTS')
    })

    it('should validate updated spec', async () => {
      vi.mocked(generateAppSpec).mockResolvedValue(mockValidAppSpec)
      vi.mocked(isValidAppSpec).mockReturnValue(true)

      await regenerateAppSpec(
        mockValidAppSpec,
        'Add a field for insurance provider'
      )

      expect(isValidAppSpec).toHaveBeenCalledWith(mockValidAppSpec)
    })

    it('should throw AppSpecValidationError if validation fails', async () => {
      const invalidSpec = { ...mockValidAppSpec, version: '0.2' as '0.3' }
      vi.mocked(generateAppSpec).mockResolvedValue(invalidSpec)
      vi.mocked(isValidAppSpec).mockReturnValue(false)

      await expect(
        regenerateAppSpec(mockValidAppSpec, 'Add a field for insurance provider')
      ).rejects.toThrow(AppSpecValidationError)

      await expect(
        regenerateAppSpec(mockValidAppSpec, 'Add a field for insurance provider')
      ).rejects.toThrow('Updated AppSpec failed schema validation')
    })

    it('should throw AppSpecGenerationError if generation fails', async () => {
      vi.mocked(generateAppSpec).mockRejectedValue(
        new Error('LLM connection failed')
      )

      await expect(
        regenerateAppSpec(mockValidAppSpec, 'Add a field for insurance provider')
      ).rejects.toThrow(AppSpecGenerationError)

      await expect(
        regenerateAppSpec(mockValidAppSpec, 'Add a field for insurance provider')
      ).rejects.toThrow('Failed to regenerate AppSpec with new changes')
    })

    it('should preserve valid parts of spec during regeneration', async () => {
      const updatedSpec = {
        ...mockValidAppSpec,
        pages: [
          ...mockValidAppSpec.pages,
          {
            id: 'new-page',
            route: '/new',
            role: 'PATIENT' as const,
            type: 'form' as const,
            title: 'New Page',
          },
        ],
      }
      vi.mocked(generateAppSpec).mockResolvedValue(updatedSpec)
      vi.mocked(isValidAppSpec).mockReturnValue(true)

      const result = await regenerateAppSpec(
        mockValidAppSpec,
        'Add a new form page'
      )

      // Verify original fields are preserved
      expect(result.id).toBe(mockValidAppSpec.id)
      expect(result.version).toBe(mockValidAppSpec.version)
      expect(result.meta).toEqual(mockValidAppSpec.meta)
      expect(result.theme).toEqual(mockValidAppSpec.theme)

      // Verify new page was added
      expect(result.pages).toHaveLength(2)
      expect(result.pages[1].id).toBe('new-page')
    })

    it('should preserve AppSpecValidationError when thrown', async () => {
      const validationError = new AppSpecValidationError(
        'Custom validation error',
        ['Missing field']
      )
      vi.mocked(generateAppSpec).mockRejectedValue(validationError)

      await expect(
        regenerateAppSpec(mockValidAppSpec, 'Add a field for insurance provider')
      ).rejects.toThrow(validationError)
    })

    it('should preserve AppSpecGenerationError when thrown', async () => {
      const generationError = new AppSpecGenerationError(
        'Custom generation error',
        new Error('LLM error')
      )
      vi.mocked(generateAppSpec).mockRejectedValue(generationError)

      await expect(
        regenerateAppSpec(mockValidAppSpec, 'Add a field for insurance provider')
      ).rejects.toThrow(generationError)
    })

    it('should include detailed validation errors in error message', async () => {
      const invalidSpec = { id: 'test' } as unknown as FastformAppSpec
      vi.mocked(generateAppSpec).mockResolvedValue(invalidSpec)
      vi.mocked(isValidAppSpec).mockReturnValue(false)

      try {
        await regenerateAppSpec(
          mockValidAppSpec,
          'Add a field for insurance provider'
        )
        expect.fail('Should have thrown AppSpecValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(AppSpecValidationError)
        const validationError = error as AppSpecValidationError
        expect(validationError.validationErrors).toBeDefined()
        expect(Array.isArray(validationError.validationErrors)).toBe(true)
      }
    })
  })

  describe('Error Handling Tests', () => {
    it('should handle LLM network errors gracefully', async () => {
      vi.mocked(generateAppSpec).mockRejectedValue(
        new Error('Network timeout')
      )

      await expect(
        createDraftAppSpec(
          'I need a patient intake form for my dental practice',
          []
        )
      ).rejects.toThrow(AppSpecGenerationError)
    })

    it('should provide detailed validation error messages', async () => {
      const incompleteSpec = {
        id: '{{APP_ID_UUID}}',
        version: '0.3',
        // Missing meta, theme, etc.
      } as unknown as FastformAppSpec

      vi.mocked(generateAppSpec).mockResolvedValue(incompleteSpec)
      vi.mocked(isValidAppSpec).mockReturnValue(false)

      try {
        await createDraftAppSpec('Create a form', [])
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(AppSpecValidationError)
        const validationError = error as AppSpecValidationError
        expect(validationError.validationErrors).toBeDefined()
        expect(validationError.validationErrors!.length).toBeGreaterThan(0)
      }
    })

    it('should wrap errors with proper context in createDraftAppSpec', async () => {
      vi.mocked(generateAppSpec).mockRejectedValue(
        new Error('Unexpected LLM error')
      )

      try {
        await createDraftAppSpec('Create a form', [])
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(AppSpecGenerationError)
        const genError = error as AppSpecGenerationError
        expect(genError.message).toContain('Failed to generate AppSpec from user intent')
        expect(genError.cause).toBeInstanceOf(Error)
      }
    })

    it('should wrap errors with proper context in regenerateAppSpec', async () => {
      vi.mocked(generateAppSpec).mockRejectedValue(
        new Error('Unexpected LLM error')
      )

      try {
        await regenerateAppSpec(mockValidAppSpec, 'Update the form')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(AppSpecGenerationError)
        const genError = error as AppSpecGenerationError
        expect(genError.message).toContain('Failed to regenerate AppSpec with new changes')
        expect(genError.cause).toBeInstanceOf(Error)
      }
    })
  })
})
