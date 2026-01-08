# Optimized Prompt (Clavix Enhanced)

## Objective
Implement a chat-first UX where app and chat creation happens implicitly from the user's first message. Gate anonymous users at the action level (send) rather than the view level, preserving their input through the auth flow.

## Page Specifications

### `/apps` Page
**Layout:**
- Top: `ChatInput` component (from `components/chat/chat-input.tsx`)
- Bottom: "Your apps" grid - only renders if user has apps (no empty state, no fetch if unauthenticated)

**Behavior:**
- No "New App" button or form
- On message send (authenticated): Create app (name = truncated input text) → Create chat → Redirect to `/apps/:appId/chats/:chatId`
- On message send (anonymous): Show auth modal → After auth, create app + chat → Redirect to chat page

### `/apps/:appId/chats` Page
**Layout:**
- Top: `ChatInput` component
- Bottom: "Chats" list for current appId

**Behavior:**
- No "New Chat" CTA
- On message send: Create chat under current appId → Redirect to `/apps/:appId/chats/:chatId`

### Deletions
- Remove `/apps/:appId/chats/new` page entirely

## Anonymous User Flow
1. User lands on `/apps`, sees only chat input (no apps grid, no API call for apps)
2. User types message and clicks send
3. Auth modal appears with "Sign up or sign in to continue"
4. User completes authentication
5. System creates app (named from input) + chat with preserved message
6. User lands on `/apps/:appId/chats/:chatId`

## Technical Implementation
- **Reuse:** Existing `ChatInput` component (already has sessionStorage persistence for message preservation)
- **Architecture:** Shared component, different page shells
  - `ChatInput` is the shared core (prevents drift)
  - Page components wrap it with auth-conditional sections (apps grid, chats list)
- **Auth gating:** Wrap `onSubmit` handler to check auth state before proceeding

## Success Criteria
- [ ] Anonymous users see chat input on `/apps` without 401 errors
- [ ] Anonymous users get auth modal on send (not redirect or error)
- [ ] Message persists through auth flow (sessionStorage)
- [ ] Authenticated users create apps implicitly via first message
- [ ] App names derived from input text (with rename option later)
- [ ] `/apps/:appId/chats/new` page deleted
- [ ] No "New App" or "New Chat" buttons in UI

---

## Optimization Improvements Applied

1. **[STRUCTURED]** - Reorganized into clear sections: objective → page specs → user flow → technical → success criteria
2. **[CLARITY]** - Made implicit requirements explicit (e.g., "no API call for apps if unauthenticated")
3. **[ACTIONABILITY]** - Added specific file paths (`components/chat/chat-input.tsx`) and implementation approach
4. **[COMPLETENESS]** - Added success criteria checklist for verification
5. **[EFFICIENCY]** - Removed conversational narrative, increased information density

---
*Optimized by Clavix on 2026-01-07. This version is ready for implementation.*
