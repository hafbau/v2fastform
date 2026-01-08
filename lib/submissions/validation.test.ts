/**
 * Comprehensive test suite for submission validation service.
 *
 * Tests cover:
 * - All field type validation
 * - Required field validation
 * - Format validation (email, phone, date)
 * - Select option validation
 * - Workflow transition validation
 * - Role-based transition validation
 * - Sanitization of malicious input
 * - Custom validation rules
 * - Conditional field logic
 */

import { describe, it, expect } from 'vitest'
import {
  validateSubmission,
  validateTransition,
  sanitizeSubmissionData,
  type SubmissionData,
  type Submission,
} from './validation'
import type { FastformAppSpec } from '../types/appspec'

// ============================================================================
// Test Fixtures
// ============================================================================

const mockAppSpec: FastformAppSpec = {
  id: 'test-app-id',
  version: '0.3',
  meta: {
    name: 'Test App',
    slug: 'test-app',
    description: 'Test application',
    orgId: 'test-org-id',
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
      fields: [
        {
          id: 'name',
          type: 'text',
          label: 'Full Name',
          required: true,
        },
        {
          id: 'email',
          type: 'email',
          label: 'Email Address',
          required: true,
        },
        {
          id: 'phone',
          type: 'tel',
          label: 'Phone Number',
          required: false,
        },
      ],
    },
    {
      id: 'intake-form',
      route: '/intake',
      role: 'PATIENT',
      type: 'form',
      title: 'Intake Form',
      fields: [
        {
          id: 'birthdate',
          type: 'date',
          label: 'Date of Birth',
          required: true,
        },
        {
          id: 'age',
          type: 'number',
          label: 'Age',
          required: true,
          validation: [
            {
              type: 'min',
              value: 18,
              message: 'Must be 18 or older',
            },
            {
              type: 'max',
              value: 120,
              message: 'Invalid age',
            },
          ],
        },
        {
          id: 'gender',
          type: 'select',
          label: 'Gender',
          required: true,
          options: [
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
            { value: 'other', label: 'Other' },
          ],
        },
        {
          id: 'has_insurance',
          type: 'checkbox',
          label: 'I have insurance',
          required: false,
        },
        {
          id: 'insurance_provider',
          type: 'text',
          label: 'Insurance Provider',
          required: true,
          condition: {
            field: 'has_insurance',
            operator: 'equals',
            value: true,
          },
        },
        {
          id: 'comments',
          type: 'textarea',
          label: 'Additional Comments',
          required: false,
          validation: [
            {
              type: 'maxLength',
              value: 500,
              message: 'Comments must be 500 characters or less',
            },
          ],
        },
        {
          id: 'preferred_contact',
          type: 'radio',
          label: 'Preferred Contact Method',
          required: true,
          options: [
            { value: 'email', label: 'Email' },
            { value: 'phone', label: 'Phone' },
          ],
        },
        {
          id: 'referral_code',
          type: 'text',
          label: 'Referral Code',
          required: false,
          validation: [
            {
              type: 'pattern',
              value: '^[A-Z0-9]{6}$',
              message: 'Referral code must be 6 uppercase letters or numbers',
            },
          ],
        },
      ],
    },
  ],
  workflow: {
    states: ['DRAFT', 'SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'REJECTED'],
    initialState: 'DRAFT',
    transitions: [
      {
        from: 'DRAFT',
        to: 'SUBMITTED',
        allowedRoles: ['PATIENT'],
      },
      {
        from: ['SUBMITTED', 'NEEDS_INFO'],
        to: 'APPROVED',
        allowedRoles: ['STAFF'],
      },
      {
        from: ['SUBMITTED', 'NEEDS_INFO'],
        to: 'REJECTED',
        allowedRoles: ['STAFF'],
      },
      {
        from: 'SUBMITTED',
        to: 'NEEDS_INFO',
        allowedRoles: ['STAFF'],
      },
      {
        from: 'NEEDS_INFO',
        to: 'SUBMITTED',
        allowedRoles: ['PATIENT'],
      },
    ],
  },
  api: {
    baseUrl: '{{FASTFORM_API_URL}}',
    endpoints: {
      createSubmission: '/api/apps/:appId/submissions',
      getSubmission: '/api/apps/:appId/submissions/:id',
      resubmitSubmission: '/api/apps/:appId/submissions/:id/resubmit',
      staffLogin: '/api/apps/:appId/staff/login',
      staffLogout: '/api/apps/:appId/staff/logout',
      staffSession: '/api/apps/:appId/staff/session',
      listSubmissions: '/api/apps/:appId/staff/submissions',
      getSubmissionDetail: '/api/apps/:appId/staff/submissions/:id',
      transitionSubmission: '/api/apps/:appId/staff/submissions/:id/transition',
      trackEvent: '/api/apps/:appId/analytics/track',
    },
  },
  analytics: {
    events: [],
  },
  environments: {
    staging: {
      domain: 'staging.fastform.app',
      apiUrl: 'https://api-staging.fastform.app',
    },
    production: {
      domain: 'fastform.app',
      apiUrl: 'https://api.fastform.app',
    },
  },
}

