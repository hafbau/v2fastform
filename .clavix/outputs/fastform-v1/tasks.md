# Implementation Plan: Fastform v1

**Project**: fastform-v1
**Generated**: 2026-01-08T09:00:00Z

## Technical Context & Standards

*Detected Stack & Patterns*

- **Framework**: Next.js 16.1.1 (App Router)
- **Runtime**: React 19.2.3
- **Styling**: TailwindCSS 4 + Radix UI components
- **Database**: Drizzle ORM + PostgreSQL (Vercel Postgres)
- **Auth**: NextAuth 5.0 (beta.30)
- **AI Integration**: v0 SDK 0.15.3, @ai-sdk/react
- **Data Fetching**: SWR
- **Testing**: Vitest, Playwright
- **Package Manager**: pnpm
- **Conventions**:
  - File naming: kebab-case
  - Component exports: default for pages, named for utilities
  - API routes: POST/GET in route.ts files
  - Server actions: use 'server-only' import
  - Types: co-located with implementation or in lib/types/

---

## Phase 1: Foundation - AppSpec Schema & Database

### Database Schema

- [x] **Add `spec` JSONB column to apps table** (ref: Technical Constraints)
  Task ID: `phase-1-foundation-01`
  > **Implementation**: Edit `lib/db/schema.ts`
  > **Details**:
  > - Import `jsonb` from `drizzle-orm/pg-core`
  > - Add `spec: jsonb('spec').notNull().default('{}')` to `apps` table definition
  > - Run `pnpm db:generate` to create migration
  > - Run `pnpm db:push` to apply to database
  > - Update `App` type export to include `spec: unknown`

### TypeScript Types

- [x] **Create AppSpec TypeScript interfaces** (ref: Architecture Decisions)
  Task ID: `phase-1-foundation-02`
  > **Implementation**: Create `lib/types/appspec.ts`
  > **Details**:
  > - Copy `FastformAppSpec` interface from `docs/1-slice-spec.md` (lines 92-106)
  > - Include all sub-interfaces: `AppMeta`, `ThemeConfig`, `Role`, `Page`, `Field`, etc.
  > - Export all types with JSDoc comments
  > - Validate against v0.3 schema version
  > - Include type guards: `isValidAppSpec(obj: unknown): obj is FastformAppSpec`

- [x] **Create Psych Intake Lite template** (ref: Template-Based Initialization)
  Task ID: `phase-1-foundation-03`
  > **Implementation**: Create `lib/templates/psych-intake-lite.ts`
  > **Details**:
  > - Export `const PSYCH_INTAKE_TEMPLATE: FastformAppSpec`
  > - Copy structure from `docs/1-slice-spec.md` (Psych Intake Lite example)
  > - Include all pages: welcome, intake form (10 fields), review, success, staff login, inbox, detail
  > - Define workflow states: DRAFT → SUBMITTED → NEEDS_INFO/APPROVED/REJECTED
  > - Use placeholder orgId/slug (will be replaced by LLM)
  > **Completed**: 2026-01-08 | 69 tests passing

---

## Phase 2: LLM Integration - Intent → AppSpec

### Azure OpenAI / Anthropic Client

- [ ] **Create LLM client wrapper with Azure fallback** (ref: Azure-First with Fallback)
  Task ID: `phase-2-llm-01`
  > **Implementation**: Create `lib/ai/llm-client.ts`
  > **Details**:
  > - Check for `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_KEY` env vars
  > - If present, use Azure OpenAI client (add `openai` npm package)
  > - Otherwise fallback to `OPENAI_API_KEY` (direct OpenAI) or `ANTHROPIC_API_KEY`
  > - Export `generateAppSpec(userIntent: string, conversationHistory: Message[]): Promise<FastformAppSpec>`
  > - Use structured output (JSON mode) to guarantee valid AppSpec JSON
  > - Include system prompt: "You are a healthcare app spec generator. Given user intent, produce a FastformAppSpec JSON matching the v0.3 schema."

