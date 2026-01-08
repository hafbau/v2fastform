/**
 * Submission Validation Service
 *
 * Provides comprehensive validation for form submissions against AppSpec schema.
 * Validates field types, formats, required fields, and workflow transitions.
 *
 * @module submissions/validation
 */

import type { FastformAppSpec, Field, WorkflowState } from '../types/appspec'

/**
 * Result of validation operation.
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean
  /** Array of validation errors (empty if valid) */
  errors: ValidationError[]
}

/**
 * Detailed validation error.
 */
export interface ValidationError {
  /** Field identifier or path */
  field: string
  /** Human-readable error message */
  message: string
  /** Machine-readable error code */
  code: 'REQUIRED' | 'INVALID_FORMAT' | 'INVALID_OPTION' | 'INVALID_TRANSITION'
}

/**
 * Form submission data structure.
 */
export interface SubmissionData {
  [key: string]: unknown
}

/**
 * Submission record from database.
 */
export interface Submission {
  id: string
  appId: string
  data: Record<string, unknown>
  status: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Validates submission data against AppSpec field definitions.
 *
 * Performs comprehensive validation including:
 * - Required field presence
 * - Field type validation
 * - Format validation (email, phone, date)
 * - Option validation (select, radio, checkbox)
 * - Custom validation rules from AppSpec
 *
 * @param submission - The submission data to validate
 * @param appSpec - The AppSpec defining field requirements
 * @returns ValidationResult with detailed errors
 *
 * @example
 * ```typescript
 * const result = validateSubmission(
 *   { email: 'test@example.com', age: 25 },
 *   appSpec
 * )
 * if (!result.valid) {
 *   console.error(result.errors)
 * }
 * ```
 */
export function validateSubmission(
  submission: SubmissionData,
  appSpec: FastformAppSpec
): ValidationResult {
  const errors: ValidationError[] = []

  // Collect all fields from form pages
  const allFields: Field[] = []
  for (const page of appSpec.pages) {
    if (page.fields && (page.type === 'form' || page.type === 'welcome')) {
      allFields.push(...page.fields)
    }
  }

  // Validate each field
  for (const field of allFields) {
    const value = submission[field.id]

    // Check if field should be validated based on conditions
    if (field.condition && !evaluateCondition(field.condition, submission)) {
      // Field is conditionally hidden, skip validation
      continue
    }

    // Required field validation
    if (field.required && isEmpty(value)) {
      errors.push({
        field: field.id,
        message: `${field.label} is required`,
        code: 'REQUIRED',
      })
      continue // Skip further validation if field is empty
    }

    // Skip type validation if field is empty and not required
    if (isEmpty(value)) {
      continue
    }

    // Type-specific validation
    switch (field.type) {
      case 'email':
        if (!validateEmail(value)) {
          errors.push({
            field: field.id,
            message: `${field.label} must be a valid email address`,
            code: 'INVALID_FORMAT',
          })
        }
        break

      case 'tel':
        if (!validatePhone(value)) {
          errors.push({
            field: field.id,
            message: `${field.label} must be a valid phone number`,
            code: 'INVALID_FORMAT',
          })
        }
        break

      case 'date':
        if (!validateDate(value)) {
          errors.push({
            field: field.id,
            message: `${field.label} must be a valid date (YYYY-MM-DD)`,
            code: 'INVALID_FORMAT',
          })
        }
        break

      case 'number':
        if (!validateNumber(value)) {
          errors.push({
            field: field.id,
            message: `${field.label} must be a valid number`,
            code: 'INVALID_FORMAT',
          })
        }
        break

      case 'select':
      case 'radio':
        if (field.options && !validateSelectOption(value, field.options)) {
          errors.push({
            field: field.id,
            message: `${field.label} must be one of the provided options`,
            code: 'INVALID_OPTION',
          })
        }
        break

      case 'checkbox':
        if (!validateBoolean(value)) {
          errors.push({
            field: field.id,
            message: `${field.label} must be a boolean value`,
            code: 'INVALID_FORMAT',
          })
        }
        break

      case 'text':
      case 'textarea':
        if (!validateText(value)) {
          errors.push({
            field: field.id,
            message: `${field.label} must be a text value`,
            code: 'INVALID_FORMAT',
          })
        }
        break
    }

    // Custom validation rules
    if (field.validation && !isEmpty(value)) {
      for (const rule of field.validation) {
        const ruleError = validateRule(value, rule, field.label)
        if (ruleError) {
          errors.push({
            field: field.id,
            message: ruleError,
            code: 'INVALID_FORMAT',
          })
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validates workflow state transition.
 *
 * Checks if the requested state transition is:
 * - Allowed by the workflow configuration
 * - Permitted for the user's role
 * - Valid from the current submission status
 *
 * @param submission - The submission being transitioned
 * @param newStatus - The target workflow state
 * @param appSpec - The AppSpec defining workflow rules
 * @param userRole - The role of the user requesting transition (PATIENT or STAFF)
 * @returns ValidationResult indicating if transition is valid
 *
 * @example
 * ```typescript
 * const result = validateTransition(
 *   submission,
 *   'APPROVED',
 *   appSpec,
 *   'STAFF'
 * )
 * if (!result.valid) {
 *   throw new Error('Transition not allowed')
 * }
 * ```
 */
export function validateTransition(
  submission: Submission,
  newStatus: string,
  appSpec: FastformAppSpec,
  userRole: 'PATIENT' | 'STAFF'
): ValidationResult {
  const errors: ValidationError[] = []

  // Check if target state exists in workflow
  if (!appSpec.workflow.states.includes(newStatus as WorkflowState)) {
    errors.push({
      field: 'status',
      message: `Invalid target state: ${newStatus}`,
      code: 'INVALID_TRANSITION',
    })
    return { valid: false, errors }
  }

  const currentStatus = submission.status as WorkflowState

  // Find matching transition rule
  const allowedTransition = appSpec.workflow.transitions.find((transition) => {
    // Check if from state matches
    const fromMatches = Array.isArray(transition.from)
      ? transition.from.includes(currentStatus)
      : transition.from === currentStatus

    // Check if to state matches
    const toMatches = transition.to === newStatus

    // Check if role is allowed
    const roleAllowed = transition.allowedRoles.includes(userRole)

    return fromMatches && toMatches && roleAllowed
  })

  if (!allowedTransition) {
    errors.push({
      field: 'status',
      message: `Transition from ${currentStatus} to ${newStatus} is not allowed for role ${userRole}`,
      code: 'INVALID_TRANSITION',
    })
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Sanitizes submission data to prevent XSS attacks and normalize input.
 *
 * Performs the following operations:
 * - Trims whitespace from string values
 * - Removes HTML tags from text fields
 * - Recursively sanitizes nested objects
 * - Preserves arrays and sanitizes their elements
 *
 * @param data - The raw submission data to sanitize
 * @returns Sanitized data safe for storage and display
 *
 * @example
 * ```typescript
 * const clean = sanitizeSubmissionData({
 *   name: '  John <script>alert("xss")</script>  ',
 *   age: 25
 * })
 * // Returns: { name: 'John alert("xss")', age: 25 }
 * ```
 */
export function sanitizeSubmissionData(
  data: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      sanitized[key] = value
      continue
    }

    if (typeof value === 'string') {
      // Trim whitespace and remove HTML tags
      sanitized[key] = sanitizeString(value)
    } else if (Array.isArray(value)) {
      // Recursively sanitize array elements
      sanitized[key] = value.map((item) =>
        typeof item === 'string'
          ? sanitizeString(item)
          : typeof item === 'object' && item !== null
            ? sanitizeSubmissionData(item as Record<string, unknown>)
            : item
      )
    } else if (typeof value === 'object') {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeSubmissionData(
        value as Record<string, unknown>
      )
    } else {
      // Preserve primitives (number, boolean)
      sanitized[key] = value
    }
  }

  return sanitized
}

// ============================================================================
// Private Helper Functions
// ============================================================================

/**
 * Checks if a value is empty (null, undefined, empty string, empty array).
 */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true
  }

  if (typeof value === 'string') {
    return value.trim() === ''
  }

  if (Array.isArray(value)) {
    return value.length === 0
  }

  return false
}

/**
 * Evaluates a conditional visibility rule.
 */
function evaluateCondition(
  condition: { field: string; operator: string; value?: unknown },
  data: SubmissionData
): boolean {
  const fieldValue = data[condition.field]

  switch (condition.operator) {
    case 'equals':
      return fieldValue === condition.value
    case 'not_equals':
      return fieldValue !== condition.value
    case 'exists':
      return !isEmpty(fieldValue)
    default:
      return true
  }
}

/**
 * Validates email format using RFC 5322 compliant regex.
 */
function validateEmail(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false
  }

  // Comprehensive email regex that handles most valid email formats
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

  return emailRegex.test(value)
}

/**
 * Validates phone number format.
 * Accepts: +1234567890, (123) 456-7890, 123-456-7890, 1234567890
 */
function validatePhone(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false
  }

  // Remove all non-digit characters for validation
  const digitsOnly = value.replace(/\D/g, '')

  // Phone number should have 10-15 digits (international format)
  return digitsOnly.length >= 10 && digitsOnly.length <= 15
}

/**
 * Validates date format (YYYY-MM-DD or ISO 8601).
 */
function validateDate(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false
  }

  // Check YYYY-MM-DD format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(value)) {
    return false
  }

