# Implementation Plan

**Project**: chat-first-ux
**Generated**: 2026-01-07T17:20:00Z

## Technical Context & Standards
*Detected Stack & Patterns*
- **Framework**: Next.js 14+ (App Router with route groups `(app)`, `(auth)`)
- **Styling**: Tailwind CSS + shadcn/ui primitives
- **State**: SWR for data fetching (`useSWR`)
- **Auth**: NextAuth v5 beta (`useSession` from `next-auth/react`, `auth()` server-side)
- **Conventions**: `'use client'` directive, kebab-case files, component-per-file

---

## Phase 1: Auth Modal Component

- [x] **Create AuthRequiredModal component** (ref: Anonymous User Flow)
  Task ID: phase-1-auth-modal-01
  > **Implementation**: Create `components/shared/auth-required-modal.tsx`
  > **Details**:
  > - Use `Dialog` from `@/components/ui/dialog`
  > - Props: `open: boolean`, `onOpenChange: (open: boolean) => void`
  > - Content: "Sign up or sign in to continue" message
  > - Two buttons: "Sign In" (links to `/login`), "Sign Up" (links to `/register`)
  > - Both buttons should preserve current URL as `callbackUrl` query param
  > - Export as named export `AuthRequiredModal`

---

## Phase 2: Apps Page Refactor

- [x] **Refactor AppsListClient to chat-first layout** (ref: /apps Page Refactor)
  Task ID: phase-2-apps-page-01
  > **Implementation**: Edit `components/apps/apps-list-client.tsx`
  > **Details**:
  > - Import `useSession` from `next-auth/react`
  > - Import `ChatInput` from `@/components/chat/chat-input`
  > - Import `AuthRequiredModal` from `@/components/shared/auth-required-modal`
  > - Add state: `message`, `setMessage`, `attachments`, `setAttachments`, `showAuthModal`
  > - Conditionally fetch apps: only call `useSWR('/api/apps')` if `session?.user` exists
  > - Remove: `showCreateForm` state, `handleCreateApp` function, create form JSX, "New App" button
  > - Layout structure:
  >   1. Top: ChatInput with custom `onSubmit` handler
  >   2. Bottom: "Your apps" section (only renders if `apps.length > 0` AND user is authenticated)
  > - No empty state for apps - if no apps, just don't render the section

- [x] **Implement onSubmit handler for /apps page** (ref: /apps Page Refactor)
  Task ID: phase-2-apps-page-02
  > **Implementation**: Edit `components/apps/apps-list-client.tsx`
  > **Details**:
  > - `handleSubmit` function checks `session?.user`:
  >   - If NO session: `setShowAuthModal(true)` and return (do not submit)
  >   - If HAS session: proceed with app+chat creation
  > - App creation flow (when authenticated):
  >   1. Extract app name from message (first 50 chars, or use helper `generateAppName(message)`)
  >   2. POST to `/api/apps` with `{ name }`
  >   3. POST to `/api/chat` with `{ message, appId: newApp.id, streaming: true }`
  >   4. Redirect to `/apps/${appId}/chats/${chatId}` using `router.push()`
  > - Import `useRouter` from `next/navigation`

- [x] **Add generateAppName utility** (ref: Edge Cases)
  Task ID: phase-2-apps-page-03
  > **Implementation**: Create `lib/utils/generate-app-name.ts`
  > **Details**:
  > - Export function `generateAppName(message: string): string`
  > - Logic: Take first 50 characters, trim whitespace
  > - If message is very short (< 3 chars), use "Untitled App"
  > - Remove trailing incomplete words if truncated mid-word

---

## Phase 3: Chats Page Refactor

- [x] **Refactor ChatsClient to chat-first layout** (ref: /apps/:appId/chats Page Refactor)
  Task ID: phase-3-chats-page-01
  > **Implementation**: Edit `components/chats/chats-client.tsx`
  > **Details**:
  > - Import `ChatInput` from `@/components/chat/chat-input`
  > - Import `useRouter` from `next/navigation`
  > - Add state: `message`, `setMessage`, `attachments`, `setAttachments`, `isLoading`
  > - Remove: "New Chat" Link button (both in header and empty state)
  > - Layout structure:
  >   1. Top: ChatInput component
  >   2. Bottom: "Chats" list section (keep existing grid, change to list layout)
  > - Change grid to list: Replace `grid grid-cols-1 md:grid-cols-2...` with vertical list layout

- [x] **Implement onSubmit handler for /apps/:appId/chats page** (ref: /apps/:appId/chats Page Refactor)
  Task ID: phase-3-chats-page-02
  > **Implementation**: Edit `components/chats/chats-client.tsx`
  > **Details**:
  > - `handleSubmit` function:
  >   1. POST to `/api/chat` with `{ message, appId, streaming: true }`
  >   2. Extract `chatId` from response
  >   3. Redirect to `/apps/${appId}/chats/${chatId}` using `router.push()`
  > - Note: This page is behind auth, so no need to check session

---

## Phase 4: Delete Obsolete Files

- [x] **Delete /apps/:appId/chats/new page** (ref: /apps/:appId/chats Page Refactor)
  Task ID: phase-4-cleanup-01
  > **Implementation**: Delete `app/(app)/apps/[appId]/chats/new/` directory
  > **Details**:
  > - Delete entire `new/` folder containing `page.tsx`
  > - Verify no other files reference this route
  > - The `NewChatClient` component can remain for now (may be useful for chat continuation logic)

---

## Phase 5: API Updates (if needed)

- [x] **Verify /api/chat supports appId for new chat creation** (ref: /apps Page Refactor)
  Task ID: phase-5-api-01
  > **Implementation**: Review `app/api/chat/route.ts`
  > **Details**:
  > - Ensure POST handler accepts `appId` in request body
  > - If chat is created, it should be associated with the provided `appId`
  > - Check that `new-chat-client.tsx` already does this (line 120-121)
  > - If not implemented, add appId handling to the API route

---

## Phase 6: Testing & Verification

- [x] **Manual testing: Anonymous user flow** (ref: Success Criteria)
  Task ID: phase-6-test-01
  > **Implementation**: Automated E2E test created
  > **Details**:
  > - Replaced with automated Playwright E2E test
  > - Test file: test/e2e/apps-anonymous-user.spec.ts
  > - All scenarios passing (4/4 tests)

- [x] **Manual testing: Authenticated user flow** (ref: Success Criteria)
  Task ID: phase-6-test-02
  > **Implementation**: Automated E2E test created
  > **Details**:
  > - Replaced with automated Playwright E2E tests
  > - Test files: test/e2e/apps-authenticated-user.spec.ts, test/e2e/apps-authenticated-user-with-fixtures.spec.ts
  > - Comprehensive test coverage with fixtures and helpers

- [x] **Verify /apps/:appId/chats/new returns 404** (ref: Success Criteria)
  Task ID: phase-6-test-03
  > **Implementation**: Manual browser testing
  > **Details**:
  > - Navigate to `/apps/some-app-id/chats/new`
  > - Verify: 404 page (route no longer exists)

---

*Generated by Clavix /clavix:plan*