- [ ] **Create AppSpec generator service** (ref: Chat-to-AppSpec Pipeline)
  Task ID: `phase-2-llm-02`
  > **Implementation**: Create `lib/ai/appspec-generator.ts`
  > **Details**:
  > - Import `PSYCH_INTAKE_TEMPLATE` and `generateAppSpec` from llm-client
  > - Export `async function createDraftAppSpec(intent: string, history: Message[]): Promise<FastformAppSpec>`
  > - Workflow:
  >   1. Load Psych Intake Lite template
  >   2. Call LLM with template + user intent
  >   3. LLM adjusts template fields/pages/workflow based on intent
  >   4. Validate output against AppSpec schema
  >   5. Return draft (not persisted)
  > - Export `async function regenerateAppSpec(currentSpec: FastformAppSpec, newMessage: string): Promise<FastformAppSpec>` for iterations

### Name/Slug Generation

- [x] **Heuristic name/slug generator** (ref: App Name/Slug Generation)
  Task ID: `phase-2-llm-03`
  > **Implementation**: Create `lib/utils/app-naming.ts`
  > **Details**:
  > - Export `function generateHeuristicName(intent: string): { name: string, slug: string }`
  > - Logic:
  >   - Strip common prefixes ("I need a", "Build me a", "Create a")
  >   - Title-case for name
  >   - Slugify for slug (lowercase, hyphens, no special chars)
  >   - Truncate to reasonable lengths (name: 50 chars, slug: 30 chars)
  > - This runs instantly before LLM call
  > - LLM refines these in AppSpec meta
  > **Completed**: 2026-01-08 | Commit: c1bd0af

---

## Phase 3: Prompt Compiler - AppSpec → v0 Prompt

### Prompt Compilation

- [ ] **Create deterministic AppSpec → Prompt compiler** (ref: AppSpec-Driven Generation)
  Task ID: `phase-3-compiler-01`
  > **Implementation**: Create `lib/compiler/appspec-to-prompt.ts`
  > **Details**:
  > - Export `function compileAppSpecToPrompt(spec: FastformAppSpec): string`
  > - Generate natural language prompt from AppSpec structure:
  >   - "Build a Next.js healthcare app named {spec.meta.name}"
  >   - "Include these pages: [enumerate spec.pages with fields/actions]"
  >   - "Workflow states: [enumerate spec.workflow.states]"
  >   - "Use theme: {spec.theme.preset}"
  >   - "CONSTRAINTS: No external UI libraries. No form libraries. Use Server Actions for mutations. CamelCase Postgres columns."
  > - Deterministic: same AppSpec → identical prompt (no timestamps, no randomness)
  > - Include post-processing instructions in prompt footer

- [ ] **Add validation for unsupported features** (ref: Unsupported Features Blocked)
  Task ID: `phase-3-compiler-02`
  > **Implementation**: Edit `lib/compiler/appspec-to-prompt.ts`
  > **Details**:
  > - Before compilation, validate AppSpec against v1 supported capabilities
  > - Check: page types (only welcome/form/review/success/login/list/detail allowed)
  > - Check: field types (only text/email/tel/date/textarea/select/radio/checkbox/number)
  > - Check: single workflow (no multi-step approvals)
  > - If unsupported detected, throw `UnsupportedAppSpecFeatureError` with suggestion
  > - Error message: "Feature X is not supported in v1. Try Y instead."

---

## Phase 4: Chat UI - Intent Confirmation & Iteration

### Intent Confirmation Component

- [ ] **Create rich intent confirmation chat message component** (ref: Intent Confirmation Flow)
  Task ID: `phase-4-chat-ui-01`
  > **Implementation**: Create `components/chat/intent-confirmation.tsx`
  > **Details**:
  > - Component props: `{ draftSpec: FastformAppSpec, onConfirm: () => void, onRefine: () => void }`
  > - UI structure:
  >   - Title: "Here's what I'm about to build:"
  >   - Feature preview (list spec.pages, key fields, workflow states, roles)
  >   - Editable app name (default from spec.meta.name)
  >   - Editable URL slug (default from spec.meta.slug)
  >   - Action buttons: "Confirm & Build" | "Let me describe more..."
  > - Use Radix Dialog for richer layout (optional)
  > - On confirm: call `onConfirm()`, persist AppSpec to DB
  > - On refine: close component, user continues chat

### Chat API Modifications

