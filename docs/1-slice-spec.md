### 1) AppSpec vs App (quick, clear)

**No — an AppSpec is not the same thing as an app.**
In Fastform, an **AppSpec is the canonical, versioned config that *describes* an app**, and Fastform uses it to *generate* a deployable mini-app (via v0) plus wire it to your backend.

So:

* **AppSpec** = the “source” (like TypeScript types / a DSL / a template instance)
* **Generated mini-app** = the “binary” (a Next.js codebase deployed to Vercel)

You *can* think of AppSpec as a “template instance” (your wording) — but it’s more precise to treat it as **per-app canonical truth**, not a generic reusable template. The template is just a *way to produce* an AppSpec.

You said you prefer **UUID** for app identity — agreed, and applied below.

---

# ✅ Full unabridged fixed spec (v0.3)

```markdown
# Fastform Vertical Slice v0.3 (Fixed)

## Slice: "Psych Intake Lite" — Patient Submission + Staff Review + Patient Resume Loop

This slice proves the full loop: patient fills form → staff reviews → decision made → (if NEEDS_INFO) patient resumes and resubmits.

---

## What This Slice Proves

| Capability | How It's Tested |
|------------|-----------------|
| AppSpec is source of truth | One JSON drives everything |
| Multi-role apps work | Patient pages + Staff pages |
| Prompt compilation is deterministic | Same spec → same prompt |
| v0 codegen produces buildable code | Deploy succeeds |
| Post-processing injects invariants | Auth, analytics, API client work |
| Workflow state machine | Transitions enforced server-side |
| NEEDS_INFO resume loop | Staff requests info → patient resumes → resubmits |
| Staging → Prod promotion | Both environments deploy correctly |
| Runtime data flows correctly | Submissions appear in staff inbox |
| Analytics captured | Events logged per interaction |

---

## User Experience

### Patient Flow (new + resume)

```

/start                → Welcome + consent checkbox
/intake               → 10-field intake form (new submission draft client-side)
/review               → Patient confirms summary
/submitted            → "Thank you, we'll be in touch"

/resume/[id]          → Resume intake after NEEDS_INFO (loads server data)
/resume/[id]/review   → Review & resubmit

```

### Staff Flow

```

/staff/login           → Simple auth (email + password for slice)
/staff/inbox           → List of submissions, filterable by status
/staff/submission/[id] → View details + take action + copy resume link (when NEEDS_INFO)

```

### Workflow States

```

CLIENT-ONLY: DRAFT (form in progress, not persisted)

SERVER:
SUBMITTED → NEEDS_INFO → SUBMITTED
→ APPROVED
→ REJECTED

````

Notes:
- `DRAFT` exists in the workflow model as conceptual initial state, but is not persisted server-side in this slice.
- Server creates/updates submissions only on submit/resubmit.

---

## Layer 1: FastformAppSpec v0.3

