/**
 * AppSpec Generator Service
 *
 * Orchestrates template-based AppSpec generation through LLM interaction.
 * Provides functionality to create draft AppSpecs from user intent and
 * regenerate/refine existing AppSpecs based on additional user feedback.
 *
 * @module ai/appspec-generator
 */

import { PSYCH_INTAKE_TEMPLATE } from '@/lib/templates/psych-intake-lite'
import type { FastformAppSpec } from '@/lib/types/appspec'
import { isValidAppSpec } from '@/lib/types/appspec'
import { generateAppSpec, type Message } from './llm-client'

/**
 * Re-export Message type from llm-client for convenience.
 * Message interface for chat conversation history.
 */
export type { Message }

/**
 * Error thrown when AppSpec generation fails validation.
 */
export class AppSpecValidationError extends Error {
  constructor(
    message: string,
    public readonly validationErrors?: string[]
  ) {
    super(message)
    this.name = 'AppSpecValidationError'
  }
}

/**
 * Error thrown when LLM fails to generate valid JSON.
 */
export class AppSpecGenerationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'AppSpecGenerationError'
  }
}

/**
 * Creates a draft AppSpec from user intent and conversation history.
 *
 * This function orchestrates the template-based generation workflow:
 * 1. Loads the Psych Intake Lite template as a base
 * 2. Enriches the user intent with template context and modification instructions
 * 3. Calls the LLM to modify the template based on user's healthcare use case
 * 4. Validates the generated AppSpec against the v0.3 schema
 * 5. Returns the validated draft (not persisted to database)
 *
 * @param intent - User's description of their desired healthcare application
 * @param history - Conversation history for context (empty array for first message)
 * @returns Promise resolving to a validated FastformAppSpec draft
 * @throws {AppSpecGenerationError} When LLM fails to generate valid JSON
 * @throws {AppSpecValidationError} When generated AppSpec fails schema validation
 *
 * @example
 * ```typescript
 * const spec = await createDraftAppSpec(
 *   "I need a patient intake form for my dental practice",
 *   []
 * )
 * console.log(spec.meta.name) // "Dental Patient Intake"
 * ```
 */
export async function createDraftAppSpec(
  intent: string,
  history: Message[]
): Promise<FastformAppSpec> {
  // Build enriched user intent with template context
  const enrichedIntent = buildTemplateBasedIntent(PSYCH_INTAKE_TEMPLATE, intent)

  try {
    // Call LLM to generate AppSpec
    // The llm-client handles system prompt internally
    const generatedSpec = await generateAppSpec(enrichedIntent, history)

    // Validate the generated AppSpec
    if (!isValidAppSpec(generatedSpec)) {
      throw new AppSpecValidationError(
        'Generated AppSpec failed schema validation. The LLM output does not match the FastformAppSpec v0.3 schema.',
        extractValidationErrors(generatedSpec)
      )
    }

    return generatedSpec
  } catch (error) {
    if (
      error instanceof AppSpecValidationError ||
      error instanceof AppSpecGenerationError
    ) {
      throw error
    }

    // Wrap unexpected errors
    throw new AppSpecGenerationError(
      'Failed to generate AppSpec from user intent. The LLM may have returned invalid JSON or encountered an error.',
      error
    )
  }
}

/**
 * Regenerates an AppSpec by applying new user feedback to the current spec.
 *
 * This function enables iterative refinement of the AppSpec:
 * 1. Takes the current AppSpec as context
 * 2. Builds conversation history with current spec as assistant's previous response
 * 3. Adds user's requested changes as a new message
 * 4. Calls the LLM to apply the modifications
 * 5. Validates the updated AppSpec against the v0.3 schema
 * 6. Returns the validated updated spec
 *
 * @param currentSpec - The existing AppSpec to be modified
 * @param newMessage - User's feedback or requested changes
 * @returns Promise resolving to an updated FastformAppSpec
 * @throws {AppSpecGenerationError} When LLM fails to generate valid JSON
 * @throws {AppSpecValidationError} When updated AppSpec fails schema validation
 *
 * @example
 * ```typescript
 * const updatedSpec = await regenerateAppSpec(
 *   currentSpec,
 *   "Add a field for insurance provider"
 * )
 * ```
 */
export async function regenerateAppSpec(
  currentSpec: FastformAppSpec,
  newMessage: string
): Promise<FastformAppSpec> {
  // Build enriched refinement message with current spec context
  const enrichedMessage = buildRefinementIntent(currentSpec, newMessage)

  // Build message history with current spec as previous context
  const history: Message[] = [
    {
      role: 'user',
      content: 'Generate a healthcare intake form AppSpec',
    },
    {
      role: 'assistant',
      content: `Here is the current AppSpec:\n\n${JSON.stringify(currentSpec, null, 2)}`,
    },
  ]

  try {
    // Call LLM to generate updated AppSpec
    // The llm-client handles system prompt internally
    const updatedSpec = await generateAppSpec(enrichedMessage, history)

    // Validate the updated AppSpec
    if (!isValidAppSpec(updatedSpec)) {
      throw new AppSpecValidationError(
        'Updated AppSpec failed schema validation. The LLM output does not match the FastformAppSpec v0.3 schema.',
        extractValidationErrors(updatedSpec)
      )
    }

    return updatedSpec
  } catch (error) {
    if (
      error instanceof AppSpecValidationError ||
      error instanceof AppSpecGenerationError
    ) {
      throw error
    }

    // Wrap unexpected errors
    throw new AppSpecGenerationError(
      'Failed to regenerate AppSpec with new changes. The LLM may have returned invalid JSON or encountered an error.',
      error
    )
  }
}

