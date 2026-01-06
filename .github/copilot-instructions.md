# Copilot Instructions for v0-clone

## Project Overview
This is a Next.js 15 (App Router) application that clones fastform functionality. It uses a hybrid architecture where user authentication and chat ownership are managed locally via PostgreSQL (Drizzle ORM), while actual chat content and generation are delegated to the `v0-sdk` / V0 API.

## Tech Stack
- **Framework**: Next.js 15.5+ (App Router) with Turbopack
- **Language**: TypeScript
- **Database**: PostgreSQL, Drizzle ORM, Drizzle Kit
- **Auth**: NextAuth.js v5 (Beta)
- **UI**: Tailwind CSS, Radix UI primitives, Lucide React
- **AI/Chat**: Vercel AI SDK (`ai`), `v0-sdk`
- **State**: SWR, React Context

## Architecture & Data Flow
- **Hybrid Data Model**:
  - **Local DB (`lib/db/schema.ts`)**: Stores `users`, `chat_ownerships` (mapping local users to remote v0 chat IDs), and `anonymous_chat_logs` (for rate limiting).
  - **Remote API**: Chat history and generation logic reside in the V0 API, accessed via `v0-sdk`.
- **Chat API (`app/api/chat/route.ts`)**:
  - Handles message posting, streaming, and rate limiting.
  - Checks entitlements (logged-in vs anonymous) before forwarding requests to V0 API.
- **Frontend**:
  - `components/ai-elements/`: Specialized components for rendering AI artifacts (code blocks, reasoning, tool calls).
  - `components/ui/`: Reusable UI components (Shadcn-like).

## Key Conventions

### Database (Drizzle)
- **Schema**: Defined in `lib/db/schema.ts`.
- **Migrations**:
  - Generate: `pnpm db:generate`
  - Apply: `pnpm db:migrate`
- **Queries**: Located in `lib/db/queries.ts`. Prefer extracting complex queries there.

### UI Components
- Use `cn()` utility for class merging (Tailwind).
- Components in `components/ui` are low-level primitives.
- Components in `components/ai-elements` are specific to the chat interface.

### Authentication
- Uses NextAuth v5.
- Auth configuration in `app/(auth)/auth.ts` and `auth.config.ts`.
- Session provider wraps the app in `components/providers/session-provider.tsx`.

## Critical Workflows
- **Development**: `pnpm dev` (uses `--turbopack`).
- **Database**: Always run `pnpm db:generate` after modifying `schema.ts`.
- **Environment**: Ensure `.env` contains `POSTGRES_URL` and `V0_API_URL` (if using custom endpoint).

## Common Patterns
- **Rate Limiting**: Check `lib/entitlements.ts` for limits. Logic is in `app/api/chat/route.ts`.
- **Streaming**: Chat responses are streamed. Handle `streaming` flag in API routes.
- **Client-Side Fetching**: Use `swr` for data fetching where appropriate.

## File Structure Highlights
- `app/(auth)`: Auth-related routes and pages.
- `app/api/chat`: Chat API endpoints.
- `lib/db`: Database configuration, schema, and migrations.
- `components/ai-elements`: Rendering logic for AI responses (e.g., `code-block.tsx`, `reasoning.tsx`).

## Governance & Quality Assurance

### MANDATORY Testing Requirements
- ALL new components require corresponding test files
- ALL utility functions require unit tests
- ALL API route changes require integration tests
- Run `pnpm test` before completing any task
- Never skip tests - they are mandatory, not optional

### Code Integration Rules
- Check package.json before importing any new libraries
- Read existing implementation files before modifying
- Follow established patterns in components/, lib/, and app/
- Preserve existing functionality - no breaking changes
- Run `pnpm build` to verify type safety

### Verification Process
Before marking any task complete, you must:
1. Run `pnpm build` - ensures no type errors
2. Run `pnpm lint` - ensures code quality standards
3. Run `pnpm test` - ensures all tests pass
4. Test critical user flows manually if needed
5. Confirm no regressions in existing functionality

