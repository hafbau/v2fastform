# AppSpec Development Guide

## Overview

This guide provides comprehensive documentation for creating, validating, and extending Fastform AppSpecs. An **AppSpec** is the canonical source of truth for a Fastform application - a versioned JSON configuration that describes the structure, behavior, and workflow of a healthcare intake application.

**Key Concept**: AppSpec is not the deployed application itself. It's the "blueprint" that Fastform uses to generate a deployable Next.js application via v0, inject backend integrations, and wire up multi-tenant infrastructure.

```
AppSpec (JSON config) → Prompt Compiler → v0 Generation → Post-Processing → Deployed App
```

---

## AppSpec Schema v0.3

### Core Structure

An AppSpec consists of eight primary sections:

```typescript
interface FastformAppSpec {
  id: string;                    // UUID - unique app identifier
  version: "0.3";                // Schema version
  meta: AppMeta;                 // App identity and organization
  theme: ThemeConfig;            // Visual design and branding
  roles: Role[];                 // User roles (PATIENT, STAFF)
  pages: Page[];                 // Application pages and forms
  workflow: WorkflowConfig;      // State machine and transitions
  api: ApiConfig;                // Backend API contract
  analytics: AnalyticsConfig;    // Event tracking configuration
  environments: EnvironmentConfig; // Staging and production settings
}
```

### Schema Version

**Current Version**: `0.3`

The version field is critical for:
- Schema validation during AppSpec processing
- Backward compatibility when schema evolves
- Migration tooling for upgrading legacy AppSpecs

**Important**: All AppSpecs must specify `"version": "0.3"` to be processed by the current Fastform pipeline.

---

## Creating a New Template

### Step 1: Define App Metadata

Start with basic app identity and organization information:

```typescript
{
  "id": "{{APP_ID_UUID}}",  // Placeholder - will be replaced at generation time
  "version": "0.3",
  "meta": {
    "name": "Physical Therapy Intake",
    "slug": "pt-intake",
    "description": "New patient intake for physical therapy services",
    "orgId": "{{ORG_ID_UUID}}",
    "orgSlug": "{{ORG_SLUG}}"
  }
}
```

**Naming Rules**:
- `name`: Human-readable title (2-50 characters)
- `slug`: URL-safe identifier (lowercase, hyphens, 2-30 characters, no special chars)
- `description`: Brief summary (max 200 characters)

### Step 2: Configure Theme

Set visual design using healthcare presets:

```typescript
{
  "theme": {
    "preset": "healthcare-calm",  // v1 supports only "healthcare-calm"
    "logo": "{{ORG_LOGO_URL}}",   // Optional organization logo
    "colors": {                    // Optional overrides
      "primary": "#7FFFD4",
      "background": "#F0F8FF",
      "text": "#1F2937"
    }
  }
}
```

**Theme Constraints (v1)**:
- Only `healthcare-calm` preset is supported
- Color overrides are applied during post-processing
- Logo URL must be publicly accessible (HTTPS)

### Step 3: Define Roles

Specify user roles and their authentication requirements:

```typescript
{
  "roles": [
    {
      "id": "PATIENT",
      "authRequired": false
    },
    {
      "id": "STAFF",
      "authRequired": true,
      "routePrefix": "/staff"
    }
  ]
}
```

**Role Constraints (v1)**:
- Maximum 2 roles: `PATIENT` and `STAFF`
- `PATIENT` role must have `authRequired: false`
- `STAFF` role must have `authRequired: true` and `routePrefix: "/staff"`

### Step 4: Design Pages

Define the application's page structure and user flows.

#### Patient Flow Example

**Welcome Page** (Entry point with consent):
```typescript
{
  "id": "start",
  "route": "/",
  "role": "PATIENT",
  "type": "welcome",
  "title": "Welcome to Physical Therapy",
  "description": "Start your journey to recovery",
  "fields": [
    {
      "id": "consent",
      "type": "checkbox",
      "label": "I agree to the terms and privacy policy",
      "required": true
    }
  ]
}
```

