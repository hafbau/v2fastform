/**
 * LLM Client with Azure OpenAI Fallback Support
 *
 * This module provides a unified interface for generating FastformAppSpec using LLMs.
 * It implements a cascading fallback strategy: Azure OpenAI → OpenAI → Anthropic.
 *
 * Environment variables:
 * - AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_KEY: Azure OpenAI (preferred)
 * - OPENAI_API_KEY: Direct OpenAI (fallback)
 * - ANTHROPIC_API_KEY: Anthropic Claude (final fallback)
 *
 * @module ai/llm-client
 */

import { generateText, type LanguageModel } from 'ai'
import { createAzure } from '@ai-sdk/azure'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import type { FastformAppSpec } from '@/lib/types/appspec'
import { isValidAppSpec } from '@/lib/types/appspec'

/**
 * Conditional logger - only logs in development mode
 */
const logger = {
  log: (...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[LLM]', ...args)
    }
  },
  warn: (...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[LLM]', ...args)
    }
  },
  error: (...args: unknown[]) => {
    // Always log errors, but with context
    console.error('[LLM]', ...args)
  },
}

/**
 * Message in a conversation history.
 * Supports both user and assistant messages for context.
 */
export interface Message {
  /** Role of the message sender */
  role: 'user' | 'assistant'
  /** Content of the message */
  content: string
}

/**
 * Provider configuration with credentials and model.
 */
interface ProviderConfig {
  /** Provider name for error messages */
  name: string
  /** AI SDK language model factory function */
  model: (modelId: string) => LanguageModel
  /** Model identifier string */
  modelId: string
}

/**
 * Error thrown when AppSpec generation fails.
 * Includes details about the failure for debugging.
 */
export class AppSpecGenerationError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'AppSpecGenerationError'
  }
}

/**
 * Error thrown when no LLM providers are configured.
 */
export class NoProvidersConfiguredError extends Error {
  constructor() {
    super(
      'No LLM providers configured. Please set one of: ' +
        'AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY'
    )
    this.name = 'NoProvidersConfiguredError'
  }
}

/**
 * Detects and configures available LLM providers in priority order.
 * Returns array of configured providers: [Azure OpenAI, OpenAI, Anthropic].
 *
 * @returns Array of configured provider configs
 * @throws {NoProvidersConfiguredError} If no providers are configured
 */
function getConfiguredProviders(): ProviderConfig[] {
  const providers: ProviderConfig[] = []

  // Priority 1: Azure OpenAI
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT
  const azureKey = process.env.AZURE_OPENAI_KEY
  if (azureEndpoint && azureKey) {
    const azure = createAzure({
      apiKey: azureKey,
      resourceName: extractResourceName(azureEndpoint),
    })
    providers.push({
      name: 'Azure OpenAI',
      model: azure,
      modelId: 'gpt-4o', // Azure deployment name - adjust as needed
    })
  }

  // Priority 2: Direct OpenAI
  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) {
    const openai = createOpenAI({
      apiKey: openaiKey,
    })
    providers.push({
      name: 'OpenAI',
      model: openai,
      modelId: 'gpt-4o',
    })
  }

  // Priority 3: Anthropic
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (anthropicKey) {
    const anthropic = createAnthropic({
      apiKey: anthropicKey,
    })
    providers.push({
      name: 'Anthropic',
      model: anthropic,
      modelId: 'claude-3-5-sonnet-20241022',
    })
  }

  if (providers.length === 0) {
    throw new NoProvidersConfiguredError()
  }

  return providers
}

/**
 * Extracts Azure resource name from endpoint URL.
 * Example: "https://my-resource.openai.azure.com" → "my-resource"
 *
 * @param endpoint - Azure OpenAI endpoint URL
 * @returns Resource name
 */
function extractResourceName(endpoint: string): string {
  const match = endpoint.match(/https?:\/\/([^.]+)\.openai\.azure\.com/)
  if (!match || !match[1]) {
    throw new Error(`Invalid Azure OpenAI endpoint format: ${endpoint}`)
  }
  return match[1]
}