- [ ] **Extend `/api/chat` to handle AppSpec generation** (ref: Chat-to-AppSpec Pipeline)
  Task ID: `phase-4-chat-ui-02`
  > **Implementation**: Edit `app/api/chat/route.ts`
  > **Details**:
  > - Import `createDraftAppSpec`, `regenerateAppSpec` from `lib/ai/appspec-generator`
  > - New logic in POST handler:
  >   - If first message in new chat (no chatId):
  >     1. Call `createDraftAppSpec(message, [])`
  >     2. Store draft in memory (use session or temp storage, **not** DB yet)
  >     3. Return special response with `{ type: 'intent-confirmation', draftSpec: ... }`
  >     4. Frontend renders `<IntentConfirmation>` component
  >   - If user continues chatting before confirming:
  >     1. Retrieve draft from memory
  >     2. Call `regenerateAppSpec(draft, newMessage)`
  >     3. Update draft in memory
  >     4. Return updated draft
  > - Use existing v0 SDK for preview generation (unchanged)

- [ ] **Add AppSpec persistence endpoint** (ref: Draft AppSpec in Memory)
  Task ID: `phase-4-chat-ui-03`
  > **Implementation**: Create `app/api/apps/[appId]/appspec/route.ts`
  > **Details**:
  > - POST handler: persist draft AppSpec to `apps.spec` column
  > - Validate user owns the app (check `app.userId === session.user.id`)
  > - Update Drizzle query: `db.update(apps).set({ spec: draftSpec }).where(eq(apps.id, appId))`
  > - Return success + trigger prompt compilation
  > - This endpoint called when user clicks "Confirm & Build"

### Frontend Integration

- [ ] **Update `ChatDetailClient` to handle intent confirmation** (ref: Intent Confirmation Flow)
  Task ID: `phase-4-chat-ui-04`
  > **Implementation**: Edit `components/chats/chat-detail-client.tsx`
  > **Details**:
  > - In `useChat` hook, check for response type `intent-confirmation`
  > - If detected, render `<IntentConfirmation>` instead of regular message
  > - On confirm: POST to `/api/apps/[appId]/appspec`, then show "Building..." state
  > - On refine: hide confirmation, user continues typing in chat input
  > - After confirmation persisted, trigger v0 generation flow

---

## Phase 5: Deployment Pipeline - GitHub & Vercel

### GitHub Integration

- [ ] **Create GitHub repo manager** (ref: GitHub as Registry)
  Task ID: `phase-5-deploy-01`
  > **Implementation**: Create `lib/deploy/github-repo.ts`
  > **Details**:
  > - Install `@octokit/rest` npm package
  > - Create Octokit client with `GITHUB_TOKEN` env var (PAT with repo:write)
  > - Export `async function createAppRepo(userId: string, appSlug: string): Promise<{ repoUrl: string }>`
  > - Repo naming: `getfastform/{userId.slice(0,8)}-{appSlug}`
  > - Initialize with README, .gitignore (Node.js template)
  > - Create `staging` and `main` branches
  > - Return repo URL

- [ ] **Create post-processor for invariant file injection** (ref: Implicit Requirements - Post-processing)
  Task ID: `phase-5-deploy-02`
  > **Implementation**: Create `lib/deploy/post-processor.ts`
  > **Details**:
  > - Export `function injectInvariants(v0GeneratedCode: string): string`
  > - Invariant files to inject (create in `lib/deploy/invariants/`):
  >   - `fastformClient.ts`: API client pointing to central Fastform backend
  >   - `analytics.ts`: Event tracking integration
  >   - `auth-middleware.ts`: Magic link auth + session validation
  >   - `middleware.ts`: Route protection based on role
  > - Logic:
  >   - Parse v0 output directory structure
  >   - Insert invariant files in appropriate locations (`lib/`, `middleware.ts`)
  >   - Update imports in generated components to use `fastformClient`
  >   - Return modified file tree as string

### Vercel Deployment

- [ ] **Create Vercel deployment service** (ref: Staging-First Deploy)
  Task ID: `phase-5-deploy-03`
  > **Implementation**: Create `lib/deploy/vercel-deploy.ts`
  > **Details**:
  > - Vercel auto-deploys via GitHub App integration (no API calls needed)
  > - Export `async function triggerStagingDeploy(appId: string): Promise<{ stagingUrl: string }>`
  > - Workflow:
  >   1. Get AppSpec from DB
  >   2. Compile to prompt via `compileAppSpecToPrompt`
  >   3. Call v0 SDK to generate code
  >   4. Post-process with `injectInvariants`
  >   5. Commit to GitHub `staging` branch via Octokit
  >   6. Vercel GitHub App auto-deploys (webhook)
  >   7. Poll Vercel API for deployment status (use `VERCEL_TOKEN`)
  >   8. Return staging URL: `{appSlug}-staging.getfastform.com`
  > - Store deployment status in DB (new table: `deployments`)