**Form Page** (Data collection):
```typescript
{
  "id": "intake",
  "route": "/intake",
  "role": "PATIENT",
  "type": "form",
  "title": "Patient Information",
  "fields": [
    {
      "id": "firstName",
      "type": "text",
      "label": "First Name",
      "required": true
    },
    {
      "id": "injuryType",
      "type": "select",
      "label": "Type of Injury",
      "required": true,
      "options": [
        { "value": "sports", "label": "Sports Injury" },
        { "value": "accident", "label": "Accident" },
        { "value": "chronic", "label": "Chronic Pain" },
        { "value": "post-surgery", "label": "Post-Surgery" }
      ]
    },
    {
      "id": "painLevel",
      "type": "number",
      "label": "Pain Level (1-10)",
      "required": true,
      "validation": [
        { "type": "min", "value": 1, "message": "Must be at least 1" },
        { "type": "max", "value": 10, "message": "Must be at most 10" }
      ]
    }
  ]
}
```

**Review Page** (Confirmation):
```typescript
{
  "id": "review",
  "route": "/review",
  "role": "PATIENT",
  "type": "review",
  "title": "Review Your Information",
  "description": "Please confirm everything looks correct."
}
```

**Success Page** (Completion):
```typescript
{
  "id": "submitted",
  "route": "/submitted",
  "role": "PATIENT",
  "type": "success",
  "title": "Thank You!",
  "description": "We've received your intake. Our team will contact you within 24 hours."
}
```

#### Staff Flow Example

**Login Page**:
```typescript
{
  "id": "staff-login",
  "route": "/staff/login",
  "role": "STAFF",
  "type": "login",
  "title": "Staff Login"
}
```

**Inbox Page** (List view):
```typescript
{
  "id": "staff-inbox",
  "route": "/staff/inbox",
  "role": "STAFF",
  "type": "list",
  "title": "Patient Intake Queue",
  "description": "Review and process patient submissions"
}
```

**Detail Page** (Single record with actions):
```typescript
{
  "id": "staff-detail",
  "route": "/staff/submission/[id]",
  "role": "STAFF",
  "type": "detail",
  "title": "Submission Details",
  "actions": [
    {
      "id": "schedule",
      "label": "Schedule Appointment",
      "targetState": "APPROVED",
      "variant": "primary"
    },
    {
      "id": "request-info",
      "label": "Request More Info",
      "targetState": "NEEDS_INFO",
      "requiresNote": true,
      "variant": "secondary"
    },
    {
      "id": "decline",
      "label": "Decline",
      "targetState": "REJECTED",
      "requiresNote": true,
      "variant": "danger"
    }
  ]
}
```

### Step 5: Define Workflow State Machine

Specify allowed states and transitions:

```typescript
{
  "workflow": {
    "states": ["DRAFT", "SUBMITTED", "NEEDS_INFO", "APPROVED", "REJECTED"],
    "initialState": "DRAFT",
    "transitions": [
      {
        "from": "DRAFT",
        "to": "SUBMITTED",
        "allowedRoles": ["PATIENT"]
      },
      {
        "from": "SUBMITTED",
        "to": "APPROVED",
        "allowedRoles": ["STAFF"]
      },
      {
        "from": "SUBMITTED",
        "to": "NEEDS_INFO",
        "allowedRoles": ["STAFF"]
      },
      {
        "from": "SUBMITTED",
        "to": "REJECTED",
        "allowedRoles": ["STAFF"]
      },
      {
        "from": "NEEDS_INFO",
        "to": "SUBMITTED",
        "allowedRoles": ["PATIENT"]
      }
    ]
  }
}
```

**Workflow Rules**:
- `DRAFT` is the initial client-side state (not persisted to backend)
- First submission transitions from `DRAFT` to `SUBMITTED`
- All transitions are validated server-side
- Invalid transitions are rejected with 400 error

### Step 6: Configure API Contract

Define backend endpoints (these are standardized and rarely need modification):