/**
 * Builds the system prompt for AppSpec generation.
 * Includes complete schema definition and generation guidelines.
 *
 * @returns System prompt string
 */
function buildSystemPrompt(): string {
  return `You are a healthcare application specification generator for the Fastform platform.

Your task is to generate a valid FastformAppSpec v0.3 JSON object based on user requirements.

CRITICAL REQUIREMENTS:
1. You MUST return ONLY valid JSON matching the FastformAppSpec v0.3 schema
2. Do NOT include any markdown code blocks, explanations, or text outside the JSON
3. The JSON must be complete, valid, and parseable
4. Use placeholder UUIDs in the format {{APP_ID_UUID}}, {{ORG_ID_UUID}}, etc. for ID fields
5. All required fields must be present and correctly typed

FASTFORM APP SPEC v0.3 SCHEMA:

interface FastformAppSpec {
  id: string                      // UUID, use {{APP_ID_UUID}}
  version: '0.3'                  // Must be exactly "0.3"
  meta: AppMeta
  theme: ThemeConfig
  roles: Role[]
  pages: Page[]
  workflow: WorkflowConfig
  api: ApiConfig
  analytics: AnalyticsConfig
  environments: EnvironmentConfig
}

interface AppMeta {
  name: string                    // Human-readable app name
  slug: string                    // URL-safe slug
  description: string             // Brief description
  orgId: string                   // UUID, use {{ORG_ID_UUID}}
  orgSlug: string                 // Organization slug
}

interface ThemeConfig {
  preset: 'healthcare-calm'       // Must be this exact value
  logo?: string                   // Optional logo URL
  colors?: {
    primary?: string              // Hex color
    background?: string           // Hex color
    text?: string                 // Hex color
  }
}

interface Role {
  id: 'PATIENT' | 'STAFF'
  authRequired: boolean
  routePrefix?: string            // e.g., "/staff"
}

interface Page {
  id: string                      // Unique page ID
  route: string                   // Route path (e.g., "/", "/staff/inbox")
  role: 'PATIENT' | 'STAFF'
  type: 'welcome' | 'form' | 'review' | 'success' | 'login' | 'list' | 'detail'
  title: string
  description?: string
  fields?: Field[]                // For form/welcome pages
  actions?: Action[]              // For detail/review pages
}

interface Field {
  id: string
  type: 'text' | 'email' | 'tel' | 'date' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'number'
  label: string
  placeholder?: string
  required?: boolean
  options?: Option[]              // For select/radio
  condition?: Condition           // Conditional visibility
  validation?: ValidationRule[]
}

interface Option {
  value: string
  label: string
}

interface Condition {
  field: string                   // Field ID to check
  operator: 'equals' | 'not_equals' | 'exists'
  value?: string | boolean
}

interface ValidationRule {
  type: 'minLength' | 'maxLength' | 'pattern' | 'min' | 'max'
  value: string | number
  message: string
}

interface Action {
  id: string
  label: string                   // Button label
  targetState: WorkflowState
  requiresNote?: boolean
  variant: 'primary' | 'secondary' | 'danger'
}

type WorkflowState = 'DRAFT' | 'SUBMITTED' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED'

interface WorkflowConfig {
  states: WorkflowState[]
  initialState: WorkflowState     // Usually 'DRAFT'
  transitions: Transition[]
}

interface Transition {
  from: WorkflowState | WorkflowState[]
  to: WorkflowState
  allowedRoles: ('PATIENT' | 'STAFF')[]
}

interface ApiConfig {
  baseUrl: '{{FASTFORM_API_URL}}'  // Must be this exact value
  endpoints: {
    // Patient endpoints
    createSubmission: string      // e.g., "/api/apps/{{APP_ID_UUID}}/submissions"
    getSubmission: string         // e.g., "/api/apps/{{APP_ID_UUID}}/submissions/[id]"
    resubmitSubmission: string    // e.g., "/api/apps/{{APP_ID_UUID}}/submissions/[id]/resubmit"

    // Staff auth endpoints
    staffLogin: string            // e.g., "/api/apps/{{APP_ID_UUID}}/staff/login"
    staffLogout: string           // e.g., "/api/apps/{{APP_ID_UUID}}/staff/logout"
    staffSession: string          // e.g., "/api/apps/{{APP_ID_UUID}}/staff/session"

    // Staff endpoints
    listSubmissions: string       // e.g., "/api/apps/{{APP_ID_UUID}}/staff/submissions"
    getSubmissionDetail: string   // e.g., "/api/apps/{{APP_ID_UUID}}/staff/submissions/[id]"
    transitionSubmission: string  // e.g., "/api/apps/{{APP_ID_UUID}}/staff/submissions/[id]/transition"

    // Analytics
    trackEvent: string            // e.g., "/api/apps/{{APP_ID_UUID}}/analytics/events"
  }
}

interface AnalyticsConfig {
  events: AnalyticsEvent[]
}

interface AnalyticsEvent {
  name: string
  trigger: 'pageview' | 'action' | 'submit' | 'transition'
  page?: string                   // For pageview triggers
}

interface EnvironmentConfig {
  staging: {
    domain: string                // e.g., "{{APP_SLUG}}.staging.fastform.app"
    apiUrl: string                // e.g., "https://api.staging.fastform.app"
  }
  production: {
    domain: string                // e.g., "{{APP_SLUG}}.fastform.app"
    apiUrl: string                // e.g., "https://api.fastform.app"
  }
}

GENERATION GUIDELINES:

1. TYPICAL PAGE FLOW FOR PATIENT INTAKE:
   - Welcome page (type: 'welcome') with consent checkbox
   - Form page(s) (type: 'form') for data collection
   - Review page (type: 'review') to confirm before submit
   - Success page (type: 'success') after submission

2. TYPICAL PAGE FLOW FOR STAFF:
   - Login page (type: 'login') for authentication
   - List page (type: 'list') showing submissions inbox
   - Detail page (type: 'detail') for reviewing individual submissions with actions

3. WORKFLOW STATES:
   - Start with DRAFT (client-only, not persisted)
   - SUBMITTED (after patient submits)
   - NEEDS_INFO (staff requests more info)
   - APPROVED or REJECTED (final states)

4. PLACEHOLDERS:
   - Use {{APP_ID_UUID}} for app IDs
   - Use {{ORG_ID_UUID}} for organization IDs
   - Use {{APP_SLUG}} for app slugs in URLs
   - Use {{FASTFORM_API_URL}} for API base URL

5. API ENDPOINTS:
   - All endpoints should include the app ID in the path
   - Use [id] for dynamic segments (e.g., submissions/[id])

Remember: Return ONLY the JSON object, no markdown, no explanation, no code blocks.`
}

