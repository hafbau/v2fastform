/**
 * AppSpec to Prompt Compiler Service
 *
 * This module provides deterministic compilation of FastformAppSpec JSON
 * into natural language prompts suitable for v0 code generation.
 *
 * Key Properties:
 * - DETERMINISTIC: Same input AppSpec always produces identical output
 * - NO timestamps, randomness, or environment-dependent values
 * - Validates AppSpec against v1 supported features before compilation
 * - Generates comprehensive prompts for complete Next.js app generation
 *
 * @module appspec-to-prompt
 */

import type {
  FastformAppSpec,
  Page,
  Field,
  WorkflowState,
  PageType,
  FieldType,
} from '@/lib/types/appspec'

/**
 * Custom error thrown when AppSpec contains features not supported in v1.
 * Provides helpful guidance on what alternatives to use.
 */
export class UnsupportedAppSpecFeatureError extends Error {
  constructor(
    message: string,
    public readonly feature: string,
    public readonly suggestion?: string
  ) {
    super(message)
    this.name = 'UnsupportedAppSpecFeatureError'

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UnsupportedAppSpecFeatureError)
    }
  }
}

/**
 * Supported page types in v1.
 * These are the only page types that can be generated.
 */
const SUPPORTED_PAGE_TYPES: readonly PageType[] = [
  'welcome',
  'form',
  'review',
  'success',
  'login',
  'list',
  'detail',
] as const

/**
 * Supported field types in v1.
 * These are the only form input types that can be generated.
 */
const SUPPORTED_FIELD_TYPES: readonly FieldType[] = [
  'text',
  'email',
  'tel',
  'date',
  'textarea',
  'select',
  'radio',
  'checkbox',
  'number',
] as const

/**
 * Supported workflow states in v1.
 * Simple linear workflow without complex multi-step approvals.
 */
const SUPPORTED_WORKFLOW_STATES: readonly WorkflowState[] = [
  'DRAFT',
  'SUBMITTED',
  'NEEDS_INFO',
  'APPROVED',
  'REJECTED',
] as const

/**
 * Validates that the AppSpec only uses features supported in v1.
 * Throws UnsupportedAppSpecFeatureError if unsupported features are detected.
 *
 * @param spec - The FastformAppSpec to validate
 * @throws {UnsupportedAppSpecFeatureError} When unsupported features are found
 *
 * @example
 * ```typescript
 * try {
 *   validateAppSpecSupport(spec)
 * } catch (error) {
 *   if (error instanceof UnsupportedAppSpecFeatureError) {
 *     console.error(`Feature not supported: ${error.feature}`)
 *     if (error.suggestion) {
 *       console.log(`Try: ${error.suggestion}`)
 *     }
 *   }
 * }
 * ```
 */
function validateAppSpecSupport(spec: FastformAppSpec): void {
  // Validate page types
  for (const page of spec.pages) {
    if (!SUPPORTED_PAGE_TYPES.includes(page.type)) {
      throw new UnsupportedAppSpecFeatureError(
        `Page type "${page.type}" is not supported in v1. Supported types: ${SUPPORTED_PAGE_TYPES.join(', ')}`,
        `page.type.${page.type}`,
        `Use one of: ${SUPPORTED_PAGE_TYPES.join(', ')}`
      )
    }
  }

  // Validate field types
  for (const page of spec.pages) {
    if (page.fields) {
      for (const field of page.fields) {
        if (!SUPPORTED_FIELD_TYPES.includes(field.type)) {
          throw new UnsupportedAppSpecFeatureError(
            `Field type "${field.type}" is not supported in v1. Supported types: ${SUPPORTED_FIELD_TYPES.join(', ')}`,
            `field.type.${field.type}`,
            `Use one of: ${SUPPORTED_FIELD_TYPES.join(', ')}`
          )
        }
      }
    }
  }

  // Validate workflow states
  for (const state of spec.workflow.states) {
    if (!SUPPORTED_WORKFLOW_STATES.includes(state)) {
      throw new UnsupportedAppSpecFeatureError(
        `Workflow state "${state}" is not supported in v1. Supported states: ${SUPPORTED_WORKFLOW_STATES.join(', ')}`,
        `workflow.state.${state}`,
        `Use simple workflow with states: ${SUPPORTED_WORKFLOW_STATES.join(', ')}`
      )
    }
  }

  // Validate workflow complexity (simple linear workflow only)
  // Check for overly complex transition rules
  const transitionCount = spec.workflow.transitions.length
  const stateCount = spec.workflow.states.length

  // Heuristic: if transitions greatly exceed states, workflow might be too complex
  // Simple workflow should have roughly linear transitions (e.g., 5 states, ~8-10 transitions)
  if (transitionCount > stateCount * 3) {
    throw new UnsupportedAppSpecFeatureError(
      `Workflow has ${transitionCount} transitions for ${stateCount} states, which may be too complex for v1. ` +
        `v1 supports simple linear workflows with basic branching.`,
      'workflow.complexity',
      'Simplify workflow to use fewer state transitions and avoid multi-step approval chains'
    )
  }
}