  // Verify it's a valid date
  const date = new Date(value)
  return !isNaN(date.getTime())
}

/**
 * Validates number format.
 */
function validateNumber(value: unknown): boolean {
  if (typeof value === 'number') {
    return !isNaN(value) && isFinite(value)
  }

  if (typeof value === 'string') {
    const num = parseFloat(value)
    return !isNaN(num) && isFinite(num)
  }

  return false
}

/**
 * Validates boolean format.
 */
function validateBoolean(value: unknown): boolean {
  return typeof value === 'boolean'
}

/**
 * Validates text format.
 */
function validateText(value: unknown): boolean {
  return typeof value === 'string'
}

/**
 * Validates that a value is one of the allowed options.
 */
function validateSelectOption(
  value: unknown,
  options: Array<{ value: string; label: string }>
): boolean {
  if (typeof value !== 'string') {
    return false
  }

  return options.some((option) => option.value === value)
}

/**
 * Validates a value against a custom validation rule.
 * Returns error message if validation fails, null if passes.
 */
function validateRule(
  value: unknown,
  rule: { type: string; value: string | number; message: string },
  fieldLabel: string
): string | null {
  switch (rule.type) {
    case 'minLength':
      if (typeof value === 'string' && value.length < Number(rule.value)) {
        return rule.message
      }
      break

    case 'maxLength':
      if (typeof value === 'string' && value.length > Number(rule.value)) {
        return rule.message
      }
      break

    case 'pattern':
      if (typeof value === 'string') {
        try {
          const regex = new RegExp(String(rule.value))
          if (!regex.test(value)) {
            return rule.message
          }
        } catch {
          // Invalid regex pattern in AppSpec
          return `Invalid pattern validation for ${fieldLabel}`
        }
      }
      break

    case 'min':
      if (typeof value === 'number' && value < Number(rule.value)) {
        return rule.message
      }
      if (typeof value === 'string') {
        const num = parseFloat(value)
        if (!isNaN(num) && num < Number(rule.value)) {
          return rule.message
        }
      }
      break

    case 'max':
      if (typeof value === 'number' && value > Number(rule.value)) {
        return rule.message
      }
      if (typeof value === 'string') {
        const num = parseFloat(value)
        if (!isNaN(num) && num > Number(rule.value)) {
          return rule.message
        }
      }
      break
  }

  return null
}

/**
 * Sanitizes a string by trimming whitespace and removing HTML tags.
 */
function sanitizeString(str: string): string {
  // Trim whitespace
  let sanitized = str.trim()

  // Decode common HTML entities first
  // This converts &lt;div&gt; to <div> so it can be properly removed
  sanitized = sanitized
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')

  // Remove HTML tags after decoding
  // Converts <script>alert("xss")</script> to alert("xss")
  sanitized = sanitized.replace(/<[^>]*>/g, '')

  return sanitized
}