```typescript
{
  "api": {
    "baseUrl": "{{FASTFORM_API_URL}}",
    "endpoints": {
      "createSubmission": "POST /api/apps/:appId/submissions",
      "getSubmission": "GET /api/apps/:appId/submissions/:id",
      "resubmitSubmission": "POST /api/apps/:appId/submissions/:id/resubmit",
      "staffLogin": "POST /api/apps/:appId/staff/login",
      "staffLogout": "POST /api/apps/:appId/staff/logout",
      "staffSession": "GET /api/apps/:appId/staff/session",
      "listSubmissions": "GET /api/apps/:appId/staff/inbox",
      "getSubmissionDetail": "GET /api/apps/:appId/staff/submissions/:id",
      "transitionSubmission": "POST /api/apps/:appId/staff/submissions/:id/transition",
      "trackEvent": "POST /api/apps/:appId/events"
    }
  }
}
```

**Important Notes**:
- `baseUrl` is a placeholder - actual URL injected at deploy time
- All generated apps use the central Fastform multi-tenant backend
- Do not modify endpoint paths unless adding new v1 features

### Step 7: Configure Analytics

Define event tracking for user interactions:

```typescript
{
  "analytics": {
    "events": [
      { "name": "intake_started", "trigger": "pageview", "page": "/" },
      { "name": "intake_form_viewed", "trigger": "pageview", "page": "/intake" },
      { "name": "intake_submitted", "trigger": "submit", "page": "/review" },
      { "name": "staff_inbox_viewed", "trigger": "pageview", "page": "/staff/inbox" },
      { "name": "submission_transitioned", "trigger": "transition" }
    ]
  }
}
```

**Event Triggers**:
- `pageview`: Fired on page mount (via `useEffect`)
- `submit`: Fired on form submission
- `transition`: Fired on workflow state change
- `action`: Fired on explicit user action

### Step 8: Set Environment Configuration

Configure staging and production deployments:

```typescript
{
  "environments": {
    "staging": {
      "domain": "pt-intake-{{ORG_SLUG}}-staging.getfastform.com",
      "apiUrl": "https://api-staging.getfastform.com"
    },
    "production": {
      "domain": "pt-intake-{{ORG_SLUG}}.getfastform.com",
      "apiUrl": "https://api.getfastform.com"
    }
  }
}
```

**Environment Rules**:
- Domains follow pattern: `{appSlug}-{orgSlug}-{environment}.getfastform.com`
- API URLs point to central Fastform backend
- Staging environment is always deployed first
- Production promotion requires successful staging deployment

---

## Field Types and Validation

### Supported Field Types (v1)

| Field Type | HTML Input | Use Case |
|-----------|-----------|----------|
| `text` | `<input type="text">` | Names, short text |
| `email` | `<input type="email">` | Email addresses |
| `tel` | `<input type="tel">` | Phone numbers |
| `date` | `<input type="date">` | Date of birth, appointments |
| `number` | `<input type="number">` | Age, numeric ratings |
| `textarea` | `<textarea>` | Long-form text (symptoms, notes) |
| `select` | `<select>` | Single choice from list |
| `radio` | `<input type="radio">` | Single choice (rendered inline) |
| `checkbox` | `<input type="checkbox">` | Boolean consent, agreements |

### Validation Rules

Field-level validation is defined using the `validation` array:

```typescript
{
  "id": "email",
  "type": "email",
  "label": "Email Address",
  "required": true,
  "validation": [
    {
      "type": "pattern",
      "value": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
      "message": "Please enter a valid email address"
    }
  ]
}
```

**Validation Types**:

| Type | Applies To | Example |
|------|-----------|---------|
| `minLength` | text, textarea | `{ "type": "minLength", "value": 10, "message": "At least 10 characters" }` |
| `maxLength` | text, textarea | `{ "type": "maxLength", "value": 200, "message": "Maximum 200 characters" }` |
| `pattern` | text, email, tel | `{ "type": "pattern", "value": "regex", "message": "..." }` |
| `min` | number | `{ "type": "min", "value": 0, "message": "Must be positive" }` |
| `max` | number | `{ "type": "max", "value": 100, "message": "Cannot exceed 100" }` |

### Conditional Fields