/**
 * Compiles a Field definition into a natural language description.
 * Includes field type, label, validation rules, and options.
 *
 * @param field - The field to compile
 * @returns Natural language description of the field
 */
function compileField(field: Field): string {
  const parts: string[] = []

  // Field identifier and type
  parts.push(`"${field.id}" (${field.type})`)

  // Label
  parts.push(`with label "${field.label}"`)

  // Required
  if (field.required) {
    parts.push('marked as required')
  }

  // Placeholder
  if (field.placeholder) {
    parts.push(`with placeholder "${field.placeholder}"`)
  }

  // Options for select/radio
  if (field.options && field.options.length > 0) {
    const optionList = field.options
      .map((opt) => `${opt.label} (${opt.value})`)
      .join(', ')
    parts.push(`with options: ${optionList}`)
  }

  // Validation rules
  if (field.validation && field.validation.length > 0) {
    const validationList = field.validation
      .map((rule) => {
        switch (rule.type) {
          case 'minLength':
            return `minimum ${rule.value} characters`
          case 'maxLength':
            return `maximum ${rule.value} characters`
          case 'min':
            return `minimum value ${rule.value}`
          case 'max':
            return `maximum value ${rule.value}`
          case 'pattern':
            return `pattern ${rule.value}`
          default:
            return `${rule.type}: ${rule.value}`
        }
      })
      .join(', ')
    parts.push(`with validation: ${validationList}`)
  }

  // Conditional visibility
  if (field.condition) {
    const conditionDesc = `shown when field "${field.condition.field}" ${field.condition.operator} ${field.condition.value ?? '(exists)'}`
    parts.push(`(${conditionDesc})`)
  }

  return parts.join(' ')
}

/**
 * Compiles a Page definition into a natural language description.
 * Includes page type, route, fields, and actions.
 *
 * @param page - The page to compile
 * @returns Natural language description of the page
 */
function compilePage(page: Page): string {
  const lines: string[] = []

  // Page header
  lines.push(
    `- ${page.type.toUpperCase()} page at route "${page.route}" (role: ${page.role})`
  )
  lines.push(`  Title: "${page.title}"`)

  if (page.description) {
    lines.push(`  Description: "${page.description}"`)
  }

  // Fields
  if (page.fields && page.fields.length > 0) {
    lines.push('  Fields:')
    for (const field of page.fields) {
      lines.push(`    - ${compileField(field)}`)
    }
  }

  // Actions
  if (page.actions && page.actions.length > 0) {
    lines.push('  Actions:')
    for (const action of page.actions) {
      const noteReq = action.requiresNote ? ' (requires note)' : ''
      lines.push(
        `    - "${action.label}" (${action.variant}) → transitions to ${action.targetState}${noteReq}`
      )
    }
  }

  return lines.join('\n')
}

/**
 * Compiles workflow configuration into a natural language description.
 * Includes states, initial state, and valid transitions.
 *
 * @param spec - The FastformAppSpec containing workflow config
 * @returns Natural language description of the workflow
 */