```typescript
// types/appspec.ts

interface FastformAppSpec {
  id: string;                 // UUID (string)
  version: "0.3";
  meta: AppMeta;
  theme: ThemeConfig;
  roles: Role[];
  pages: Page[];
  workflow: WorkflowConfig;
  api: ApiConfig;
  analytics: AnalyticsConfig;
  environments: EnvironmentConfig;
}

// ─────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────

interface AppMeta {
  name: string;
  slug: string;
  description: string;
  orgId: string;              // UUID (string)
  orgSlug: string;
}

// ─────────────────────────────────────────────
// Theme
// ─────────────────────────────────────────────

interface ThemeConfig {
  preset: "healthcare-calm";
  logo?: string;
  colors?: {
    primary?: string;
    background?: string;
    text?: string;
  };
}

// ─────────────────────────────────────────────
// Roles
// ─────────────────────────────────────────────

interface Role {
  id: "PATIENT" | "STAFF";
  authRequired: boolean;
  routePrefix?: string;  // e.g., "/staff"
}

// ─────────────────────────────────────────────
// Pages
// ─────────────────────────────────────────────

interface Page {
  id: string;
  route: string;
  role: "PATIENT" | "STAFF";
  type: PageType;
  title: string;
  description?: string;
  fields?: Field[];       // for form pages
  actions?: Action[];     // for review/detail pages
}

type PageType = 
  | "welcome"      // consent + start
  | "form"         // input fields
  | "review"       // confirm before submit/resubmit
  | "success"      // post-submit
  | "login"        // staff auth
  | "list"         // inbox/table view
  | "detail";      // single submission view

// ─────────────────────────────────────────────
// Fields
// ─────────────────────────────────────────────

interface Field {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: Option[];
  condition?: Condition;
  validation?: ValidationRule[];
}

type FieldType = 
  | "text" 
  | "email" 
  | "tel" 
  | "date" 
  | "textarea" 
  | "select" 
  | "radio" 
  | "checkbox"
  | "number";

interface Option {
  value: string;
  label: string;
}

interface Condition {
  field: string;
  operator: "equals" | "not_equals" | "exists";
  value?: string | boolean;
}

interface ValidationRule {
  type: "minLength" | "maxLength" | "pattern" | "min" | "max";
  value: string | number;
  message: string;
}

// ─────────────────────────────────────────────
// Actions (for staff pages)
// ─────────────────────────────────────────────

interface Action {
  id: string;
  label: string;
  targetState: WorkflowState;
  requiresNote?: boolean;
  variant: "primary" | "secondary" | "danger";
}

// ─────────────────────────────────────────────
// Workflow
// ─────────────────────────────────────────────

interface WorkflowConfig {
  states: WorkflowState[];
  initialState: WorkflowState;   // conceptual initial (DRAFT)
  transitions: Transition[];
}

type WorkflowState = 
  | "DRAFT" 
  | "SUBMITTED" 
  | "NEEDS_INFO" 
  | "APPROVED" 
  | "REJECTED";

interface Transition {
  from: WorkflowState | WorkflowState[];
  to: WorkflowState;
  allowedRoles: ("PATIENT" | "STAFF")[];
}

// ─────────────────────────────────────────────
// API (endpoints the generated app will call)
// ─────────────────────────────────────────────

interface ApiConfig {
  // Runtime base URL is always read from env var NEXT_PUBLIC_FASTFORM_API_URL.
  // This value exists as a placeholder for prompt compilation only.
  baseUrl: "{{FASTFORM_API_URL}}";

  endpoints: {
    // Patient endpoints
    createSubmission: "POST /api/apps/:appId/submissions";
    getSubmission: "GET /api/apps/:appId/submissions/:id";
    resubmitSubmission: "POST /api/apps/:appId/submissions/:id/resubmit";

    // Staff auth endpoints (required for generated staff login)
    staffLogin: "POST /api/apps/:appId/staff/login";
    staffLogout: "POST /api/apps/:appId/staff/logout";
    staffSession: "GET /api/apps/:appId/staff/session";
    
    // Staff endpoints
    listSubmissions: "GET /api/apps/:appId/staff/inbox";
    getSubmissionDetail: "GET /api/apps/:appId/staff/submissions/:id";
    transitionSubmission: "POST /api/apps/:appId/staff/submissions/:id/transition";
    
    // Analytics
    trackEvent: "POST /api/apps/:appId/events";
  };
}

// ─────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────

interface AnalyticsConfig {
  events: AnalyticsEvent[];
}

interface AnalyticsEvent {
  name: string;
  trigger: "pageview" | "action" | "submit" | "transition";
  page?: string;
}

// ─────────────────────────────────────────────
// Environments
// ─────────────────────────────────────────────

interface EnvironmentConfig {
  // Authority:
  // - environments.*.apiUrl is used by the deploy pipeline to set NEXT_PUBLIC_FASTFORM_API_URL
  // - api.baseUrl remains a prompt placeholder; the generated app must NOT hardcode it
  staging: {
    domain: "{{APP_SLUG}}-{{ORG_SLUG}}-staging.getfastform.com";
    apiUrl: "https://api-staging.getfastform.com";
  };
  production: {
    domain: "{{APP_SLUG}}-{{ORG_SLUG}}.getfastform.com";
    apiUrl: "https://api.getfastform.com";
  };
}
````

---

## Layer 2: Sample AppSpec Instance (Updated)

```json
{
  "id": "{{APP_ID_UUID}}",
  "version": "0.3",
  "meta": {
    "name": "Psych Intake Lite",
    "slug": "psych-intake",
    "description": "Quick mental health intake for new patients",
    "orgId": "{{ORG_ID_UUID}}",
    "orgSlug": "{{ORG_SLUG}}"
  },
  "theme": {
    "preset": "healthcare-calm",
    "logo": "{{ORG_LOGO_URL}}"
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
      "title": "Welcome",
      "description": "Thank you for choosing us for your care.",
      "fields": [
        { "id": "consent", "type": "checkbox", "label": "I agree to the terms and privacy policy", "required": true }
      ]
    },
    {
      "id": "intake",
      "route": "/intake",
      "role": "PATIENT",
      "type": "form",
      "title": "Tell Us About Yourself",
      "fields": [
        { "id": "firstName", "type": "text", "label": "First Name", "required": true },
        { "id": "lastName", "type": "text", "label": "Last Name", "required": true },
        { "id": "dob", "type": "date", "label": "Date of Birth", "required": true },
        { "id": "email", "type": "email", "label": "Email", "required": true },
        { "id": "phone", "type": "tel", "label": "Phone", "required": true },
        { "id": "state", "type": "select", "label": "State of Residence", "required": true, "options": [
          { "value": "CA", "label": "California" },
          { "value": "NY", "label": "New York" },
          { "value": "TX", "label": "Texas" },
          { "value": "FL", "label": "Florida" },
          { "value": "OTHER", "label": "Other" }
        ]},
        { "id": "seekingHelp", "type": "textarea", "label": "What brings you to seek help today?", "required": true },
        { "id": "previousTherapy", "type": "radio", "label": "Have you seen a therapist before?", "required": true, "options": [
          { "value": "yes", "label": "Yes" },
          { "value": "no", "label": "No" }
        ]},
        { "id": "currentMedications", "type": "textarea", "label": "List any current medications", "required": false },
        { "id": "emergencyContact", "type": "text", "label": "Emergency Contact Name & Phone", "required": true }
      ]
    },
    {
      "id": "review",
      "route": "/review",
      "role": "PATIENT",
      "type": "review",
      "title": "Review Your Information",
      "description": "Please confirm everything looks correct."
    },
    {
      "id": "submitted",
      "route": "/submitted",
      "role": "PATIENT",
      "type": "success",
      "title": "Thank You!",
      "description": "We've received your intake. Our team will review and reach out within 24-48 hours."
    },

    {
      "id": "resume",
      "route": "/resume/[id]",
      "role": "PATIENT",
      "type": "form",
      "title": "Resume Your Intake",
      "description": "Please update your information and resubmit."
    },
    {
      "id": "resume-review",
      "route": "/resume/[id]/review",
      "role": "PATIENT",
      "type": "review",
      "title": "Review & Resubmit",
      "description": "Please confirm everything looks correct before resubmitting."
    },

    {
      "id": "staff-login",
      "route": "/staff/login",
      "role": "STAFF",
      "type": "login",
      "title": "Staff Login"
    },
    {
      "id": "staff-inbox",
      "route": "/staff/inbox",
      "role": "STAFF",
      "type": "list",
      "title": "Intake Inbox",
      "description": "Review and process patient submissions"
    },
    {
      "id": "staff-detail",
      "route": "/staff/submission/[id]",
      "role": "STAFF",
      "type": "detail",
      "title": "Submission Details",
      "actions": [
        { "id": "approve", "label": "Approve", "targetState": "APPROVED", "variant": "primary" },
        { "id": "request-info", "label": "Request More Info", "targetState": "NEEDS_INFO", "requiresNote": true, "variant": "secondary" },
        { "id": "reject", "label": "Reject", "targetState": "REJECTED", "requiresNote": true, "variant": "danger" }
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
      { "from": "NEEDS_INFO", "to": "SUBMITTED", "allowedRoles": ["PATIENT"] },
      { "from": "NEEDS_INFO", "to": "REJECTED", "allowedRoles": ["STAFF"] }
    ]
  },
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
  },
  "analytics": {
    "events": [
      { "name": "intake_started", "trigger": "pageview", "page": "/" },
      { "name": "intake_form_viewed", "trigger": "pageview", "page": "/intake" },
      { "name": "intake_reviewed", "trigger": "pageview", "page": "/review" },
      { "name": "intake_submitted", "trigger": "submit", "page": "/review" },

      { "name": "intake_resumed", "trigger": "pageview", "page": "/resume/[id]" },
      { "name": "intake_resume_reviewed", "trigger": "pageview", "page": "/resume/[id]/review" },
      { "name": "intake_resubmitted", "trigger": "submit", "page": "/resume/[id]/review" },

      { "name": "staff_inbox_viewed", "trigger": "pageview", "page": "/staff/inbox" },
      { "name": "staff_submission_viewed", "trigger": "pageview", "page": "/staff/submission/[id]" },
      { "name": "submission_transitioned", "trigger": "transition" }
    ]
  },
  "environments": {
    "staging": {
      "domain": "psych-intake-{{ORG_SLUG}}-staging.getfastform.com",
      "apiUrl": "https://api-staging.getfastform.com"
    },
    "production": {
      "domain": "psych-intake-{{ORG_SLUG}}.getfastform.com",
      "apiUrl": "https://api.getfastform.com"
    }
  }
}
```

---

## Layer 3: Prompt Compiler

### Strategy

The prompt is split into sections. Each section is templated from the AppSpec.

```typescript
// compiler/prompt-compiler.ts