Display fields conditionally based on other field values:

```typescript
{
  "id": "previousTherapy",
  "type": "radio",
  "label": "Have you had physical therapy before?",
  "required": true,
  "options": [
    { "value": "yes", "label": "Yes" },
    { "value": "no", "label": "No" }
  ]
},
{
  "id": "previousProvider",
  "type": "text",
  "label": "Name of Previous Provider",
  "required": false,
  "condition": {
    "field": "previousTherapy",
    "operator": "equals",
    "value": "yes"
  }
}
```

**Condition Operators**:
- `equals`: Field value matches specified value
- `not_equals`: Field value does not match
- `exists`: Field has any value (non-empty)

---

## Supported vs. Unsupported Features

### Supported in v1

- **Page Types**: welcome, form, review, success, login, list, detail
- **Field Types**: text, email, tel, date, number, textarea, select, radio, checkbox
- **Roles**: PATIENT (unauthenticated), STAFF (authenticated)
- **Workflow**: Linear state machine with 5 states max
- **Validation**: Client-side + server-side with standard rules
- **Resume Flow**: NEEDS_INFO state triggers patient resubmission
- **Analytics**: Event tracking for pageviews, submissions, transitions
- **Themes**: healthcare-calm preset with color overrides
- **Deployments**: Staging-first, production promotion

### Unsupported (Deferred to Future Versions)

| Feature | Why Deferred | Workaround |
|---------|-------------|-----------|
| **File Upload** | Storage complexity | Use textarea for file URLs |
| **Signature Capture** | Canvas rendering | Use checkbox consent |
| **Multi-step Forms** | Complexity in state management | Use single long form with sections |
| **Custom Page Types** | v0 prompt constraints | Use existing types creatively |
| **Branching Workflows** | State machine limitations | Keep workflows linear |
| **Multi-language** | i18n complexity | Create separate apps per language |
| **Custom Domains** | DNS management | Use default .getfastform.com |
| **SSO / SAML** | Enterprise auth | Use magic link auth |
| **EHR Integrations** | External API dependencies | Export submissions manually |
| **Drag-and-drop Editor** | Not needed for v1 pipeline | Define AppSpec JSON directly |

### Future Roadmap

**v2 Features** (planned):
- File upload with S3 integration
- Multi-step forms with progress indicator
- Custom theme builder UI
- Zapier/webhooks for third-party integrations

**v3 Features** (consideration):
- Visual AppSpec editor (drag-and-drop)
- Advanced branching workflows
- Custom field type plugins
- White-label deployments

---

## Example AppSpecs for Healthcare Use Cases

### Example 1: Dental New Patient Intake