- [ ] **Create production promotion service** (ref: Production Promotion)
  Task ID: `phase-5-deploy-04`
  > **Implementation**: Edit `lib/deploy/vercel-deploy.ts`
  > **Details**:
  > - Export `async function promoteToProduction(appId: string): Promise<{ productionUrl: string }>`
  > - Workflow:
  >   1. Merge `staging` → `main` via Octokit (create PR + auto-merge)
  >   2. Vercel auto-deploys main branch
  >   3. Poll for deployment completion
  >   4. Return production URL: `{appSlug}.getfastform.com`
  > - Add guard: only allow promotion if staging deploy succeeded

### UI for Deploy Actions

- [ ] **Add "Deploy to Staging" button to chat UI** (ref: Staging-First Deploy)
  Task ID: `phase-5-deploy-05`
  > **Implementation**: Edit `components/chats/chat-detail-client.tsx`
  > **Details**:
  > - Show button after AppSpec confirmed and v0 preview ready
  > - Button UI: "Deploy to Staging 🚀" (disabled while deploying)
  > - On click: POST to `/api/apps/[appId]/deploy/staging`
  > - Show deployment progress: "Pushing to GitHub... Deploying to Vercel... ✅ Live at [URL]"
  > - Use polling or websockets to update status

- [ ] **Add "Promote to Production" button** (ref: Production Promotion)
  Task ID: `phase-5-deploy-06`
  > **Implementation**: Edit `components/chats/chat-detail-client.tsx`
  > **Details**:
  > - Show after successful staging deploy
  > - Button UI: "Promote to Production" (with confirmation dialog)
  > - Dialog warning: "This will make your app publicly accessible. Continue?"
  > - On confirm: POST to `/api/apps/[appId]/deploy/production`
  > - Show production URL after successful deployment

### API Endpoints

- [ ] **Create staging deployment endpoint** (ref: Staging-First Deploy)
  Task ID: `phase-5-deploy-07`
  > **Implementation**: Create `app/api/apps/[appId]/deploy/staging/route.ts`
  > **Details**:
  > - POST handler
  > - Validate user owns app
  > - Call `triggerStagingDeploy(appId)`
  > - Return `{ status: 'deploying', url: null }` immediately (async)
  > - Background job updates status → client polls `/api/apps/[appId]/deployments`

- [ ] **Create production deployment endpoint** (ref: Production Promotion)
  Task ID: `phase-5-deploy-08`
  > **Implementation**: Create `app/api/apps/[appId]/deploy/production/route.ts`
  > **Details**:
  > - POST handler
  > - Validate user owns app + staging deploy exists and succeeded
  > - Call `promoteToProduction(appId)`
  > - Return production URL on success

---

## Phase 6: Central Multi-Tenant Backend

### Backend API Schema

- [x] **Create submissions table for generated apps** (ref: Central Multi-Tenant Backend)
  Task ID: `phase-6-backend-01`
  > **Implementation**: Edit `lib/db/schema.ts`
  > **Details**:
  > - Add new table:
  >   ```ts
  >   export const submissions = pgTable('submissions', {
  >     id: uuid('id').primaryKey().defaultRandom(),
  >     appId: uuid('appId').references(() => apps.id).notNull(),
  >     data: jsonb('data').notNull(), // AppSpec-validated form data
  >     status: varchar('status', { length: 20 }).notNull(), // SUBMITTED, NEEDS_INFO, APPROVED, REJECTED
  >     createdAt: timestamp('createdAt').defaultNow().notNull(),
  >     updatedAt: timestamp('updatedAt').defaultNow().notNull(),
  >   })
  >   ```
  > - Run `pnpm db:generate && pnpm db:push`
  > **Completed**: 2026-01-08 | Commit: cfc7d9e0f195