export function compilePrompt(spec: FastformAppSpec): string {
  return `
${renderSystemContext()}

${renderHardConstraints()}

${renderDesignRequirements(spec.theme)}

${renderPages(spec.pages, spec.roles)}

${renderWorkflow(spec.workflow)}

${renderApiIntegration(spec.api)}

${renderAnalytics(spec.analytics)}

${renderFileStructure(spec)}

${renderRuntimePlaceholders()}
`.trim();
}
```

### Compiled Prompt (for Psych Intake Lite) — Updated

````markdown
# Task

Generate a Next.js 14 healthcare intake application with patient-facing forms, a staff review dashboard, and a patient resume/resubmit flow for NEEDS_INFO submissions.

---

## Hard Constraints (DO NOT VIOLATE)

- Next.js 14 with App Router (app/ directory)
- TypeScript strict mode
- Tailwind CSS only (no other styling libraries)
- No external form libraries (no react-hook-form, no formik)
- No external UI component libraries (no shadcn, no radix, no chakra)
- Use React useState/useReducer for form state
- Use native HTML form validation
- All API calls go through the provided fastformClient (you will receive this file)
- All analytics calls go through the provided analytics module (you will receive this file)
- File structure must match EXACTLY as specified below
- Do NOT create auth logic; you will receive middleware and auth modules
- Do NOT hardcode API base URLs; use process.env.NEXT_PUBLIC_FASTFORM_API_URL only

---

## Design Requirements

Theme: Healthcare Calm

Colors:
- Background: #F0F8FF (Alice Blue)
- Primary CTA: #7FFFD4 (Aquamarine)
- Secondary: #E0E7FF (soft indigo)
- Danger: #FEE2E2 (soft red)
- Text primary: #1F2937 (gray-800)
- Text secondary: #6B7280 (gray-500)
- Borders: #E5E7EB (gray-200)

Typography:
- Font: Inter (import from Google Fonts)
- Headings: font-semibold
- Body: font-normal

Spacing & Shape:
- Border radius: rounded-xl for cards, rounded-lg for inputs/buttons
- Shadows: shadow-sm for cards
- Padding: p-8 for page containers, p-6 for cards, p-4 for inputs
- Max width: max-w-xl for patient pages, max-w-6xl for staff pages
- Center patient pages, full-width staff pages

Logo: Render {{ORG_LOGO_URL}} at top of patient pages if provided.

---

## Pages to Generate

### Patient Pages (public, no auth)

**Page: / (Welcome)**
Type: welcome
- Display welcome message: "Thank you for choosing us for your care."
- Consent checkbox: "I agree to the terms and privacy policy" (required)
- "Get Started" button → navigates to /intake
- Track event: intake_started on page load

**Page: /intake (Form - new submission)**
Type: form
Title: "Tell Us About Yourself"
Fields:
1. firstName (text, required): "First Name"
2. lastName (text, required): "Last Name"
3. dob (date, required): "Date of Birth"
4. email (email, required): "Email"
5. phone (tel, required): "Phone"
6. state (select, required): "State of Residence" — options: California, New York, Texas, Florida, Other
7. seekingHelp (textarea, required): "What brings you to seek help today?"
8. previousTherapy (radio, required): "Have you seen a therapist before?" — Yes/No
9. currentMedications (textarea, optional): "List any current medications"
10. emergencyContact (text, required): "Emergency Contact Name & Phone"

- "Back" returns to /
- "Continue" validates and navigates to /review
- Store form data in React state (passed to review via context)
- Track event: intake_form_viewed on page load

**Page: /review (Review - new submission)**
Type: review
Title: "Review Your Information"
- Display all field values in read-only format
- "Edit" button returns to /intake with data preserved
- "Submit" button:
  - Call fastformClient.createSubmission(payload)
  - On success: redirect to /submitted and show confirmation number (submissionId)
  - On error: show error message, allow retry
- Track event: intake_reviewed on page load
- Track event: intake_submitted on successful submit

**Page: /submitted (Success)**
Type: success
Title: "Thank You!"
Message: "We've received your intake. Our team will review and reach out within 24-48 hours."
- Show confirmation number (submissionId) if available

---

### Patient Resume Pages (public, no auth; accessed via a link/token provided out-of-band)

**Page: /resume/[id] (Form - resume)**
Type: form
Title: "Resume Your Intake"
- Load existing submission data using fastformClient.getSubmission(id)
- Display a small banner if status is NEEDS_INFO: "More information requested. Please update and resubmit."
- Pre-fill the form with existing values
- "Continue" navigates to /resume/[id]/review
- Track event: intake_resumed on page load

**Page: /resume/[id]/review (Review - resubmit)**
Type: review
Title: "Review & Resubmit"
- Display updated values in read-only format
- "Edit" returns to /resume/[id] with data preserved
- "Resubmit" button:
  - Call fastformClient.resubmitSubmission(id, payload)
  - On success: redirect to /submitted
  - On error: show error, allow retry
- Track event: intake_resume_reviewed on page load
- Track event: intake_resubmitted on successful resubmit

---

### Staff Pages (protected, require auth)

**Page: /staff/login (Login)**
Type: login
- Email + password fields
- Submit calls auth module's login function
- On success: redirect to /staff/inbox
- On error: show error message
- Simple form, no registration

**Page: /staff/inbox (List)**
Type: list
Title: "Intake Inbox"
- Fetch submissions from listSubmissions endpoint
- Display as table:
  - Columns: Name, Email, Submitted At, Status, Actions
  - Click row → navigate to /staff/submission/[id]
- Filter tabs: All | Submitted | Needs Info | Approved | Rejected
- Track event: staff_inbox_viewed on page load

**Page: /staff/submission/[id] (Detail)**
Type: detail
Title: "Submission Details"
- Fetch full submission from getSubmissionDetail endpoint
- Display all fields in read-only card format
- Show current status badge
- Action buttons:
  - "Approve" (primary) → transitions to APPROVED
  - "Request More Info" (secondary) → opens note modal → transitions to NEEDS_INFO
  - "Reject" (danger) → opens note modal → transitions to REJECTED
- When status is NEEDS_INFO:
  - Display "Patient Resume Link" section:
    - read-only input with resume URL returned by the transition API response (or fetched from detail)
    - "Copy link" button
- Display transition history / audit log
- Track event: staff_submission_viewed on page load
- Track event: submission_transitioned on each action

---

## Workflow Rules (for reference only — enforced server-side)

States: DRAFT, SUBMITTED, NEEDS_INFO, APPROVED, REJECTED

The generated app should:
- Display current status as a badge
- Only show valid action buttons based on current status
- SUBMITTED → can Approve, Request Info, or Reject
- NEEDS_INFO → can Reject (staff) OR patient can resubmit (patient) via resume pages

Do NOT implement transition validation in frontend. The API will reject invalid transitions.

---

## API Integration

The generated app will receive a pre-built `lib/fastformClient.ts` that exports:

```typescript
export const fastformClient = {
  // Patient
  createSubmission(data: SubmissionData): Promise<{ id: string; status: "SUBMITTED" }>,
  getSubmission(id: string): Promise<Submission>,
  resubmitSubmission(id: string, data: SubmissionData): Promise<{ id: string; status: "SUBMITTED" }>,

  // Staff
  listSubmissions(filters?: { status?: string }): Promise<SubmissionListItem[]>,
  getSubmissionDetail(id: string): Promise<SubmissionDetail>,
  transitionSubmission(id: string, toState: string, note?: string): Promise<{ status: string; resumeUrl?: string }>,
};
````