```json
{
  "id": "{{APP_ID_UUID}}",
  "version": "0.3",
  "meta": {
    "name": "Dental New Patient Intake",
    "slug": "dental-intake",
    "description": "New patient registration for dental practice",
    "orgId": "{{ORG_ID_UUID}}",
    "orgSlug": "{{ORG_SLUG}}"
  },
  "theme": {
    "preset": "healthcare-calm"
  },
  "roles": [
    { "id": "PATIENT", "authRequired": false },
    { "id": "STAFF", "authRequired": true, "routePrefix": "/staff" }
  ],
  "pages": [
    {
      "id": "start",
      "route": "/",
      "role": "PATIENT",
      "type": "welcome",
      "title": "Welcome to Our Practice",
      "fields": [
        { "id": "consent", "type": "checkbox", "label": "I agree to privacy policy", "required": true }
      ]
    },
    {
      "id": "intake",
      "route": "/intake",
      "role": "PATIENT",
      "type": "form",
      "title": "Patient Information",
      "fields": [
        { "id": "firstName", "type": "text", "label": "First Name", "required": true },
        { "id": "lastName", "type": "text", "label": "Last Name", "required": true },
        { "id": "dob", "type": "date", "label": "Date of Birth", "required": true },
        { "id": "insurance", "type": "radio", "label": "Do you have dental insurance?", "required": true, "options": [
          { "value": "yes", "label": "Yes" },
          { "value": "no", "label": "No" }
        ]},
        { "id": "insuranceProvider", "type": "text", "label": "Insurance Provider", "required": false, "condition": {
          "field": "insurance", "operator": "equals", "value": "yes"
        }},
        { "id": "chiefConcern", "type": "textarea", "label": "What brings you in today?", "required": true }
      ]
    },
    {
      "id": "review",
      "route": "/review",
      "role": "PATIENT",
      "type": "review",
      "title": "Review & Submit"
    },
    {
      "id": "submitted",
      "route": "/submitted",
      "role": "PATIENT",
      "type": "success",
      "title": "See You Soon!",
      "description": "We'll call you within 24 hours to schedule your appointment."
    },
    {
      "id": "staff-inbox",
      "route": "/staff/inbox",
      "role": "STAFF",
      "type": "list",
      "title": "New Patients"
    },
    {
      "id": "staff-detail",
      "route": "/staff/submission/[id]",
      "role": "STAFF",
      "type": "detail",
      "title": "Patient Details",
      "actions": [
        { "id": "schedule", "label": "Schedule", "targetState": "APPROVED", "variant": "primary" },
        { "id": "decline", "label": "Decline", "targetState": "REJECTED", "requiresNote": true, "variant": "danger" }
      ]
    }
  ],
  "workflow": {
    "states": ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"],
    "initialState": "DRAFT",
    "transitions": [
      { "from": "DRAFT", "to": "SUBMITTED", "allowedRoles": ["PATIENT"] },
      { "from": "SUBMITTED", "to": "APPROVED", "allowedRoles": ["STAFF"] },
      { "from": "SUBMITTED", "to": "REJECTED", "allowedRoles": ["STAFF"] }
    ]
  },
  "api": {
    "baseUrl": "{{FASTFORM_API_URL}}",
    "endpoints": {
      "createSubmission": "POST /api/apps/:appId/submissions",
      "listSubmissions": "GET /api/apps/:appId/staff/inbox",
      "getSubmissionDetail": "GET /api/apps/:appId/staff/submissions/:id",
      "transitionSubmission": "POST /api/apps/:appId/staff/submissions/:id/transition",
      "trackEvent": "POST /api/apps/:appId/events"
    }
  },
  "analytics": {
    "events": [
      { "name": "intake_started", "trigger": "pageview", "page": "/" },
      { "name": "intake_submitted", "trigger": "submit", "page": "/review" }
    ]
  },
  "environments": {
    "staging": {
      "domain": "dental-intake-{{ORG_SLUG}}-staging.getfastform.com",
      "apiUrl": "https://api-staging.getfastform.com"
    },
    "production": {
      "domain": "dental-intake-{{ORG_SLUG}}.getfastform.com",
      "apiUrl": "https://api.getfastform.com"
    }
  }
}
```

### Example 2: COVID-19 Symptom Checker

