/**
 * Psych Intake Lite Template
 *
 * A complete AppSpec template for a mental health intake form with:
 * - Patient submission flow (welcome → intake → review → submitted)
 * - Patient resume flow for NEEDS_INFO state
 * - Staff review dashboard (login → inbox → detail with actions)
 * - Workflow state machine (DRAFT → SUBMITTED → NEEDS_INFO/APPROVED/REJECTED)
 *
 * @module templates/psych-intake-lite
 */

import type { FastformAppSpec } from '../types/appspec'

/**
 * Psych Intake Lite template with placeholders for runtime substitution.
 *
 * Placeholders:
 * - {{APP_ID_UUID}}: Unique app identifier
 * - {{ORG_ID_UUID}}: Organization identifier
 * - {{ORG_SLUG}}: Organization URL slug
 * - {{ORG_LOGO_URL}}: Optional organization logo URL
 */
export const PSYCH_INTAKE_TEMPLATE: FastformAppSpec = {
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
    logo: '{{ORG_LOGO_URL}}',
  },
  roles: [
    {
      id: 'PATIENT',
      authRequired: false,
    },
    {
      id: 'STAFF',
      authRequired: true,
      routePrefix: '/staff',
    },
  ],
  pages: [
    // Patient Flow: New Submission
    {
      id: 'start',
      route: '/',
      role: 'PATIENT',
      type: 'welcome',
      title: 'Welcome',
      description: 'Thank you for choosing us for your care.',
      fields: [
        {
          id: 'consent',
          type: 'checkbox',
          label: 'I agree to the terms and privacy policy',
          required: true,
        },
      ],
    },
    {
      id: 'intake',
      route: '/intake',
      role: 'PATIENT',
      type: 'form',
      title: 'Tell Us About Yourself',
      fields: [
        {
          id: 'firstName',
          type: 'text',
          label: 'First Name',
          required: true,
        },
        {
          id: 'lastName',
          type: 'text',
          label: 'Last Name',
          required: true,
        },
        {
          id: 'dob',
          type: 'date',
          label: 'Date of Birth',
          required: true,
        },
        {
          id: 'email',
          type: 'email',
          label: 'Email',
          required: true,
        },
        {
          id: 'phone',
          type: 'tel',
          label: 'Phone',
          required: true,
        },
        {
          id: 'state',
          type: 'select',
          label: 'State of Residence',
          required: true,
          options: [
            { value: 'CA', label: 'California' },
            { value: 'NY', label: 'New York' },
            { value: 'TX', label: 'Texas' },
            { value: 'FL', label: 'Florida' },
            { value: 'OTHER', label: 'Other' },
          ],
        },
        {
          id: 'seekingHelp',
          type: 'textarea',
          label: 'What brings you to seek help today?',
          required: true,
        },
        {
          id: 'previousTherapy',
          type: 'radio',
          label: 'Have you seen a therapist before?',
          required: true,
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ],
        },
        {
          id: 'currentMedications',
          type: 'textarea',
          label: 'List any current medications',
          required: false,
        },
        {
          id: 'emergencyContact',
          type: 'text',
          label: 'Emergency Contact Name & Phone',
          required: true,
        },
      ],
    },
    {
      id: 'review',
      route: '/review',
      role: 'PATIENT',
      type: 'review',
      title: 'Review Your Information',
      description: 'Please confirm everything looks correct.',
    },
    {
      id: 'submitted',
      route: '/submitted',
      role: 'PATIENT',
      type: 'success',
      title: 'Thank You!',
      description:
        "We've received your intake. Our team will review and reach out within 24-48 hours.",
    },
    // Patient Flow: Resume
    {
      id: 'resume',
      route: '/resume/[id]',
      role: 'PATIENT',
      type: 'form',
      title: 'Resume Your Intake',
      description: 'Please update your information and resubmit.',
    },
    {
      id: 'resume-review',
      route: '/resume/[id]/review',
      role: 'PATIENT',
      type: 'review',
      title: 'Review & Resubmit',
      description: 'Please confirm everything looks correct before resubmitting.',
    },
    // Staff Flow
    {
      id: 'staff-login',
      route: '/staff/login',
      role: 'STAFF',
      type: 'login',
      title: 'Staff Login',
    },
    {
      id: 'staff-inbox',
      route: '/staff/inbox',
      role: 'STAFF',
      type: 'list',
      title: 'Intake Inbox',
      description: 'Review and process patient submissions',
    },
    {
      id: 'staff-detail',
      route: '/staff/submission/[id]',
      role: 'STAFF',
      type: 'detail',
      title: 'Submission Details',
      actions: [
        {
          id: 'approve',
          label: 'Approve',
          targetState: 'APPROVED',
          variant: 'primary',
        },
        {
          id: 'request-info',
          label: 'Request More Info',
          targetState: 'NEEDS_INFO',
          requiresNote: true,
          variant: 'secondary',
        },
        {
          id: 'reject',
          label: 'Reject',
          targetState: 'REJECTED',
          requiresNote: true,
          variant: 'danger',
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
        from: 'SUBMITTED',
        to: 'APPROVED',
        allowedRoles: ['STAFF'],
      },
      {
        from: 'SUBMITTED',
        to: 'NEEDS_INFO',
        allowedRoles: ['STAFF'],
      },
      {
        from: 'SUBMITTED',
        to: 'REJECTED',
        allowedRoles: ['STAFF'],
      },
      {
        from: 'NEEDS_INFO',
        to: 'SUBMITTED',
        allowedRoles: ['PATIENT'],
      },
      {
        from: 'NEEDS_INFO',
        to: 'REJECTED',
        allowedRoles: ['STAFF'],
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
      transitionSubmission: 'POST /api/apps/:appId/staff/submissions/:id/transition',
      trackEvent: 'POST /api/apps/:appId/events',
    },
  },
  analytics: {
    events: [
      {
        name: 'intake_started',
        trigger: 'pageview',
        page: '/',
      },
      {
        name: 'intake_form_viewed',
        trigger: 'pageview',
        page: '/intake',
      },
      {
        name: 'intake_reviewed',
        trigger: 'pageview',
        page: '/review',
      },
      {
        name: 'intake_submitted',
        trigger: 'submit',
        page: '/review',
      },
      {
        name: 'intake_resumed',
        trigger: 'pageview',
        page: '/resume/[id]',
      },
      {
        name: 'intake_resume_reviewed',
        trigger: 'pageview',
        page: '/resume/[id]/review',
      },
      {
        name: 'intake_resubmitted',
        trigger: 'submit',
        page: '/resume/[id]/review',
      },
      {
        name: 'staff_inbox_viewed',
        trigger: 'pageview',
        page: '/staff/inbox',
      },
      {
        name: 'staff_submission_viewed',
        trigger: 'pageview',
        page: '/staff/submission/[id]',
      },
      {
        name: 'submission_transitioned',
        trigger: 'transition',
      },
    ],
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
}