/**
 * Builds the user prompt from intent and conversation history.
 *
 * @param userIntent - Primary user requirement/intent
 * @param conversationHistory - Previous messages for context
 * @returns Formatted user prompt
 */
function buildUserPrompt(
  userIntent: string,
  conversationHistory: Message[]
): string {
  let prompt = ''

  // Include conversation history if available
  if (conversationHistory.length > 0) {
    prompt += 'CONVERSATION HISTORY:\n\n'
    for (const msg of conversationHistory) {
      prompt += `${msg.role.toUpperCase()}: ${msg.content}\n\n`
    }
    prompt += '---\n\n'
  }

  // Add current intent
  prompt += 'CURRENT REQUEST:\n\n'
  prompt += userIntent
  prompt += '\n\n---\n\n'
  prompt += 'Generate the complete FastformAppSpec v0.3 JSON now:'

  return prompt
}

/**
 * Attempts to generate AppSpec using a specific provider.
 *
 * @param provider - Provider configuration to use
 * @param systemPrompt - System prompt with schema
 * @param userPrompt - User prompt with intent and history
 * @returns Generated AppSpec
 * @throws {AppSpecGenerationError} If generation or validation fails
 */
async function tryGenerateWithProvider(
  provider: ProviderConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<FastformAppSpec> {
  try {
    // Generate text with structured output preference
    const { text } = await generateText({
      model: provider.model(provider.modelId),
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
      maxTokens: 4000,
    })

    // Parse JSON response
    let parsed: unknown
    try {
      // Clean potential markdown code blocks
      const cleanedText = text.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/, '')
        .replace(/```\s*$/, '')
        .trim()

      parsed = JSON.parse(cleanedText)
    } catch (parseError) {
      throw new AppSpecGenerationError(
        `Failed to parse JSON response from ${provider.name}`,
        provider.name,
        parseError
      )
    }

    // Validate against schema
    if (!isValidAppSpec(parsed)) {
      throw new AppSpecGenerationError(
        `Generated JSON does not match FastformAppSpec v0.3 schema`,
        provider.name
      )
    }

    return parsed
  } catch (error) {
    if (error instanceof AppSpecGenerationError) {
      throw error
    }
    throw new AppSpecGenerationError(
      `Failed to generate AppSpec with ${provider.name}: ${error instanceof Error ? error.message : String(error)}`,
      provider.name,
      error
    )
  }
}

/**
 * Generates a FastformAppSpec from user intent with conversation context.
 * Implements cascading fallback: Azure OpenAI → OpenAI → Anthropic.
 *
 * The function will try each configured provider in order until one succeeds.
 * The generated AppSpec is validated against the v0.3 schema before returning.
 *
 * @param userIntent - User's description of the desired application
 * @param conversationHistory - Previous conversation messages for context (optional)
 * @returns Promise resolving to valid FastformAppSpec
 * @throws {NoProvidersConfiguredError} If no LLM providers are configured
 * @throws {AppSpecGenerationError} If all providers fail
 *
 * @example
 * ```typescript
 * const spec = await generateAppSpec(
 *   "Create a patient intake form for collecting medical history",
 *   []
 * )
 * console.log(spec.meta.name)
 * ```
 *
 * @example
 * ```typescript
 * const spec = await generateAppSpec(
 *   "Add a field for emergency contact",
 *   [
 *     { role: 'user', content: 'Create a patient intake form' },
 *     { role: 'assistant', content: '...' }
 *   ]
 * )
 * ```
 */
export async function generateAppSpec(
  userIntent: string,
  conversationHistory: Message[] = []
): Promise<FastformAppSpec> {
  // Validate input
  if (!userIntent || userIntent.trim().length === 0) {
    throw new AppSpecGenerationError(
      'User intent cannot be empty',
      'validation'
    )
  }

  // Get configured providers
  const providers = getConfiguredProviders()

  // Build prompts
  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(userIntent, conversationHistory)

  // Try each provider in order
  const errors: AppSpecGenerationError[] = []

  for (const provider of providers) {
    try {
      logger.log(`Attempting to generate AppSpec with ${provider.name}...`)
      const spec = await tryGenerateWithProvider(
        provider,
        systemPrompt,
        userPrompt
      )
      logger.log(`Successfully generated AppSpec with ${provider.name}`)
      return spec
    } catch (error) {
      logger.warn(
        `Failed to generate with ${provider.name}:`,
        error instanceof Error ? error.message : String(error)
      )
      errors.push(
        error instanceof AppSpecGenerationError
          ? error
          : new AppSpecGenerationError(
              `Unexpected error with ${provider.name}`,
              provider.name,
              error
            )
      )
    }
  }

  // All providers failed
  const errorDetails = errors
    .map((e) => `${e.provider}: ${e.message}`)
    .join('; ')

  throw new AppSpecGenerationError(
    `Failed to generate AppSpec with all configured providers. Errors: ${errorDetails}`,
    'all-providers',
    errors
  )
}

/**
 * Validates an existing AppSpec object.
 * Utility function for testing or re-validation.
 *
 * @param spec - Object to validate
 * @returns True if valid, false otherwise
 */
export function validateAppSpec(spec: unknown): spec is FastformAppSpec {
  return isValidAppSpec(spec)
}