- [ ] **Create submission validation service** (ref: AppSpec-driven behavior)
  Task ID: `phase-6-backend-02`
  > **Implementation**: Create `lib/backend/validate-submission.ts`
  > **Details**:
  > - Export `function validateSubmissionAgainstAppSpec(data: Record<string, unknown>, spec: FastformAppSpec): { valid: boolean, errors: string[] }`
  > - Logic:
  >   - Extract required fields from spec.pages (where type === 'form')
  >   - Check all required fields present in data
  >   - Validate field types match (email regex, number type, etc.)
  >   - Check select/radio options are valid choices
  > - Return validation errors if any

### Backend API Endpoints

- [ ] **Create submission API for generated apps** (ref: Central Multi-Tenant Backend)
  Task ID: `phase-6-backend-03`
  > **Implementation**: Create `app/api/apps/[appId]/submissions/route.ts`
  > **Details**:
  > - POST handler: Create submission
  >   - Validate request against AppSpec (use `validateSubmissionAgainstAppSpec`)
  >   - Insert into `submissions` table with `status: 'SUBMITTED'`
  >   - Return submission ID
  > - GET handler: List submissions (staff only)
  >   - Filter by status (query param: `?status=SUBMITTED`)
  >   - Paginated response
  >   - Return array of submissions

- [ ] **Create submission detail & actions API** (ref: Workflow state machine)
  Task ID: `phase-6-backend-04`
  > **Implementation**: Create `app/api/apps/[appId]/submissions/[submissionId]/route.ts`
  > **Details**:
  > - GET handler: Fetch submission by ID
  > - PATCH handler: Update submission status
  >   - Body: `{ status: 'APPROVED' | 'REJECTED' | 'NEEDS_INFO', notes?: string }`
  >   - Validate transition allowed per AppSpec.workflow
  >   - Update `submissions.status` and `submissions.updatedAt`
  > - Generate resume link when status → NEEDS_INFO: `/resume/[submissionId]`

### Resume Flow

- [ ] **Create resume endpoint for NEEDS_INFO state** (ref: NEEDS_INFO resume loop)
  Task ID: `phase-6-backend-05`
  > **Implementation**: Create `app/api/apps/[appId]/resume/[submissionId]/route.ts`
  > **Details**:
  > - GET handler: Load existing submission data
  >   - Validate submission exists and status === 'NEEDS_INFO'
  >   - Return submission data for form pre-fill
  > - PATCH handler: Resubmit updated data
  >   - Validate against AppSpec
  >   - Update `submissions.data` and set `status` back to 'SUBMITTED'

---

## Phase 7: Auth & Magic Links

### Magic Link Implementation

- [ ] **Add magic link provider to NextAuth** (ref: Injected Auth Module)
  Task ID: `phase-7-auth-01`
  > **Implementation**: Edit `app/(auth)/auth.ts`
  > **Details**:
  > - Add `Email` provider from `next-auth/providers/email`
  > - Configure with Nodemailer (already in package.json)
  > - Email templates: Use minimal HTML for magic link
  > - Store verification tokens in DB (NextAuth handles this)
  > - Set token expiry: 15 minutes

- [ ] **Create email service for magic links** (ref: Magic link default)
  Task ID: `phase-7-auth-02`
  > **Implementation**: Create `lib/auth/email-service.ts`
  > **Details**:
  > - Use Nodemailer to send emails
  > - SMTP config from env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
  > - Email template:
  >   - Subject: "Sign in to [App Name]"
  >   - Body: "Click here to sign in: [magic link]"
  >   - Link expires in 15 minutes

### Auth Middleware for Generated Apps

- [ ] **Create injectable auth middleware** (ref: Always injected)
  Task ID: `phase-7-auth-03`
  > **Implementation**: Create `lib/deploy/invariants/auth-middleware.ts`
  > **Details**:
  > - Export Next.js middleware function
  > - Check session via `fastform_session` cookie
  > - Validate JWT signature (shared secret with Fastform backend)
  > - Protect routes based on role (from AppSpec):
  >   - If route starts with `/staff`, require STAFF role
  >   - If route is public (welcome, intake), allow anonymous
  > - Redirect to `/login` if unauthorized

---

## Phase 8: Testing & Validation

### Unit Tests

- [ ] **Test AppSpec validation** (ref: AppSpec is source of truth)
  Task ID: `phase-8-testing-01`
  > **Implementation**: Create `lib/types/appspec.test.ts`
  > **Details**:
  > - Test `isValidAppSpec` with valid and invalid inputs
  > - Test schema version mismatch
  > - Test required fields missing