Use this client for ALL API calls. Do not use fetch directly.

---

## Analytics Integration

The generated app will receive a pre-built `lib/analytics.ts` that exports:

```typescript
export const analytics = {
  track(eventName: string, properties?: Record<string, any>): void,
  page(pageName: string): void,
};
```

Call `analytics.page()` in useEffect on each page mount.
Call `analytics.track()` for specific actions (submit, resubmit, transition, etc.).

---

## Required File Structure

Generate ONLY these files:

```
app/
  layout.tsx
  page.tsx
  intake/
    page.tsx
  review/
    page.tsx
  submitted/
    page.tsx
  resume/
    [id]/
      page.tsx
      review/
        page.tsx
  staff/
    login/
      page.tsx
    inbox/
      page.tsx
    submission/
      [id]/
        page.tsx
  globals.css

components/
  ui/
    Button.tsx
    Input.tsx
    Textarea.tsx
    Select.tsx
    RadioGroup.tsx
    Checkbox.tsx
    Card.tsx
    Badge.tsx
    Modal.tsx

  patient/
    ProgressIndicator.tsx
    FieldRenderer.tsx
    ReviewCard.tsx

  staff/
    SubmissionTable.tsx
    SubmissionDetail.tsx
    ActionButtons.tsx
    TransitionHistory.tsx
    ResumeLinkBox.tsx

lib/
  types.ts

contexts/
  FormContext.tsx

tailwind.config.ts
```