```json
{
  "id": "{{APP_ID_UUID}}",
  "version": "0.3",
  "meta": {
    "name": "COVID Symptom Checker",
    "slug": "covid-checker",
    "description": "Daily health screening for employees and visitors",
    "orgId": "{{ORG_ID_UUID}}",
    "orgSlug": "{{ORG_SLUG}}"
  },
  "theme": {
    "preset": "healthcare-calm"
  },
  "roles": [
    { "id": "PATIENT", "authRequired": false },
    { "id": "STAFF", "authRequired": true, "routePrefix": "/staff" }
  ],
  "pages": [
    {
      "id": "screening",
      "route": "/",
      "role": "PATIENT",
      "type": "form",
      "title": "Daily Health Screening",
      "fields": [
        { "id": "fullName", "type": "text", "label": "Full Name", "required": true },
        { "id": "temperature", "type": "number", "label": "Temperature (F)", "required": true },
        { "id": "fever", "type": "radio", "label": "Fever in last 24 hours?", "required": true, "options": [
          { "value": "yes", "label": "Yes" },
          { "value": "no", "label": "No" }
        ]},
        { "id": "cough", "type": "radio", "label": "New or worsening cough?", "required": true, "options": [
          { "value": "yes", "label": "Yes" },
          { "value": "no", "label": "No" }
        ]},
        { "id": "breathing", "type": "radio", "label": "Difficulty breathing?", "required": true, "options": [
          { "value": "yes", "label": "Yes" },
          { "value": "no", "label": "No" }
        ]},
        { "id": "exposure", "type": "radio", "label": "Recent COVID exposure?", "required": true, "options": [
          { "value": "yes", "label": "Yes" },
          { "value": "no", "label": "No" }
        ]}
      ]
    },
    {
      "id": "result",
      "route": "/result",
      "role": "PATIENT",
      "type": "success",
      "title": "Screening Complete",
      "description": "Thank you for completing the health screening."
    },
    {
      "id": "staff-dashboard",
      "route": "/staff/inbox",
      "role": "STAFF",
      "type": "list",
      "title": "Daily Screenings"
    },
    {
      "id": "staff-detail",
      "route": "/staff/submission/[id]",
      "role": "STAFF",
      "type": "detail",
      "title": "Screening Details",
      "actions": [
        { "id": "clear", "label": "Cleared", "targetState": "APPROVED", "variant": "primary" },
        { "id": "flagged", "label": "Flag for Review", "targetState": "NEEDS_INFO", "requiresNote": true, "variant": "danger" }
      ]
    }
  ],
  "workflow": {
    "states": ["DRAFT", "SUBMITTED", "APPROVED", "NEEDS_INFO"],
    "initialState": "DRAFT",
    "transitions": [
      { "from": "DRAFT", "to": "SUBMITTED", "allowedRoles": ["PATIENT"] },
      { "from": "SUBMITTED", "to": "APPROVED", "allowedRoles": ["STAFF"] },
      { "from": "SUBMITTED", "to": "NEEDS_INFO", "allowedRoles": ["STAFF"] }
    ]
  },
  "api": {
    "baseUrl": "{{FASTFORM_API_URL}}",
    "endpoints": {
      "createSubmission": "POST /api/apps/:appId/submissions",
      "listSubmissions": "GET /api/apps/:appId/staff/inbox",
      "getSubmissionDetail": "GET /api/apps/:appId/staff/submissions/:id",
      "transitionSubmission": "POST /api/apps/:appId/staff/submissions/:id/transition",
      "trackEvent": "POST /api/apps/:appId/events"
    }
  },
  "analytics": {
    "events": [
      { "name": "screening_started", "trigger": "pageview", "page": "/" },
      { "name": "screening_submitted", "trigger": "submit", "page": "/" }
    ]
  },
  "environments": {
    "staging": {
      "domain": "covid-checker-{{ORG_SLUG}}-staging.getfastform.com",
      "apiUrl": "https://api-staging.getfastform.com"
    },
    "production": {
      "domain": "covid-checker-{{ORG_SLUG}}.getfastform.com",
      "apiUrl": "https://api.getfastform.com"
    }
  }
}
```

### Example 3: Insurance Pre-Authorization Request