function compileWorkflow(spec: FastformAppSpec): string {
  const lines: string[] = []

  lines.push('Workflow Configuration:')
  lines.push(`- Initial state: ${spec.workflow.initialState}`)
  lines.push(
    `- Valid states: ${spec.workflow.states.map((s) => s).join(', ')}`
  )

  lines.push('- State transitions:')
  for (const transition of spec.workflow.transitions) {
    const fromStates = Array.isArray(transition.from)
      ? transition.from.join(' or ')
      : transition.from
    const roles = transition.allowedRoles.join(', ')
    lines.push(
      `  - From ${fromStates} → ${transition.to} (allowed roles: ${roles})`
    )
  }

  return lines.join('\n')
}

/**
 * Compiles API configuration into instructions.
 * Specifies how to read API base URL from environment variables.
 *
 * @param spec - The FastformAppSpec containing API config
 * @returns Natural language description of API configuration
 */
function compileApiConfig(spec: FastformAppSpec): string {
  const lines: string[] = []

  lines.push('API Configuration:')
  lines.push(
    '- Base URL MUST be read from environment variable: process.env.NEXT_PUBLIC_FASTFORM_API_URL'
  )
  lines.push('- Never hardcode the API URL in the generated code')
  lines.push('- Available endpoints:')

  // Sort endpoints alphabetically for deterministic output
  const endpoints = Object.entries(spec.api.endpoints).sort(([a], [b]) =>
    a.localeCompare(b)
  )

  for (const [name, path] of endpoints) {
    lines.push(`  - ${name}: ${path}`)
  }

  return lines.join('\n')
}

/**
 * Compiles theme configuration into visual design instructions.
 *
 * @param spec - The FastformAppSpec containing theme config
 * @returns Natural language description of theme
 */
function compileTheme(spec: FastformAppSpec): string {
  const lines: string[] = []

  lines.push(`Use theme preset: ${spec.theme.preset}`)

  if (spec.theme.logo) {
    lines.push(`Logo URL: ${spec.theme.logo}`)
  }

  if (spec.theme.colors) {
    lines.push('Custom color overrides:')
    if (spec.theme.colors.primary) {
      lines.push(`  - Primary: ${spec.theme.colors.primary}`)
    }
    if (spec.theme.colors.background) {
      lines.push(`  - Background: ${spec.theme.colors.background}`)
    }
    if (spec.theme.colors.text) {
      lines.push(`  - Text: ${spec.theme.colors.text}`)
    }
  }

  return lines.join('\n')
}

/**
 * Compiles role configuration into authentication requirements.
 *
 * @param spec - The FastformAppSpec containing roles
 * @returns Natural language description of roles
 */
function compileRoles(spec: FastformAppSpec): string {
  const lines: string[] = []

  lines.push('User Roles:')
  for (const role of spec.roles) {
    const authReq = role.authRequired ? 'requires authentication' : 'no auth'
    const prefix = role.routePrefix ? `, route prefix: ${role.routePrefix}` : ''
    lines.push(`  - ${role.id}: ${authReq}${prefix}`)
  }

  return lines.join('\n')
}

/**
 * Generates the prompt footer with critical implementation constraints.
 *
 * @returns Footer section with constraints and post-processing instructions
 */
