# Copilot Instructions for v0-clone

## Project Overview
This is a Next.js 15 (App Router) application that clones v0.dev functionality. It uses a hybrid architecture where user authentication and chat ownership are managed locally via PostgreSQL (Drizzle ORM), while actual chat content and generation are delegated to the `v0-sdk` / V0 API.

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
  - Generate: `npm run db:generate`
  - Apply: `npm run db:migrate`
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
- **Development**: `npm run dev` (uses `--turbopack`).
- **Database**: Always run `npm run db:generate` after modifying `schema.ts`.
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
- Run `npm test` before completing any task
- Never skip tests - they are mandatory, not optional

### Code Integration Rules
- Check package.json before importing any new libraries
- Read existing implementation files before modifying
- Follow established patterns in components/, lib/, and app/
- Preserve existing functionality - no breaking changes
- Run `npm run build` to verify type safety

### Verification Process
Before marking any task complete, you must:
1. Run `npm run build` - ensures no type errors
2. Run `npm run lint` - ensures code quality standards
3. Run `npm test` - ensures all tests pass
4. Test critical user flows manually if needed
5. Confirm no regressions in existing functionality

### AI-Specific Guidelines
- This project uses V0 SDK for AI functionality
- Database operations use Drizzle ORM
- Authentication uses NextAuth v5
- UI components use Radix UI primitives with Tailwind
- State management uses SWR and React Context