```json
{
  "id": "{{APP_ID_UUID}}",
  "version": "0.3",
  "meta": {
    "name": "Insurance Pre-Auth",
    "slug": "pre-auth",
    "description": "Submit insurance pre-authorization requests",
    "orgId": "{{ORG_ID_UUID}}",
    "orgSlug": "{{ORG_SLUG}}"
  },
  "theme": {
    "preset": "healthcare-calm"
  },
  "roles": [
    { "id": "PATIENT", "authRequired": false },
    { "id": "STAFF", "authRequired": true, "routePrefix": "/staff" }
  ],
  "pages": [
    {
      "id": "start",
      "route": "/",
      "role": "PATIENT",
      "type": "welcome",
      "title": "Pre-Authorization Request",
      "description": "Submit a request for insurance pre-authorization"
    },
    {
      "id": "request-form",
      "route": "/request",
      "role": "PATIENT",
      "type": "form",
      "title": "Authorization Details",
      "fields": [
        { "id": "patientName", "type": "text", "label": "Patient Name", "required": true },
        { "id": "memberId", "type": "text", "label": "Insurance Member ID", "required": true },
        { "id": "insurancePayer", "type": "select", "label": "Insurance Payer", "required": true, "options": [
          { "value": "bcbs", "label": "Blue Cross Blue Shield" },
          { "value": "uhc", "label": "UnitedHealthcare" },
          { "value": "aetna", "label": "Aetna" },
          { "value": "cigna", "label": "Cigna" },
          { "value": "other", "label": "Other" }
        ]},
        { "id": "procedureCode", "type": "text", "label": "CPT Procedure Code", "required": true },
        { "id": "diagnosisCode", "type": "text", "label": "ICD-10 Diagnosis Code", "required": true },
        { "id": "clinicalRationale", "type": "textarea", "label": "Clinical Rationale", "required": true, "validation": [
          { "type": "minLength", "value": 50, "message": "Please provide at least 50 characters" }
        ]},
        { "id": "urgency", "type": "radio", "label": "Request Urgency", "required": true, "options": [
          { "value": "routine", "label": "Routine (10 business days)" },
          { "value": "urgent", "label": "Urgent (72 hours)" }
        ]}
      ]
    },
    {
      "id": "review",
      "route": "/review",
      "role": "PATIENT",
      "type": "review",
      "title": "Review Request"
    },
    {
      "id": "submitted",
      "route": "/submitted",
      "role": "PATIENT",
      "type": "success",
      "title": "Request Submitted",
      "description": "Your pre-authorization request has been submitted to the insurance payer."
    },
    {
      "id": "staff-queue",
      "route": "/staff/inbox",
      "role": "STAFF",
      "type": "list",
      "title": "Pre-Auth Queue"
    },
    {
      "id": "staff-detail",
      "route": "/staff/submission/[id]",
      "role": "STAFF",
      "type": "detail",
      "title": "Request Details",
      "actions": [
        { "id": "approve", "label": "Submit to Payer", "targetState": "APPROVED", "variant": "primary" },
        { "id": "return", "label": "Return for Revision", "targetState": "NEEDS_INFO", "requiresNote": true, "variant": "secondary" },
        { "id": "deny", "label": "Deny Request", "targetState": "REJECTED", "requiresNote": true, "variant": "danger" }
      ]
    }
  ],
  "workflow": {
    "states": ["DRAFT", "SUBMITTED", "NEEDS_INFO", "APPROVED", "REJECTED"],
    "initialState": "DRAFT",
    "transitions": [
      { "from": "DRAFT", "to": "SUBMITTED", "allowedRoles": ["PATIENT"] },
      { "from": "SUBMITTED", "to": "APPROVED", "allowedRoles": ["STAFF"] },
      { "from": "SUBMITTED", "to": "NEEDS_INFO", "allowedRoles": ["STAFF"] },
      { "from": "SUBMITTED", "to": "REJECTED", "allowedRoles": ["STAFF"] },
      { "from": "NEEDS_INFO", "to": "SUBMITTED", "allowedRoles": ["PATIENT"] }
    ]
  },
  "api": {
    "baseUrl": "{{FASTFORM_API_URL}}",
    "endpoints": {
      "createSubmission": "POST /api/apps/:appId/submissions",
      "getSubmission": "GET /api/apps/:appId/submissions/:id",
      "resubmitSubmission": "POST /api/apps/:appId/submissions/:id/resubmit",
      "listSubmissions": "GET /api/apps/:appId/staff/inbox",
      "getSubmissionDetail": "GET /api/apps/:appId/staff/submissions/:id",
      "transitionSubmission": "POST /api/apps/:appId/staff/submissions/:id/transition",
      "trackEvent": "POST /api/apps/:appId/events"
    }
  },
  "analytics": {
    "events": [
      { "name": "request_started", "trigger": "pageview", "page": "/" },
      { "name": "request_submitted", "trigger": "submit", "page": "/review" },
      { "name": "request_status_changed", "trigger": "transition" }
    ]
  },
  "environments": {
    "staging": {
      "domain": "pre-auth-{{ORG_SLUG}}-staging.getfastform.com",
      "apiUrl": "https://api-staging.getfastform.com"
    },
    "production": {
      "domain": "pre-auth-{{ORG_SLUG}}.getfastform.com",
      "apiUrl": "https://api.getfastform.com"
    }
  }
}
```