function generatePromptFooter(): string {
  return `
CRITICAL IMPLEMENTATION CONSTRAINTS:

1. NO EXTERNAL UI LIBRARIES
   - Do not use shadcn/ui, Material-UI, Chakra UI, or any external component library
   - Build all UI components from scratch using native HTML elements and Tailwind CSS
   - Create custom form inputs, buttons, cards, and layout components

2. NO FORM LIBRARIES
   - Do not use React Hook Form, Formik, or any form management library
   - Implement form state management using React useState and native form events
   - Build custom validation logic for all form fields

3. SERVER ACTIONS ONLY FOR MUTATIONS
   - All data mutations (create, update, state transitions) MUST use Next.js Server Actions
   - No client-side API calls for POST, PUT, PATCH, DELETE operations
   - Server Actions should be defined in separate files (e.g., app/actions/submission.ts)
   - Use revalidatePath() after mutations to refresh data

4. DATABASE COLUMN NAMING: CAMELCASE
   - ALL PostgreSQL columns MUST use camelCase naming convention
   - Examples: userId, createdAt, submissionData, workflowState
   - Do NOT use snake_case (user_id, created_at) in database schema
   - This is critical for backend compatibility

5. MULTI-TENANCY
   - All database queries MUST filter by organizationId
   - Include orgId in all submission records
   - Ensure proper isolation between organizations

6. TYPE SAFETY
   - Use TypeScript for all code
   - Define proper types for form data, API responses, and database models
   - No 'any' types unless absolutely necessary

7. ERROR HANDLING
   - Implement comprehensive error handling in Server Actions
   - Show user-friendly error messages in the UI
   - Log errors appropriately for debugging

8. AUTHENTICATION
   - Implement staff authentication using the staffLogin, staffLogout, and staffSession endpoints
   - Use Next.js middleware for route protection where specified
   - Store auth state appropriately (cookies or session)

9. RESPONSIVE DESIGN
   - All pages must be fully responsive (mobile, tablet, desktop)
   - Use Tailwind CSS breakpoints (sm, md, lg, xl)
   - Test layouts on different screen sizes

10. ACCESSIBILITY
    - Use semantic HTML elements
    - Include proper ARIA labels where needed
    - Ensure keyboard navigation works correctly
    - Maintain sufficient color contrast ratios

POST-GENERATION CHECKLIST:
- Verify all API calls use environment variable for base URL
- Confirm all database columns use camelCase
- Check that no external UI/form libraries are imported
- Ensure all mutations use Server Actions
- Validate multi-tenant orgId filtering in all queries
- Test responsive layouts on multiple screen sizes
- Review TypeScript types for completeness
`.trim()
}

/**
 * Compiles a FastformAppSpec into a comprehensive natural language prompt
 * suitable for v0 code generation.
 *
 * This function is DETERMINISTIC: the same input AppSpec will always produce
 * the exact same output prompt. No timestamps, randomness, or environment-dependent
 * values are included in the output.
 *
 * @param spec - The FastformAppSpec to compile
 * @returns A complete natural language prompt for v0
 * @throws {UnsupportedAppSpecFeatureError} When spec contains unsupported features
 *
 * @example
 * ```typescript
 * const spec: FastformAppSpec = { ... }
 * try {
 *   const prompt = compileAppSpecToPrompt(spec)
 *   console.log(prompt)
 *   // Send prompt to v0 for code generation
 * } catch (error) {
 *   if (error instanceof UnsupportedAppSpecFeatureError) {
 *     console.error(`Cannot generate app: ${error.message}`)
 *   }
 * }
 * ```
 */
export function compileAppSpecToPrompt(spec: FastformAppSpec): string {
  // Validate before compilation
  validateAppSpecSupport(spec)

  const sections: string[] = []

  // Header
  sections.push(
    `Build a Next.js healthcare application named "${spec.meta.name}".`
  )
  sections.push('')
  sections.push(`Description: ${spec.meta.description}`)
  sections.push(`Organization: ${spec.meta.orgSlug} (ID: ${spec.meta.orgId})`)
  sections.push(`App Slug: ${spec.meta.slug}`)
  sections.push(`App ID: ${spec.id}`)
  sections.push('')

  // Roles
  sections.push(compileRoles(spec))
  sections.push('')

  // Theme
  sections.push(compileTheme(spec))
  sections.push('')

  // Pages
  sections.push('Application Pages:')
  sections.push('')
  for (const page of spec.pages) {
    sections.push(compilePage(page))
    sections.push('')
  }

  // Workflow
  sections.push(compileWorkflow(spec))
  sections.push('')

  // API
  sections.push(compileApiConfig(spec))
  sections.push('')

  // Analytics
  if (spec.analytics.events.length > 0) {
    sections.push('Analytics Events to Track:')
    for (const event of spec.analytics.events) {
      const pageInfo = event.page ? ` on page ${event.page}` : ''
      sections.push(`  - ${event.name} (${event.trigger}${pageInfo})`)
    }
    sections.push('')
  }

  // Environments
  sections.push('Deployment Environments:')
  sections.push(`  - Staging: ${spec.environments.staging.domain}`)
  sections.push(`    API: ${spec.environments.staging.apiUrl}`)
  sections.push(`  - Production: ${spec.environments.production.domain}`)
  sections.push(`    API: ${spec.environments.production.apiUrl}`)
  sections.push('')

  // Footer with constraints
  sections.push(generatePromptFooter())

  return sections.join('\n')
}