### AI-Specific Guidelines
- This project uses V0 SDK for AI functionality
- Database operations use Drizzle ORM
- Authentication uses NextAuth v5
- UI components use Radix UI primitives with Tailwind
- State management uses SWR and React Context


<!-- CLAVIX:START -->
# Clavix Instructions for GitHub Copilot

These instructions enhance GitHub Copilot's understanding of Clavix prompt optimization workflows available in this project.

---

## ⛔ CLAVIX MODE ENFORCEMENT

**CRITICAL: Know which mode you're in and STOP at the right point.**

**OPTIMIZATION workflows** (NO CODE ALLOWED):
- Fast/deep optimization - Prompt improvement only
- Your role: Analyze, optimize, show improved prompt, **STOP**
- ❌ DO NOT implement the prompt's requirements
- ✅ After showing optimized prompt, tell user: "Run `/clavix:implement --latest` to implement"

**PLANNING workflows** (NO CODE ALLOWED):
- Conversational mode, requirement extraction, PRD generation
- Your role: Ask questions, create PRDs/prompts, extract requirements
- ❌ DO NOT implement features during these workflows

**IMPLEMENTATION workflows** (CODE ALLOWED):
- Only after user runs execute/implement commands
- Your role: Write code, execute tasks, implement features
- ✅ DO implement code during these workflows

**If unsure, ASK:** "Should I implement this now, or continue with planning?"

See `.clavix/instructions/core/clavix-mode.md` for complete mode documentation.

---

## 📁 Detailed Workflow Instructions

For complete step-by-step workflows, see `.clavix/instructions/`:

| Workflow | Instruction File | Purpose |
|----------|-----------------|---------|
| **Conversational Mode** | `workflows/start.md` | Natural requirements gathering through discussion |
| **Extract Requirements** | `workflows/summarize.md` | Analyze conversation → mini-PRD + optimized prompts |
| **Prompt Optimization** | `workflows/improve.md` | Intent detection + quality assessment + auto-depth selection |
| **PRD Generation** | `workflows/prd.md` | Socratic questions → full PRD + quick PRD |
| **Mode Boundaries** | `core/clavix-mode.md` | Planning vs implementation distinction |

**Troubleshooting:**
- `troubleshooting/jumped-to-implementation.md` - If you started coding during planning
- `troubleshooting/skipped-file-creation.md` - If files weren't created
- `troubleshooting/mode-confusion.md` - When unclear about planning vs implementation

**When detected:** Reference the corresponding `.clavix/instructions/workflows/{workflow}.md` file.

**⚠️ GitHub Copilot Limitation:** If Write tool unavailable, provide file content with clear "save to" instructions for user.

---

## 📋 Clavix Commands (v5)

### Setup Commands (CLI)
| Command | Purpose |
|---------|---------|
| `clavix init` | Initialize Clavix in a project |
| `clavix update` | Update templates after package update |
| `clavix diagnose` | Check installation health |
| `clavix version` | Show version |

### Workflow Commands (Slash Commands)
All workflows are executed via slash commands:

| Slash Command | Purpose |
|---------------|---------|
| `/clavix:improve` | Optimize prompts (auto-selects depth) |
| `/clavix:prd` | Generate PRD through guided questions |
| `/clavix:plan` | Create task breakdown from PRD |
| `/clavix:implement` | Execute tasks or prompts (auto-detects source) |
| `/clavix:start` | Begin conversational session |
| `/clavix:summarize` | Extract requirements from conversation |

### Agentic Utilities (Project Management)
| Utility | Purpose |
|---------|---------|
| `/clavix:verify` | Check implementation against PRD requirements |
| `/clavix:archive` | Archive completed work to `.clavix/archive/` |

---

## 🔄 Prompt Lifecycle Workflow