/**
 * Builds an enriched user intent that includes the template as context.
 *
 * Constructs a comprehensive user message that includes:
 * - The base template (Psych Intake Lite) as JSON context
 * - Clear instructions for modifying the template
 * - User's intent/description
 * - Schema requirements and constraints
 *
 * The llm-client will handle the system prompt internally, so this function
 * enriches the user's intent with template context and instructions.
 *
 * @param template - The base template to use as starting point
 * @param userIntent - User's description of their healthcare use case
 * @returns Enriched user intent string
 */
function buildTemplateBasedIntent(
  template: FastformAppSpec,
  userIntent: string
): string {
  return `I need you to generate a FastformAppSpec for a healthcare application based on this template and my specific requirements.

BASE TEMPLATE (use this as a starting point):
${JSON.stringify(template, null, 2)}

MY REQUIREMENTS:
${userIntent}

INSTRUCTIONS FOR MODIFICATION:
- Modify the template to match my specific healthcare use case
- Adjust field labels, page titles, workflow states as needed
- Keep the same structure (roles, page types, workflow pattern)
- Update app name and slug to match my use case
- Ensure field IDs are unique and use camelCase
- For form pages, keep fields relevant to the healthcare context
- For workflow states, adapt them to my approval/review process

CONSTRAINTS:
- Use only supported page types: welcome, form, review, success, login, list, detail
- Use only supported field types: text, email, tel, date, textarea, select, radio, checkbox, number
- Keep workflow simple (DRAFT → SUBMITTED → NEEDS_INFO/APPROVED/REJECTED)
- Maintain API endpoint structure from template
- Preserve placeholder values ({{APP_ID_UUID}}, {{ORG_ID_UUID}}, etc.)`
}

/**
 * Builds an enriched refinement message that includes the current spec context.
 *
 * Constructs a message that focuses on applying specific changes to
 * an existing AppSpec while maintaining schema compliance.
 *
 * @param currentSpec - The current AppSpec being modified
 * @param userMessage - User's requested changes
 * @returns Enriched refinement message string
 */
function buildRefinementIntent(
  currentSpec: FastformAppSpec,
  userMessage: string
): string {
  return `I need you to refine the existing AppSpec I provided based on these changes:

MY REQUESTED CHANGES:
${userMessage}

INSTRUCTIONS:
- Apply my requested changes to the current AppSpec
- Maintain the overall structure and schema compliance
- Only modify the parts that need to change based on my feedback
- Preserve existing fields unless I explicitly ask to remove them
- When adding new fields, use appropriate field types and validation
- Ensure field IDs remain unique and use camelCase
- Maintain workflow state transitions and role permissions

CONSTRAINTS:
- Use only supported page types: welcome, form, review, success, login, list, detail
- Use only supported field types: text, email, tel, date, textarea, select, radio, checkbox, number
- Keep workflow states consistent with healthcare approval patterns
- Version must remain "0.3"
- Preserve placeholder values ({{APP_ID_UUID}}, {{ORG_ID_UUID}}, etc.)`
}

/**
 * Attempts to extract validation error details from an invalid AppSpec.
 *
 * This helper function provides more detailed error messages by inspecting
 * the structure of the invalid object and identifying missing or malformed fields.
 *
 * @param obj - The object that failed validation
 * @returns Array of human-readable validation error messages
 */
function extractValidationErrors(obj: unknown): string[] {
  const errors: string[] = []

  if (!obj || typeof obj !== 'object') {
    errors.push('Generated output is not a valid object')
    return errors
  }

  const spec = obj as Partial<FastformAppSpec>

  // Check required top-level fields
  if (typeof spec.id !== 'string') errors.push('Missing or invalid "id" field')
  if (spec.version !== '0.3')
    errors.push('Missing or invalid "version" field (must be "0.3")')
  if (!spec.meta || typeof spec.meta !== 'object')
    errors.push('Missing or invalid "meta" object')
  if (!spec.theme || typeof spec.theme !== 'object')
    errors.push('Missing or invalid "theme" object')
  if (!Array.isArray(spec.roles))
    errors.push('Missing or invalid "roles" array')
  if (!Array.isArray(spec.pages))
    errors.push('Missing or invalid "pages" array')
  if (!spec.workflow || typeof spec.workflow !== 'object')
    errors.push('Missing or invalid "workflow" object')
  if (!spec.api || typeof spec.api !== 'object')
    errors.push('Missing or invalid "api" object')
  if (!spec.analytics || typeof spec.analytics !== 'object')
    errors.push('Missing or invalid "analytics" object')
  if (!spec.environments || typeof spec.environments !== 'object')
    errors.push('Missing or invalid "environments" object')

  // Check meta fields if meta exists
  if (spec.meta && typeof spec.meta === 'object') {
    if (typeof spec.meta.name !== 'string')
      errors.push('Missing or invalid "meta.name"')
    if (typeof spec.meta.slug !== 'string')
      errors.push('Missing or invalid "meta.slug"')
    if (typeof spec.meta.description !== 'string')
      errors.push('Missing or invalid "meta.description"')
    if (typeof spec.meta.orgId !== 'string')
      errors.push('Missing or invalid "meta.orgId"')
    if (typeof spec.meta.orgSlug !== 'string')
      errors.push('Missing or invalid "meta.orgSlug"')
  }

  // Check theme fields if theme exists
  if (spec.theme && typeof spec.theme === 'object') {
    if (spec.theme.preset !== 'healthcare-calm')
      errors.push('Invalid "theme.preset" (must be "healthcare-calm")')
  }

  return errors
}