// ============================================================================
// validateSubmission Tests
// ============================================================================

describe('validateSubmission', () => {
  describe('required field validation', () => {
    it('should pass validation when all required fields are present', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should fail when required text field is missing', () => {
      const submission: SubmissionData = {
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toEqual({
        field: 'name',
        message: 'Full Name is required',
        code: 'REQUIRED',
      })
    })

    it('should fail when required field is null', () => {
      const submission: SubmissionData = {
        name: null,
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0].code).toBe('REQUIRED')
    })

    it('should fail when required field is empty string', () => {
      const submission: SubmissionData = {
        name: '   ',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('name')
      expect(result.errors[0].code).toBe('REQUIRED')
    })

    it('should allow optional fields to be omitted', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
        // phone is optional - omitted
        // has_insurance is optional - omitted
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(true)
    })
  })

  describe('email field validation', () => {
    it('should pass for valid email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@example.co.uk',
        'user+tag@example.com',
        'user_name@example-domain.com',
      ]

      validEmails.forEach((email) => {
        const submission: SubmissionData = {
          name: 'John Doe',
          email,
          birthdate: '1990-01-01',
          age: 33,
          gender: 'male',
          preferred_contact: 'email',
        }

        const result = validateSubmission(submission, mockAppSpec)
        expect(result.valid).toBe(true)
      })
    })

    it('should fail for invalid email format', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'not-an-email',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toEqual({
        field: 'email',
        message: 'Email Address must be a valid email address',
        code: 'INVALID_FORMAT',
      })
    })

    it('should fail for email without domain', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'user@',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0].code).toBe('INVALID_FORMAT')
    })

    it('should fail when email is not a string', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 123,
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0].code).toBe('INVALID_FORMAT')
    })
  })

  describe('phone field validation', () => {
    it('should pass for valid phone numbers', () => {
      const validPhones = [
        '1234567890',
        '(123) 456-7890',
        '123-456-7890',
        '+1-123-456-7890',
        '+44 20 7946 0958',
      ]

      validPhones.forEach((phone) => {
        const submission: SubmissionData = {
          name: 'John Doe',
          email: 'john@example.com',
          phone,
          birthdate: '1990-01-01',
          age: 33,
          gender: 'male',
          preferred_contact: 'email',
        }

        const result = validateSubmission(submission, mockAppSpec)
        expect(result.valid).toBe(true)
      })
    })

    it('should fail for phone numbers with too few digits', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '123',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toEqual({
        field: 'phone',
        message: 'Phone Number must be a valid phone number',
        code: 'INVALID_FORMAT',
      })
    })

    it('should fail when phone is not a string', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        phone: 1234567890,
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0].code).toBe('INVALID_FORMAT')
    })
  })

  describe('date field validation', () => {
    it('should pass for valid date in YYYY-MM-DD format', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-12-25',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(true)
    })

    it('should fail for invalid date format', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '12/25/1990',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toEqual({
        field: 'birthdate',
        message: 'Date of Birth must be a valid date (YYYY-MM-DD)',
        code: 'INVALID_FORMAT',
      })
    })

    it('should fail for invalid date values', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-13-45',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0].code).toBe('INVALID_FORMAT')
    })
  })

  describe('number field validation', () => {
    it('should pass for valid number', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 25,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(true)
    })

    it('should fail when number is not numeric', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 'twenty-five',
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toEqual({
        field: 'age',
        message: 'Age must be a valid number',
        code: 'INVALID_FORMAT',
      })
    })

    it('should fail for NaN', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: NaN,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0].code).toBe('INVALID_FORMAT')
    })

    it('should fail for Infinity', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: Infinity,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0].code).toBe('INVALID_FORMAT')
    })
  })

  describe('select field validation', () => {
    it('should pass for valid select option', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'female',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(true)
    })

    it('should fail for invalid select option', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'invalid-option',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toEqual({
        field: 'gender',
        message: 'Gender must be one of the provided options',
        code: 'INVALID_OPTION',
      })
    })
  })

  describe('radio field validation', () => {
    it('should pass for valid radio option', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'phone',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(true)
    })

    it('should fail for invalid radio option', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'mail',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0].code).toBe('INVALID_OPTION')
    })
  })

  describe('checkbox field validation', () => {
    it('should pass for boolean true', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
        has_insurance: true,
        insurance_provider: 'Blue Cross',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(true)
    })

    it('should pass for boolean false', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
        has_insurance: false,
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(true)
    })

    it('should fail when checkbox is not boolean', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
        has_insurance: 'yes',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toEqual({
        field: 'has_insurance',
        message: 'I have insurance must be a boolean value',
        code: 'INVALID_FORMAT',
      })
    })
  })

  describe('textarea field validation', () => {
    it('should pass for valid textarea text', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
        comments: 'This is a comment',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(true)
    })

    it('should fail when textarea is not text', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
        comments: 123,
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0].code).toBe('INVALID_FORMAT')
    })
  })

  describe('custom validation rules', () => {
    it('should pass min validation rule', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 25,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(true)
    })

    it('should fail min validation rule', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '2010-01-01',
        age: 15,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toEqual({
        field: 'age',
        message: 'Must be 18 or older',
        code: 'INVALID_FORMAT',
      })
    })

    it('should fail max validation rule', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1900-01-01',
        age: 150,
        gender: 'male',
        preferred_contact: 'email',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0].message).toBe('Invalid age')
    })

    it('should pass maxLength validation rule', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
        comments: 'Short comment',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(true)
    })

    it('should fail maxLength validation rule', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
        comments: 'x'.repeat(501),
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toEqual({
        field: 'comments',
        message: 'Comments must be 500 characters or less',
        code: 'INVALID_FORMAT',
      })
    })

    it('should pass pattern validation rule', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
        referral_code: 'ABC123',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(true)
    })

    it('should fail pattern validation rule', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
        referral_code: 'abc123',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toEqual({
        field: 'referral_code',
        message: 'Referral code must be 6 uppercase letters or numbers',
        code: 'INVALID_FORMAT',
      })
    })
  })

  describe('conditional field validation', () => {
    it('should validate conditional field when condition is met', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
        has_insurance: true,
        // insurance_provider missing but required when has_insurance is true
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toEqual({
        field: 'insurance_provider',
        message: 'Insurance Provider is required',
        code: 'REQUIRED',
      })
    })

    it('should skip conditional field when condition is not met', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
        has_insurance: false,
        // insurance_provider omitted - should not be validated
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(true)
    })

    it('should validate conditional field when provided even if condition not met', () => {
      const submission: SubmissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        birthdate: '1990-01-01',
        age: 33,
        gender: 'male',
        preferred_contact: 'email',
        has_insurance: false,
        insurance_provider: 'Blue Cross',
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(true)
    })
  })

  describe('multiple validation errors', () => {
    it('should return all validation errors', () => {
      const submission: SubmissionData = {
        // name missing
        email: 'invalid-email',
        birthdate: 'invalid-date',
        age: 15,
        gender: 'invalid-gender',
        // preferred_contact missing
      }

      const result = validateSubmission(submission, mockAppSpec)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(3)
      expect(result.errors.map((e) => e.field)).toContain('name')
      expect(result.errors.map((e) => e.field)).toContain('email')
      expect(result.errors.map((e) => e.field)).toContain('birthdate')
      expect(result.errors.map((e) => e.field)).toContain('age')
    })
  })
})