**Prompt Lifecycle:**
1. **Optimize**: `/clavix:improve` → Analyzes and improves your prompt
2. **Review**: Agent reads `.clavix/outputs/prompts/*.md` to list saved prompts
3. **Execute**: `/clavix:implement --latest` → Implement when ready
4. **Cleanup**: Agent deletes old prompt files from `.clavix/outputs/prompts/`

---

## 🔄 Standard Workflow

**Clavix follows this progression:**

\`\`\`
PRD Creation → Task Planning → Implementation → Archive
\`\`\`

**Detailed steps:**

1. **Planning Phase** - `/clavix:prd` or `/clavix:start` → `/clavix:summarize`
2. **Task Preparation** - `/clavix:plan` transforms PRD into tasks.md
3. **Implementation Phase** - `/clavix:implement` executes tasks systematically
4. **Completion** - `/clavix:archive` archives completed work

**Key principle:** Planning workflows create documents. Implementation workflows write code.

---

## 🎯 Quality Dimensions

When analyzing prompts, consider these 5 dimensions:

- **Clarity**: Is the objective clear and unambiguous?
- **Efficiency**: Concise without losing critical information?
- **Structure**: Information organized logically (context → requirements → constraints → output)?
- **Completeness**: All specs provided (persona, format, tone, success criteria)?
- **Actionability**: Can AI take immediate action?

**Reference:** See `workflows/improve.md` for complete quality assessment patterns

---

## 💡 Best Practices for GitHub Copilot

1. **Suggest appropriate workflow** - `/clavix:improve` for prompts, `/clavix:prd` for strategic planning
2. **Reference instruction files** - Point to `.clavix/instructions/workflows/*.md` instead of recreating steps
3. **Respect mode boundaries** - Planning mode = no code, Implementation mode = write code
4. **Use quality dimensions** - Apply 5-dimension assessment principles in responses
5. **Guide users to slash commands** - Recommend appropriate `/clavix:*` commands for their needs

---

## ⚠️ Common Mistakes

### ❌ Jumping to implementation during planning
**Wrong:** User discusses feature → Copilot generates code immediately

**Right:** User discusses feature → Suggest `/clavix:prd` or `/clavix:start` → Create planning docs first

### ❌ Not suggesting Clavix workflows
**Wrong:** User asks "How should I phrase this?" → Copilot provides generic advice

**Right:** User asks "How should I phrase this?" → Suggest `/clavix:improve` for quality assessment

### ❌ Recreating workflow steps inline
**Wrong:** Copilot explains entire PRD generation process in chat

**Right:** Copilot references `.clavix/instructions/workflows/prd.md` and suggests running `/clavix:prd`

---

## 🔗 Integration with GitHub Copilot

When users ask for help with prompts or requirements:

1. **Detect need** - Identify if user needs planning, optimization, or implementation
2. **Suggest slash command** - Recommend appropriate `/clavix:*` command
3. **Explain benefit** - Describe expected output and value
4. **Help interpret** - Assist with understanding Clavix-generated outputs
5. **Apply principles** - Use quality dimensions in your responses

**Example flow:**
\`\`\`
User: "I want to build a dashboard but I'm not sure how to phrase the requirements"
Copilot: "I suggest running `/clavix:start` to begin conversational requirements gathering.
This will help us explore your needs naturally, then we can extract structured requirements
with `/clavix:summarize`. Alternatively, if you have a rough idea, try:
`/clavix:improve 'Build a dashboard for...'` for quick optimization."
\`\`\`

---

**Artifacts stored under `.clavix/`:**
- `.clavix/outputs/<project>/` - PRDs, tasks, prompts
- `.clavix/config.json` - Project configuration

---

**For complete workflows:** Always reference `.clavix/instructions/workflows/{workflow}.md`

**For troubleshooting:** Check `.clavix/instructions/troubleshooting/`

**For mode clarification:** See `.clavix/instructions/core/clavix-mode.md`

<!-- CLAVIX:END -->
