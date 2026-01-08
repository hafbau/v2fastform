/**
 * Comprehensive tests for Psych Intake Lite template
 *
 * This test suite validates that the PSYCH_INTAKE_TEMPLATE conforms to the
 * FastformAppSpec v0.3 schema and contains all required elements for the
 * Psych Intake Lite application.
 *
 * @module templates/psych-intake-lite.test
 */

import { describe, it, expect } from 'vitest'
import { PSYCH_INTAKE_TEMPLATE } from './psych-intake-lite'
import { isValidAppSpec } from '@/lib/types/appspec'

describe('PSYCH_INTAKE_TEMPLATE', () => {
  describe('Template structure validation', () => {
    it('should pass isValidAppSpec() type guard', () => {
      expect(isValidAppSpec(PSYCH_INTAKE_TEMPLATE)).toBe(true)
    })

    it('should have version "0.3"', () => {
      expect(PSYCH_INTAKE_TEMPLATE.version).toBe('0.3')
    })

    it('should have id containing "{{APP_ID_UUID}}" placeholder', () => {
      expect(PSYCH_INTAKE_TEMPLATE.id).toBe('{{APP_ID_UUID}}')
    })
  })

  describe('Meta validation', () => {
    it('should have name "Psych Intake Lite"', () => {
      expect(PSYCH_INTAKE_TEMPLATE.meta.name).toBe('Psych Intake Lite')
    })

    it('should have slug "psych-intake"', () => {
      expect(PSYCH_INTAKE_TEMPLATE.meta.slug).toBe('psych-intake')
    })

    it('should have description', () => {
      expect(PSYCH_INTAKE_TEMPLATE.meta.description).toBe(
        'Quick mental health intake for new patients'
      )
    })

    it('should have orgId containing "{{ORG_ID_UUID}}" placeholder', () => {
      expect(PSYCH_INTAKE_TEMPLATE.meta.orgId).toBe('{{ORG_ID_UUID}}')
    })

    it('should have orgSlug containing "{{ORG_SLUG}}" placeholder', () => {
      expect(PSYCH_INTAKE_TEMPLATE.meta.orgSlug).toBe('{{ORG_SLUG}}')
    })
  })

  describe('Theme validation', () => {
    it('should use "healthcare-calm" preset', () => {
      expect(PSYCH_INTAKE_TEMPLATE.theme.preset).toBe('healthcare-calm')
    })

    it('should have logo placeholder', () => {
      expect(PSYCH_INTAKE_TEMPLATE.theme.logo).toBe('{{ORG_LOGO_URL}}')
    })
  })

  describe('Roles validation', () => {
    it('should have exactly 2 roles', () => {
      expect(PSYCH_INTAKE_TEMPLATE.roles).toHaveLength(2)
    })

    it('should have PATIENT role with authRequired: false', () => {
      const patientRole = PSYCH_INTAKE_TEMPLATE.roles.find((r) => r.id === 'PATIENT')
      expect(patientRole).toBeDefined()
      expect(patientRole?.authRequired).toBe(false)
      expect(patientRole?.routePrefix).toBeUndefined()
    })

    it('should have STAFF role with authRequired: true and routePrefix "/staff"', () => {
      const staffRole = PSYCH_INTAKE_TEMPLATE.roles.find((r) => r.id === 'STAFF')
      expect(staffRole).toBeDefined()
      expect(staffRole?.authRequired).toBe(true)
      expect(staffRole?.routePrefix).toBe('/staff')
    })
  })

  describe('Pages validation', () => {
    it('should have exactly 9 pages', () => {
      expect(PSYCH_INTAKE_TEMPLATE.pages).toHaveLength(9)
    })

    it('should have all required page IDs', () => {
      const pageIds = PSYCH_INTAKE_TEMPLATE.pages.map((p) => p.id)
      expect(pageIds).toEqual([
        'start',
        'intake',
        'review',
        'submitted',
        'resume',
        'resume-review',
        'staff-login',
        'staff-inbox',
        'staff-detail',
      ])
    })

    describe('start page (welcome)', () => {
      const startPage = PSYCH_INTAKE_TEMPLATE.pages.find((p) => p.id === 'start')

      it('should exist with correct properties', () => {
        expect(startPage).toBeDefined()
        expect(startPage?.route).toBe('/')
        expect(startPage?.role).toBe('PATIENT')
        expect(startPage?.type).toBe('welcome')
        expect(startPage?.title).toBe('Welcome')
      })

      it('should have consent checkbox field', () => {
        expect(startPage?.fields).toHaveLength(1)
        expect(startPage?.fields?.[0].id).toBe('consent')
        expect(startPage?.fields?.[0].type).toBe('checkbox')
        expect(startPage?.fields?.[0].required).toBe(true)
      })
    })

    describe('intake page (form)', () => {
      const intakePage = PSYCH_INTAKE_TEMPLATE.pages.find((p) => p.id === 'intake')

      it('should exist with correct properties', () => {
        expect(intakePage).toBeDefined()
        expect(intakePage?.route).toBe('/intake')
        expect(intakePage?.role).toBe('PATIENT')
        expect(intakePage?.type).toBe('form')
        expect(intakePage?.title).toBe('Tell Us About Yourself')
      })

      it('should have exactly 10 fields', () => {
        expect(intakePage?.fields).toHaveLength(10)
      })

      it('should have all required field IDs in order', () => {
        const fieldIds = intakePage?.fields?.map((f) => f.id)
        expect(fieldIds).toEqual([
          'firstName',
          'lastName',
          'dob',
          'email',
          'phone',
          'state',
          'seekingHelp',
          'previousTherapy',
          'currentMedications',
          'emergencyContact',
        ])
      })

      it('should have firstName field (text, required)', () => {
        const field = intakePage?.fields?.find((f) => f.id === 'firstName')
        expect(field).toBeDefined()
        expect(field?.type).toBe('text')
        expect(field?.label).toBe('First Name')
        expect(field?.required).toBe(true)
      })

      it('should have lastName field (text, required)', () => {
        const field = intakePage?.fields?.find((f) => f.id === 'lastName')
        expect(field).toBeDefined()
        expect(field?.type).toBe('text')
        expect(field?.label).toBe('Last Name')
        expect(field?.required).toBe(true)
      })

      it('should have dob field (date, required)', () => {
        const field = intakePage?.fields?.find((f) => f.id === 'dob')
        expect(field).toBeDefined()
        expect(field?.type).toBe('date')
        expect(field?.label).toBe('Date of Birth')
        expect(field?.required).toBe(true)
      })

      it('should have email field (email, required)', () => {
        const field = intakePage?.fields?.find((f) => f.id === 'email')
        expect(field).toBeDefined()
        expect(field?.type).toBe('email')
        expect(field?.label).toBe('Email')
        expect(field?.required).toBe(true)
      })

      it('should have phone field (tel, required)', () => {
        const field = intakePage?.fields?.find((f) => f.id === 'phone')
        expect(field).toBeDefined()
        expect(field?.type).toBe('tel')
        expect(field?.label).toBe('Phone')
        expect(field?.required).toBe(true)
      })

      it('should have state field (select, required) with 5 options', () => {
        const field = intakePage?.fields?.find((f) => f.id === 'state')
        expect(field).toBeDefined()
        expect(field?.type).toBe('select')
        expect(field?.label).toBe('State of Residence')
        expect(field?.required).toBe(true)
        expect(field?.options).toHaveLength(5)
        expect(field?.options?.map((o) => o.value)).toEqual([
          'CA',
          'NY',
          'TX',
          'FL',
          'OTHER',
        ])
      })

      it('should have seekingHelp field (textarea, required)', () => {
        const field = intakePage?.fields?.find((f) => f.id === 'seekingHelp')
        expect(field).toBeDefined()
        expect(field?.type).toBe('textarea')
        expect(field?.label).toBe('What brings you to seek help today?')
        expect(field?.required).toBe(true)
      })

      it('should have previousTherapy field (radio, required) with 2 options', () => {
        const field = intakePage?.fields?.find((f) => f.id === 'previousTherapy')
        expect(field).toBeDefined()
        expect(field?.type).toBe('radio')
        expect(field?.label).toBe('Have you seen a therapist before?')
        expect(field?.required).toBe(true)
        expect(field?.options).toHaveLength(2)
        expect(field?.options?.map((o) => o.value)).toEqual(['yes', 'no'])
      })

      it('should have currentMedications field (textarea, optional)', () => {
        const field = intakePage?.fields?.find((f) => f.id === 'currentMedications')
        expect(field).toBeDefined()
        expect(field?.type).toBe('textarea')
        expect(field?.label).toBe('List any current medications')
        expect(field?.required).toBe(false)
      })

      it('should have emergencyContact field (text, required)', () => {
        const field = intakePage?.fields?.find((f) => f.id === 'emergencyContact')
        expect(field).toBeDefined()
        expect(field?.type).toBe('text')
        expect(field?.label).toBe('Emergency Contact Name & Phone')
        expect(field?.required).toBe(true)
      })
    })

    describe('review page', () => {
      const reviewPage = PSYCH_INTAKE_TEMPLATE.pages.find((p) => p.id === 'review')

      it('should exist with correct properties', () => {
        expect(reviewPage).toBeDefined()
        expect(reviewPage?.route).toBe('/review')
        expect(reviewPage?.role).toBe('PATIENT')
        expect(reviewPage?.type).toBe('review')
        expect(reviewPage?.title).toBe('Review Your Information')
        expect(reviewPage?.description).toBe('Please confirm everything looks correct.')
      })
    })

    describe('submitted page', () => {
      const submittedPage = PSYCH_INTAKE_TEMPLATE.pages.find((p) => p.id === 'submitted')

      it('should exist with correct properties', () => {
        expect(submittedPage).toBeDefined()
        expect(submittedPage?.route).toBe('/submitted')
        expect(submittedPage?.role).toBe('PATIENT')
        expect(submittedPage?.type).toBe('success')
        expect(submittedPage?.title).toBe('Thank You!')
      })
    })

    describe('resume page', () => {
      const resumePage = PSYCH_INTAKE_TEMPLATE.pages.find((p) => p.id === 'resume')

      it('should exist with correct properties', () => {
        expect(resumePage).toBeDefined()
        expect(resumePage?.route).toBe('/resume/[id]')
        expect(resumePage?.role).toBe('PATIENT')
        expect(resumePage?.type).toBe('form')
        expect(resumePage?.title).toBe('Resume Your Intake')
      })
    })

    describe('resume-review page', () => {
      const resumeReviewPage = PSYCH_INTAKE_TEMPLATE.pages.find(
        (p) => p.id === 'resume-review'
      )

      it('should exist with correct properties', () => {
        expect(resumeReviewPage).toBeDefined()
        expect(resumeReviewPage?.route).toBe('/resume/[id]/review')
        expect(resumeReviewPage?.role).toBe('PATIENT')
        expect(resumeReviewPage?.type).toBe('review')
        expect(resumeReviewPage?.title).toBe('Review & Resubmit')
      })
    })

    describe('staff-login page', () => {
      const staffLoginPage = PSYCH_INTAKE_TEMPLATE.pages.find(
        (p) => p.id === 'staff-login'
      )

      it('should exist with correct properties', () => {
        expect(staffLoginPage).toBeDefined()
        expect(staffLoginPage?.route).toBe('/staff/login')
        expect(staffLoginPage?.role).toBe('STAFF')
        expect(staffLoginPage?.type).toBe('login')
        expect(staffLoginPage?.title).toBe('Staff Login')
      })
    })

    describe('staff-inbox page', () => {
      const staffInboxPage = PSYCH_INTAKE_TEMPLATE.pages.find(
        (p) => p.id === 'staff-inbox'
      )

      it('should exist with correct properties', () => {
        expect(staffInboxPage).toBeDefined()
        expect(staffInboxPage?.route).toBe('/staff/inbox')
        expect(staffInboxPage?.role).toBe('STAFF')
        expect(staffInboxPage?.type).toBe('list')
        expect(staffInboxPage?.title).toBe('Intake Inbox')
      })
    })

    describe('staff-detail page', () => {
      const staffDetailPage = PSYCH_INTAKE_TEMPLATE.pages.find(
        (p) => p.id === 'staff-detail'
      )

      it('should exist with correct properties', () => {
        expect(staffDetailPage).toBeDefined()
        expect(staffDetailPage?.route).toBe('/staff/submission/[id]')
        expect(staffDetailPage?.role).toBe('STAFF')
        expect(staffDetailPage?.type).toBe('detail')
        expect(staffDetailPage?.title).toBe('Submission Details')
      })

      it('should have exactly 3 actions', () => {
        expect(staffDetailPage?.actions).toHaveLength(3)
      })

      it('should have approve action', () => {
        const action = staffDetailPage?.actions?.find((a) => a.id === 'approve')
        expect(action).toBeDefined()
        expect(action?.label).toBe('Approve')
        expect(action?.targetState).toBe('APPROVED')
        expect(action?.variant).toBe('primary')
        expect(action?.requiresNote).toBeUndefined()
      })

      it('should have request-info action with requiresNote', () => {
        const action = staffDetailPage?.actions?.find((a) => a.id === 'request-info')
        expect(action).toBeDefined()
        expect(action?.label).toBe('Request More Info')
        expect(action?.targetState).toBe('NEEDS_INFO')
        expect(action?.variant).toBe('secondary')
        expect(action?.requiresNote).toBe(true)
      })

      it('should have reject action with requiresNote', () => {
        const action = staffDetailPage?.actions?.find((a) => a.id === 'reject')
        expect(action).toBeDefined()
        expect(action?.label).toBe('Reject')
        expect(action?.targetState).toBe('REJECTED')
        expect(action?.variant).toBe('danger')
        expect(action?.requiresNote).toBe(true)
      })
    })
  })

  describe('Workflow validation', () => {
    it('should have exactly 5 states', () => {
      expect(PSYCH_INTAKE_TEMPLATE.workflow.states).toHaveLength(5)
      expect(PSYCH_INTAKE_TEMPLATE.workflow.states).toEqual([
        'DRAFT',
        'SUBMITTED',
        'NEEDS_INFO',
        'APPROVED',
        'REJECTED',
      ])
    })

    it('should have initialState as "DRAFT"', () => {
      expect(PSYCH_INTAKE_TEMPLATE.workflow.initialState).toBe('DRAFT')
    })

    it('should have exactly 6 transitions', () => {
      expect(PSYCH_INTAKE_TEMPLATE.workflow.transitions).toHaveLength(6)
    })

    describe('transition rules', () => {
      const transitions = PSYCH_INTAKE_TEMPLATE.workflow.transitions

      it('should allow DRAFT → SUBMITTED (PATIENT)', () => {
        const transition = transitions.find(
          (t) => t.from === 'DRAFT' && t.to === 'SUBMITTED'
        )
        expect(transition).toBeDefined()
        expect(transition?.allowedRoles).toEqual(['PATIENT'])
      })

      it('should allow SUBMITTED → APPROVED (STAFF)', () => {
        const transition = transitions.find(
          (t) => t.from === 'SUBMITTED' && t.to === 'APPROVED'
        )
        expect(transition).toBeDefined()
        expect(transition?.allowedRoles).toEqual(['STAFF'])
      })

      it('should allow SUBMITTED → NEEDS_INFO (STAFF)', () => {
        const transition = transitions.find(
          (t) => t.from === 'SUBMITTED' && t.to === 'NEEDS_INFO'
        )
        expect(transition).toBeDefined()
        expect(transition?.allowedRoles).toEqual(['STAFF'])
      })

      it('should allow SUBMITTED → REJECTED (STAFF)', () => {
        const transition = transitions.find(
          (t) => t.from === 'SUBMITTED' && t.to === 'REJECTED'
        )
        expect(transition).toBeDefined()
        expect(transition?.allowedRoles).toEqual(['STAFF'])
      })

      it('should allow NEEDS_INFO → SUBMITTED (PATIENT)', () => {
        const transition = transitions.find(
          (t) => t.from === 'NEEDS_INFO' && t.to === 'SUBMITTED'
        )
        expect(transition).toBeDefined()
        expect(transition?.allowedRoles).toEqual(['PATIENT'])
      })

      it('should allow NEEDS_INFO → REJECTED (STAFF)', () => {
        const transition = transitions.find(
          (t) => t.from === 'NEEDS_INFO' && t.to === 'REJECTED'
        )
        expect(transition).toBeDefined()
        expect(transition?.allowedRoles).toEqual(['STAFF'])
      })
    })
  })

  describe('API endpoints validation', () => {
    it('should have baseUrl as "{{FASTFORM_API_URL}}" placeholder', () => {
      expect(PSYCH_INTAKE_TEMPLATE.api.baseUrl).toBe('{{FASTFORM_API_URL}}')
    })

    it('should have all 10 required endpoints', () => {
      const endpoints = PSYCH_INTAKE_TEMPLATE.api.endpoints
      expect(Object.keys(endpoints)).toHaveLength(10)
    })

    it('should have patient endpoints', () => {
      const endpoints = PSYCH_INTAKE_TEMPLATE.api.endpoints
      expect(endpoints.createSubmission).toBe('POST /api/apps/:appId/submissions')
      expect(endpoints.getSubmission).toBe('GET /api/apps/:appId/submissions/:id')
      expect(endpoints.resubmitSubmission).toBe(
        'POST /api/apps/:appId/submissions/:id/resubmit'
      )
    })

    it('should have staff auth endpoints', () => {
      const endpoints = PSYCH_INTAKE_TEMPLATE.api.endpoints
      expect(endpoints.staffLogin).toBe('POST /api/apps/:appId/staff/login')
      expect(endpoints.staffLogout).toBe('POST /api/apps/:appId/staff/logout')
      expect(endpoints.staffSession).toBe('GET /api/apps/:appId/staff/session')
    })

    it('should have staff data endpoints', () => {
      const endpoints = PSYCH_INTAKE_TEMPLATE.api.endpoints
      expect(endpoints.listSubmissions).toBe('GET /api/apps/:appId/staff/inbox')
      expect(endpoints.getSubmissionDetail).toBe(
        'GET /api/apps/:appId/staff/submissions/:id'
      )
      expect(endpoints.transitionSubmission).toBe(
        'POST /api/apps/:appId/staff/submissions/:id/transition'
      )
    })

    it('should have analytics endpoint', () => {
      const endpoints = PSYCH_INTAKE_TEMPLATE.api.endpoints
      expect(endpoints.trackEvent).toBe('POST /api/apps/:appId/events')
    })
  })

  describe('Analytics validation', () => {
    it('should have exactly 10 analytics events', () => {
      expect(PSYCH_INTAKE_TEMPLATE.analytics.events).toHaveLength(10)
    })

    it('should track patient intake flow events', () => {
      const events = PSYCH_INTAKE_TEMPLATE.analytics.events
      const eventNames = events.map((e) => e.name)

      expect(eventNames).toContain('intake_started')
      expect(eventNames).toContain('intake_form_viewed')
      expect(eventNames).toContain('intake_reviewed')
      expect(eventNames).toContain('intake_submitted')
    })

    it('should track patient resume flow events', () => {
      const events = PSYCH_INTAKE_TEMPLATE.analytics.events
      const eventNames = events.map((e) => e.name)

      expect(eventNames).toContain('intake_resumed')
      expect(eventNames).toContain('intake_resume_reviewed')
      expect(eventNames).toContain('intake_resubmitted')
    })

    it('should track staff flow events', () => {
      const events = PSYCH_INTAKE_TEMPLATE.analytics.events
      const eventNames = events.map((e) => e.name)

      expect(eventNames).toContain('staff_inbox_viewed')
      expect(eventNames).toContain('staff_submission_viewed')
      expect(eventNames).toContain('submission_transitioned')
    })

    it('should have correct event triggers', () => {
      const events = PSYCH_INTAKE_TEMPLATE.analytics.events

      const pageviewEvents = events.filter((e) => e.trigger === 'pageview')
      expect(pageviewEvents).toHaveLength(7)

      const submitEvents = events.filter((e) => e.trigger === 'submit')
      expect(submitEvents).toHaveLength(2)

      const transitionEvents = events.filter((e) => e.trigger === 'transition')
      expect(transitionEvents).toHaveLength(1)
    })

    it('should have page property for pageview events', () => {
      const pageviewEvents = PSYCH_INTAKE_TEMPLATE.analytics.events.filter(
        (e) => e.trigger === 'pageview'
      )

      pageviewEvents.forEach((event) => {
        expect(event.page).toBeDefined()
        expect(typeof event.page).toBe('string')
      })
    })
  })

  describe('Environments validation', () => {
    it('should have staging configuration', () => {
      const staging = PSYCH_INTAKE_TEMPLATE.environments.staging
      expect(staging).toBeDefined()
      expect(staging.domain).toBe('psych-intake-{{ORG_SLUG}}-staging.getfastform.com')
      expect(staging.apiUrl).toBe('https://api-staging.getfastform.com')
    })

    it('should have production configuration', () => {
      const production = PSYCH_INTAKE_TEMPLATE.environments.production
      expect(production).toBeDefined()
      expect(production.domain).toBe('psych-intake-{{ORG_SLUG}}.getfastform.com')
      expect(production.apiUrl).toBe('https://api.getfastform.com')
    })

    it('should use placeholder patterns in domain configs', () => {
      expect(PSYCH_INTAKE_TEMPLATE.environments.staging.domain).toContain('{{ORG_SLUG}}')
      expect(PSYCH_INTAKE_TEMPLATE.environments.production.domain).toContain(
        '{{ORG_SLUG}}'
      )
    })
  })

  describe('Type safety and immutability', () => {
    it('should be typed as FastformAppSpec', () => {
      // TypeScript compile-time check
      const _typeCheck: typeof PSYCH_INTAKE_TEMPLATE extends FastformAppSpec
        ? true
        : false = true
      expect(_typeCheck).toBe(true)
    })

    it('should have consistent page roles with defined roles', () => {
      const roleIds = PSYCH_INTAKE_TEMPLATE.roles.map((r) => r.id)
      PSYCH_INTAKE_TEMPLATE.pages.forEach((page) => {
        expect(roleIds).toContain(page.role)
      })
    })

    it('should have workflow states referenced in transitions', () => {
      const states = PSYCH_INTAKE_TEMPLATE.workflow.states
      PSYCH_INTAKE_TEMPLATE.workflow.transitions.forEach((transition) => {
        if (Array.isArray(transition.from)) {
          transition.from.forEach((fromState) => {
            expect(states).toContain(fromState)
          })
        } else {
          expect(states).toContain(transition.from)
        }
        expect(states).toContain(transition.to)
      })
    })

    it('should have action targetStates that exist in workflow states', () => {
      const states = PSYCH_INTAKE_TEMPLATE.workflow.states
      PSYCH_INTAKE_TEMPLATE.pages.forEach((page) => {
        if (page.actions) {
          page.actions.forEach((action) => {
            expect(states).toContain(action.targetState)
          })
        }
      })
    })
  })
})