---

## Validation Rules and Best Practices

### Required Fields

Every AppSpec must include:
- Valid UUID for `id` (or placeholder `{{APP_ID_UUID}}`)
- Version `"0.3"`
- At least one page with `role: "PATIENT"`
- At least one workflow transition
- Complete `api.endpoints` configuration

### Common Validation Errors

**Error**: `Missing required field: meta.slug`
**Fix**: Add `slug` to `meta` object

**Error**: `Unsupported page type: wizard`
**Fix**: Use only supported page types (welcome, form, review, success, login, list, detail)

**Error**: `Invalid workflow transition: DRAFT to APPROVED`
**Fix**: Check `workflow.transitions` - ensure only defined transitions are allowed

**Error**: `Field type 'file' not supported in v1`
**Fix**: Use `textarea` for file URLs or defer to v2

### Performance Optimization

**Keep forms concise**: 5-15 fields per page for optimal UX
**Limit options**: Select/radio fields should have max 10 options
**Avoid deep nesting**: Conditional fields should be max 2 levels deep

### Security Best Practices

**Never include PHI in AppSpec**: AppSpec is committed to git - no patient data
**Use placeholders**: All UUIDs and URLs should be placeholders
**Validate server-side**: Client validation is UX - always enforce server-side

---

## Testing Your AppSpec

### Manual Validation

1. **JSON Syntax**: Validate with a JSON linter
2. **Schema Compliance**: Check all required fields present
3. **Workflow Logic**: Trace all possible state transitions
4. **Page Routes**: Ensure no duplicate routes

### Automated Validation

Use the Fastform CLI validator:

```bash
fastform validate-spec path/to/appspec.json
```

Expected output:
```
✓ Valid JSON syntax
✓ Schema version 0.3 recognized
✓ All required fields present
✓ Workflow transitions valid
✓ No unsupported features detected
```

### Integration Testing

After generating an app:

1. **Patient Flow**: Complete full intake submission
2. **Staff Flow**: Login, view submission, take action
3. **Resume Flow**: Request more info, patient resubmits
4. **Analytics**: Verify events tracked in backend

---

## Troubleshooting

### AppSpec Not Compiling

**Symptom**: Prompt compiler fails with validation error

**Diagnosis**:
1. Check schema version is `"0.3"`
2. Validate JSON syntax (no trailing commas, proper quotes)
3. Ensure all required fields present

**Solution**: Run `fastform validate-spec` to identify specific issues

### Generated App Missing Features

**Symptom**: v0 generates app without expected pages

**Diagnosis**:
1. Check page definitions in AppSpec
2. Verify prompt compiler output includes page instructions
3. Review v0 generation logs for errors

**Solution**: Ensure page `type` is one of the supported values

### Workflow Transitions Failing

**Symptom**: Backend rejects transition with 400 error

**Diagnosis**:
1. Check `workflow.transitions` in AppSpec
2. Verify transition is explicitly defined
3. Check `allowedRoles` matches current user role

**Solution**: Add missing transition to AppSpec and redeploy

---

## Reference: Complete Psych Intake Lite Template

For the canonical reference implementation, see:

```
docs/1-slice-spec.md (lines 314-489)
```

This template demonstrates all v1 features:
- Multi-role architecture (PATIENT + STAFF)
- 10-field intake form
- Resume/resubmit flow (NEEDS_INFO state)
- Staff actions with required notes
- Analytics event tracking
- Staging and production environments

---

## Additional Resources

- **Schema Reference**: `docs/1-slice-spec.md`
- **Prompt Compiler Source**: `lib/compiler/appspec-to-prompt.ts`
- **Validation Logic**: `lib/types/appspec.ts`
- **Backend API Spec**: `docs/1-slice-spec.md` (Layer 5)

For questions or feature requests, contact the Fastform team or open an issue in the repository.