// ============================================================================
// validateTransition Tests
// ============================================================================

describe('validateTransition', () => {
  const mockSubmission: Submission = {
    id: 'test-submission-id',
    appId: 'test-app-id',
    data: {},
    status: 'SUBMITTED',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('should allow valid transition from SUBMITTED to APPROVED by STAFF', () => {
    const result = validateTransition(
      mockSubmission,
      'APPROVED',
      mockAppSpec,
      'STAFF'
    )

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should allow valid transition from SUBMITTED to REJECTED by STAFF', () => {
    const result = validateTransition(
      mockSubmission,
      'REJECTED',
      mockAppSpec,
      'STAFF'
    )

    expect(result.valid).toBe(true)
  })

  it('should allow valid transition from SUBMITTED to NEEDS_INFO by STAFF', () => {
    const result = validateTransition(
      mockSubmission,
      'NEEDS_INFO',
      mockAppSpec,
      'STAFF'
    )

    expect(result.valid).toBe(true)
  })

  it('should reject transition from SUBMITTED to APPROVED by PATIENT', () => {
    const result = validateTransition(
      mockSubmission,
      'APPROVED',
      mockAppSpec,
      'PATIENT'
    )

    expect(result.valid).toBe(false)
    expect(result.errors[0]).toEqual({
      field: 'status',
      message: 'Transition from SUBMITTED to APPROVED is not allowed for role PATIENT',
      code: 'INVALID_TRANSITION',
    })
  })

  it('should allow transition from NEEDS_INFO to SUBMITTED by PATIENT', () => {
    const submission = {
      ...mockSubmission,
      status: 'NEEDS_INFO',
    }

    const result = validateTransition(
      submission,
      'SUBMITTED',
      mockAppSpec,
      'PATIENT'
    )

    expect(result.valid).toBe(true)
  })

  it('should reject transition from APPROVED to SUBMITTED', () => {
    const submission = {
      ...mockSubmission,
      status: 'APPROVED',
    }

    const result = validateTransition(
      submission,
      'SUBMITTED',
      mockAppSpec,
      'STAFF'
    )

    expect(result.valid).toBe(false)
    expect(result.errors[0].code).toBe('INVALID_TRANSITION')
  })

  it('should reject invalid target state', () => {
    const result = validateTransition(
      mockSubmission,
      'INVALID_STATE',
      mockAppSpec,
      'STAFF'
    )

    expect(result.valid).toBe(false)
    expect(result.errors[0]).toEqual({
      field: 'status',
      message: 'Invalid target state: INVALID_STATE',
      code: 'INVALID_TRANSITION',
    })
  })

  it('should support transitions with multiple from states', () => {
    const submittedSubmission = {
      ...mockSubmission,
      status: 'SUBMITTED',
    }

    const needsInfoSubmission = {
      ...mockSubmission,
      status: 'NEEDS_INFO',
    }

    const result1 = validateTransition(
      submittedSubmission,
      'APPROVED',
      mockAppSpec,
      'STAFF'
    )

    const result2 = validateTransition(
      needsInfoSubmission,
      'APPROVED',
      mockAppSpec,
      'STAFF'
    )

    expect(result1.valid).toBe(true)
    expect(result2.valid).toBe(true)
  })
})

// ============================================================================
// sanitizeSubmissionData Tests
// ============================================================================

describe('sanitizeSubmissionData', () => {
  it('should trim whitespace from strings', () => {
    const data = {
      name: '  John Doe  ',
      email: ' john@example.com ',
    }

    const sanitized = sanitizeSubmissionData(data)

    expect(sanitized.name).toBe('John Doe')
    expect(sanitized.email).toBe('john@example.com')
  })

  it('should remove HTML tags from strings', () => {
    const data = {
      name: 'John <script>alert("xss")</script> Doe',
      comment: '<b>Bold</b> and <i>italic</i> text',
    }

    const sanitized = sanitizeSubmissionData(data)

    expect(sanitized.name).toBe('John alert("xss") Doe')
    expect(sanitized.comment).toBe('Bold and italic text')
  })

  it('should remove script tags to prevent XSS', () => {
    const data = {
      malicious: '<script>alert("XSS")</script>',
    }

    const sanitized = sanitizeSubmissionData(data)

    expect(sanitized.malicious).toBe('alert("XSS")')
    expect(sanitized.malicious).not.toContain('<script>')
  })

  it('should decode HTML entities and remove tags', () => {
    const data = {
      encoded: '&lt;div&gt;&quot;Test&quot;&amp;&lt;/div&gt;',
    }

    const sanitized = sanitizeSubmissionData(data)

    // First decodes: <div>"Test"&</div>
    // Then removes tags: "Test"&
    expect(sanitized.encoded).toBe('"Test"&')
  })

  it('should preserve numbers unchanged', () => {
    const data = {
      age: 25,
      score: 98.5,
    }

    const sanitized = sanitizeSubmissionData(data)

    expect(sanitized.age).toBe(25)
    expect(sanitized.score).toBe(98.5)
  })

  it('should preserve booleans unchanged', () => {
    const data = {
      active: true,
      deleted: false,
    }

    const sanitized = sanitizeSubmissionData(data)

    expect(sanitized.active).toBe(true)
    expect(sanitized.deleted).toBe(false)
  })

  it('should preserve null and undefined', () => {
    const data = {
      nullable: null,
      undefined: undefined,
    }

    const sanitized = sanitizeSubmissionData(data)

    expect(sanitized.nullable).toBe(null)
    expect(sanitized.undefined).toBe(undefined)
  })

  it('should sanitize array elements', () => {
    const data = {
      tags: ['  tag1  ', '<b>tag2</b>', 'tag3'],
    }

    const sanitized = sanitizeSubmissionData(data)

    expect(sanitized.tags).toEqual(['tag1', 'tag2', 'tag3'])
  })

  it('should recursively sanitize nested objects', () => {
    const data = {
      user: {
        name: '  John  ',
        bio: '<script>alert("xss")</script>',
        metadata: {
          title: '  Mr.  ',
        },
      },
    }

    const sanitized = sanitizeSubmissionData(data) as typeof data

    expect(sanitized.user.name).toBe('John')
    expect(sanitized.user.bio).toBe('alert("xss")')
    expect(sanitized.user.metadata.title).toBe('Mr.')
  })

  it('should sanitize complex nested structures', () => {
    const data = {
      items: [
        { name: '  Item 1  ', value: 100 },
        { name: '<b>Item 2</b>', value: 200 },
      ],
    }

    const sanitized = sanitizeSubmissionData(data) as typeof data

    expect(sanitized.items[0].name).toBe('Item 1')
    expect(sanitized.items[0].value).toBe(100)
    expect(sanitized.items[1].name).toBe('Item 2')
    expect(sanitized.items[1].value).toBe(200)
  })

  it('should handle mixed arrays with primitives and objects', () => {
    const data = {
      mixed: ['  string  ', 123, true, { text: '<b>bold</b>' }],
    }

    const sanitized = sanitizeSubmissionData(data) as typeof data

    expect(sanitized.mixed[0]).toBe('string')
    expect(sanitized.mixed[1]).toBe(123)
    expect(sanitized.mixed[2]).toBe(true)
    expect((sanitized.mixed[3] as { text: string }).text).toBe('bold')
  })

  it('should sanitize dangerous script injection attempts', () => {
    const data = {
      comment: '"><script>document.location="http://evil.com"</script>',
    }

    const sanitized = sanitizeSubmissionData(data)

    expect(sanitized.comment).not.toContain('<script>')
    expect(sanitized.comment).not.toContain('</script>')
  })

  it('should sanitize iframe injection attempts', () => {
    const data = {
      content: '<iframe src="http://evil.com"></iframe>',
    }

    const sanitized = sanitizeSubmissionData(data)

    expect(sanitized.content).not.toContain('<iframe>')
    expect(sanitized.content).toBe('')
  })

  it('should sanitize event handler attributes', () => {
    const data = {
      text: '<img src=x onerror="alert(\'XSS\')">',
    }

    const sanitized = sanitizeSubmissionData(data)

    expect(sanitized.text).not.toContain('onerror')
    expect(sanitized.text).not.toContain('<img>')
  })
})