DO NOT generate:

* lib/fastformClient.ts (will be injected)
* lib/analytics.ts (will be injected)
* lib/auth.ts (will be injected)
* middleware.ts (will be injected)

---

## Environment Variables (reference only)

The app will use these env vars (injected at deploy time):

* NEXT_PUBLIC_FASTFORM_API_URL
* NEXT_PUBLIC_APP_ID
* NEXT_PUBLIC_ORG_ID

Do not hardcode any values. Reference via process.env.NEXT_PUBLIC_*.

---

## Final Checklist

Before outputting, verify:

* [ ] All pages listed are generated
* [ ] All components listed are generated
* [ ] No external UI libraries imported
* [ ] No external form libraries imported
* [ ] All API calls use fastformClient
* [ ] All analytics use analytics module
* [ ] No auth logic implemented (middleware handles it)
* [ ] Mobile-responsive layouts
* [ ] Accessible form labels and error states

```

---

## Layer 4: Post-Processing (Injected Files) — Updated

After v0 returns files, inject these invariant modules:

### Files to Inject

```

lib/
fastformClient.ts
analytics.ts
auth.ts
middleware.ts
.env.example
fastform.json

````

### Session/Cookie Requirements (Critical Fix)

- The backend must set a cookie named `fastform_session`
- Cookie must be:
  - httpOnly
  - secure
  - sameSite=Lax (or Strict)
  - signed (tamper-evident)