- [ ] **Test prompt compiler determinism** (ref: Deterministic compilation)
  Task ID: `phase-8-testing-02`
  > **Implementation**: Create `lib/compiler/appspec-to-prompt.test.ts`
  > **Details**:
  > - Generate prompt from Psych Intake Lite template
  > - Call twice with same input, assert identical output
  > - Test prompt includes all required constraints

- [ ] **Test submission validation** (ref: Backend validates against AppSpec)
  Task ID: `phase-8-testing-03`
  > **Implementation**: Create `lib/backend/validate-submission.test.ts`
  > **Details**:
  > - Valid submission data → passes
  > - Missing required field → fails
  > - Invalid email format → fails
  > - Wrong select option → fails

### Integration Tests

- [ ] **Test full chat → AppSpec → v0 flow** (ref: Success Criteria #1-3)
  Task ID: `phase-8-testing-04`
  > **Implementation**: Create `test/integration/chat-to-appspec.test.ts`
  > **Details**:
  > - Mock LLM responses
  > - Send chat message via API
  > - Assert draft AppSpec returned
  > - Confirm AppSpec
  > - Assert v0 preview generated

- [ ] **Test staging deploy flow** (ref: Success Criteria #4-5)
  Task ID: `phase-8-testing-05`
  > **Implementation**: Create `test/integration/deploy-staging.test.ts`
  > **Details**:
  > - Mock GitHub API (Octokit)
  > - Mock Vercel API
  > - Trigger staging deploy
  > - Assert repo created, code committed, deployment triggered

---

## Phase 9: Environment & Configuration

### Environment Variables

- [x] **Document required environment variables** (ref: Technical implementation)
  Task ID: `phase-9-config-01`
  > **Implementation**: Update `.env.example`
  > **Details**:
  > - Add:
  >   ```
  >   # Azure OpenAI (preferred)
  >   AZURE_OPENAI_ENDPOINT=https://...
  >   AZURE_OPENAI_KEY=...
  >
  >   # Fallback: Direct OpenAI
  >   OPENAI_API_KEY=sk-...
  >
  >   # Fallback: Anthropic
  >   ANTHROPIC_API_KEY=sk-ant-...
  >
  >   # GitHub
  >   GITHUB_TOKEN=ghp_... # PAT with repo:write for getfastform org
  >
  >   # Vercel
  >   VERCEL_TOKEN=... # For deployment status checks
  >
  >   # Email (Nodemailer)
  >   SMTP_HOST=smtp.gmail.com
  >   SMTP_PORT=587
  >   SMTP_USER=...
  >   SMTP_PASS=...
  >
  >   # Existing (keep)
  >   V0_API_URL=...
  >   POSTGRES_URL=...
  >   NEXTAUTH_SECRET=...
  >   ```

### Deployment Config

- [x] **Create Vercel project configuration** (ref: Vercel integration)
  Task ID: `phase-9-config-02`
  > **Implementation**: Create `vercel.json`
  > **Details**:
  > - Configure environment variables per branch:
  >   - `staging` branch → staging env vars
  >   - `main` branch → production env vars
  > - Set build command: `pnpm build`
  > - Set output directory: `.next`

---

## Phase 10: Documentation & Handoff

### Developer Documentation

- [x] **Create architecture documentation** (ref: Architecture Decisions)
  Task ID: `phase-10-docs-01`
  > **Implementation**: Create `docs/architecture.md`
  > **Details**:
  > - Document:
  >   - AppSpec schema and versioning
  >   - Chat → AppSpec → v0 → Deploy pipeline
  >   - Central multi-tenant backend design
  >   - GitHub + Vercel deployment flow
  >   - Auth injection for generated apps
  > - Include diagrams (Mermaid or ASCII)

- [x] **Create AppSpec development guide** (ref: Template-based initialization)
  Task ID: `phase-10-docs-02`
  > **Implementation**: Create `docs/appspec-guide.md`
  > **Details**:
  > - How to create new templates (beyond Psych Intake Lite)
  > - Schema validation rules
  > - Supported vs unsupported features (v1 vs future)
  > - Example AppSpecs for different healthcare use cases

---

*Generated by Clavix /clavix:plan*