- Middleware only checks presence for redirect UX.
- Backend APIs must enforce session validity server-side on all staff endpoints.

### lib/fastformClient.ts (Updated + aligned payload shapes)

```typescript
const API_URL = process.env.NEXT_PUBLIC_FASTFORM_API_URL;
const APP_ID = process.env.NEXT_PUBLIC_APP_ID;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_URL}${path.replace(':appId', APP_ID!)}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Request failed');
  }

  // Allow 204 no-content responses
  if (res.status === 204) return undefined as T;

  return res.json();
}

export const fastformClient = {
  // Patient
  createSubmission: (data: Record<string, any>) =>
    request<{ id: string; status: "SUBMITTED" }>(`/api/apps/:appId/submissions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSubmission: (id: string) =>
    request<{ id: string; data: Record<string, any>; status: string; createdAt: string; updatedAt: string }>(
      `/api/apps/:appId/submissions/${id}`
    ),

  resubmitSubmission: (id: string, data: Record<string, any>) =>
    request<{ id: string; status: "SUBMITTED" }>(`/api/apps/:appId/submissions/${id}/resubmit`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Staff
  listSubmissions: (filters?: { status?: string }) => {
    const params = new URLSearchParams(filters as any).toString();
    const suffix = params ? `?${params}` : '';
    return request<Array<{ id: string; patientName: string; email: string; status: string; createdAt: string }>>(
      `/api/apps/:appId/staff/inbox${suffix}`
    );
  },

  getSubmissionDetail: (id: string) =>
    request<{
      id: string;
      data: Record<string, any>;
      status: string;
      createdAt: string;
      updatedAt: string;
      transitions: Array<{ from: string; to: string; by: string | null; note: string | null; at: string }>;
      resumeUrl?: string | null;
    }>(`/api/apps/:appId/staff/submissions/${id}`),

  transitionSubmission: (id: string, toState: string, note?: string) =>
    request<{ status: string; resumeUrl?: string }>(`/api/apps/:appId/staff/submissions/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ toState, note }),
    }),
};
````

### lib/analytics.ts (Aligned)

```typescript
const API_URL = process.env.NEXT_PUBLIC_FASTFORM_API_URL;
const APP_ID = process.env.NEXT_PUBLIC_APP_ID;

export const analytics = {
  track: async (eventName: string, properties?: Record<string, any>) => {
    try {
      await fetch(`${API_URL}/api/apps/${APP_ID}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventName,
          properties,
          timestamp: new Date().toISOString(),
        }),
        credentials: 'include',
      });
    } catch (e) {
      // Best-effort only
      console.error('Analytics error:', e);
    }
  },

  page: (pageName: string) => {
    analytics.track('page_view', { page: pageName });
  },
};
```

### lib/auth.ts (Aligned; endpoints exist in ApiConfig now)

```typescript
const API_URL = process.env.NEXT_PUBLIC_FASTFORM_API_URL;
const APP_ID = process.env.NEXT_PUBLIC_APP_ID;

export const auth = {
  login: async (email: string, password: string): Promise<{ success: boolean }> => {
    const res = await fetch(`${API_URL}/api/apps/${APP_ID}/staff/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });
    return { success: res.ok };
  },

  logout: async (): Promise<void> => {
    await fetch(`${API_URL}/api/apps/${APP_ID}/staff/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  },

  getSession: async (): Promise<{ user: { id: string; email: string; name?: string } } | null> => {
    try {
      const res = await fetch(`${API_URL}/api/apps/${APP_ID}/staff/session`, {
        credentials: 'include',
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },
};
```

### middleware.ts (Clarified + unchanged behavior)

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect /staff routes (except login)
  if (pathname.startsWith('/staff') && !pathname.startsWith('/staff/login')) {
    const sessionCookie = request.cookies.get('fastform_session');

    if (!sessionCookie) {
      const loginUrl = new URL('/staff/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/staff/:path*',
};
```

### fastform.json (metadata)

```json
{
  "generatedAt": "{{TIMESTAMP}}",
  "appId": "{{APP_ID_UUID}}",
  "orgId": "{{ORG_ID_UUID}}",
  "specVersion": "0.3",
  "generatorVersion": "1.0.0",
  "v0ChatId": "{{V0_CHAT_ID}}"
}
```

---

## Layer 5: Backend API Contract (Aligned + Resume)

### Endpoints

```yaml
# Patient (public)
POST /api/apps/:appId/submissions
  Request: Record<string, any>
  Response: { id: string, status: "SUBMITTED" }

GET /api/apps/:appId/submissions/:id
  Response: { id: string, data: Record<string, any>, status: string, createdAt: string, updatedAt: string }

POST /api/apps/:appId/submissions/:id/resubmit
  Request: Record<string, any>
  Response: { id: string, status: "SUBMITTED" }

# Staff (authenticated)
POST /api/apps/:appId/staff/login
  Request: { email: string, password: string }
  Response: 200 + Set-Cookie(fastform_session) | 401

POST /api/apps/:appId/staff/logout
  Response: 200 + Clear-Cookie

GET /api/apps/:appId/staff/session
  Response: { user: { id: string, email: string, name?: string } } | 401

GET /api/apps/:appId/staff/inbox
  Query: ?status=SUBMITTED|NEEDS_INFO|APPROVED|REJECTED
  Response: [{ id: string, patientName: string, email: string, status: string, createdAt: string }]

GET /api/apps/:appId/staff/submissions/:id
  Response:
    {
      id: string,
      data: Record<string, any>,
      status: string,
      createdAt: string,
      updatedAt: string,
      transitions: [{ from: string, to: string, by: string|null, note: string|null, at: string }],
      resumeUrl?: string|null
    }

POST /api/apps/:appId/staff/submissions/:id/transition
  Request: { toState: string, note?: string }
  Response: { status: string, resumeUrl?: string }  # resumeUrl is returned when transitioning to NEEDS_INFO

# Analytics
POST /api/apps/:appId/events
  Request: { eventName: string, properties?: Record<string, any>, timestamp: string, submissionId?: string }
  Response: 204
```

Notes:

* `resumeUrl` is intended to be shared out-of-band (email/SMS) by staff.
* For the slice, `resumeUrl` can be a simple route like `/resume/{id}`. In a hardened version you’d include a token.

---

## Database Schema (minimal) — CamelCase quoted columns (Critical Fix)

```sql
-- Table names can remain snake_case. Column names must be camelCase and quoted.

CREATE TABLE apps (
  "id" UUID PRIMARY KEY,
  "orgId" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "spec" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE app_deployments (
  "id" UUID PRIMARY KEY,
  "appId" UUID REFERENCES apps("id"),
  "environment" TEXT NOT NULL, -- 'staging' | 'production'
  "vercelProjectId" TEXT,
  "vercelDeploymentId" TEXT,
  "url" TEXT,
  "deployedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE submissions (
  "id" UUID PRIMARY KEY,
  "appId" UUID REFERENCES apps("id"),
  "data" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE submission_transitions (
  "id" UUID PRIMARY KEY,
  "submissionId" UUID REFERENCES submissions("id"),
  "fromState" TEXT NOT NULL,
  "toState" TEXT NOT NULL,
  "triggeredBy" UUID, -- staff user id, null for patient
  "note" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE app_events (
  "id" UUID PRIMARY KEY,
  "appId" UUID REFERENCES apps("id"),
  "submissionId" UUID REFERENCES submissions("id"),
  "eventName" TEXT NOT NULL,
  "properties" JSONB,
  "timestamp" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE staff_users (
  "id" UUID PRIMARY KEY,
  "orgId" UUID NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Layer 6: Deploy Pipeline (Updated for UUID appId + env authority)

### Orchestrator

```typescript
// pipeline/generate.ts

interface GenerateRequest {
  spec: FastformAppSpec;
  orgConfig: {
    id: string;   // UUID
    slug: string;
    logoUrl?: string;
  };
  environment: 'staging' | 'production';
}

async function generateAndDeploy(req: GenerateRequest): Promise<DeployResult> {
  // 1. Compile spec → prompt
  const prompt = compilePrompt(req.spec);

  // 2. Call v0 Platform API
  const v0Response = await v0.chats.create({
    model: 'v0-1.0-md',
    messages: [{ role: 'user', content: prompt }],
    stream: false,
  });

  // 3. Extract files
  const rawFiles = extractFiles(v0Response);

  // 4. Post-process: inject invariant files
  const apiUrl = req.environment === 'staging'
    ? req.spec.environments.staging.apiUrl
    : req.spec.environments.production.apiUrl;

  const files = await postProcess(rawFiles, {
    appId: req.spec.id,          // UUID
    orgId: req.orgConfig.id,     // UUID
    apiUrl,
  });

  // 5. Store in registry
  await registry.store({
    appId: req.spec.id,
    specVersion: req.spec.version,
    files,
    generatedAt: new Date().toISOString(),
  });

  // 6. Deploy to Vercel
  const projectName = `${req.spec.meta.slug}-${req.orgConfig.slug}-${req.environment}`;
  const domain = req.environment === 'staging'
    ? `${req.spec.meta.slug}-${req.orgConfig.slug}-staging.getfastform.com`
    : `${req.spec.meta.slug}-${req.orgConfig.slug}.getfastform.com`;

  const deployment = await deployToVercel({
    projectName,
    files,
    envVars: {
      NEXT_PUBLIC_FASTFORM_API_URL: apiUrl,
      NEXT_PUBLIC_APP_ID: req.spec.id,
      NEXT_PUBLIC_ORG_ID: req.orgConfig.id,
    },
    domain,
  });

  // 7. Record deployment
  await db.appDeployments.create({
    appId: req.spec.id,
    environment: req.environment,
    vercelProjectId: deployment.projectId,
    vercelDeploymentId: deployment.deploymentId,
    url: deployment.url,
  });

  return deployment;
}
```

---

## Minimal Fastform UI (Authoring)

### Flow

```
1. "Create New App"
   └─ Select template: "Psych Intake Lite"
   └─ Enter app name + slug
   └─ Click "Generate"

2. Generation Progress
   └─ Compiling spec...
   └─ Generating with v0...
   └─ Post-processing...
   └─ Deploying to staging...
   └─ ✅ Complete

3. App Dashboard
   └─ Staging URL: [link]
   └─ [Promote to Production] button
   └─ Submissions: [link to internal view]
```

No drag-and-drop. No fancy editor. Just template → generate → deploy.

---

## Success Criteria

* [ ] Compile spec → prompt works deterministically
* [ ] v0 returns all required files
* [ ] Post-processing injects invariants correctly
* [ ] Staging deploy works, app loads
* [ ] Patient can complete intake (all pages)
* [ ] Submission appears in database
* [ ] Staff can log in (cookie issued)
* [ ] Staff inbox shows submission
* [ ] Staff can approve/reject/request info
* [ ] NEEDS_INFO generates resumeUrl
* [ ] Patient can resume and resubmit
* [ ] Transitions recorded in audit log
* [ ] Analytics events recorded
* [ ] Promote to production works
* [ ] Total generation time < 3 minutes

---

## What's Explicitly Deferred

| Feature                                     | Why Deferred                    |
| ------------------------------------------- | ------------------------------- |
| Drag-and-drop editor                        | Not needed to prove pipeline    |
| Custom field types (file upload, signature) | Complexity                      |
| EHR integrations                            | Needs external APIs             |
| Multi-language                              | i18n adds scope                 |
| Custom domains per org                      | DNS complexity                  |
| Regeneration by scope                       | v0 iterative chat needed        |
| SSO / SAML                                  | Enterprise feature              |
| Hardened resume tokens                      | Security hardening beyond slice |

---

## Deliverable Files

```
fastform-slice-v0.3/
├── docs/
│   └── agent-briefing.md
├── types/
│   └── appspec.ts
├── samples/
│   └── psych-intake-lite.json
├── compiler/
│   └── prompt-compiler.ts
│   └── templates/
│       └── prompt-template.md
├── postprocess/
│   └── index.ts
│   └── injected/
│       ├── fastformClient.ts
│       ├── analytics.ts
│       ├── auth.ts
│       └── middleware.ts
├── deploy/
│   └── vercel.ts
├── pipeline/
│   └── generate.ts
├── api/
│   └── openapi.yaml
├── db/
│   └── schema.sql
└── README.md
```

```