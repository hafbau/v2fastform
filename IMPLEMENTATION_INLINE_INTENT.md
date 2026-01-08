# Inline Intent Confirmation Implementation

## Overview
Transformed the "New Chat" experience (`ChatsClient`) to support an inline chat interface for the Intent Confirmation flow, replacing the previous modal-based approach.

## Changes
- **`components/chats/chats-client.tsx`**:
    - Introduced `history` state to track ephemeral messages (User Request -> Assistant Confirmation).
    - Removed `IntentConfirmation` modal.
    - Implemented "Active Interaction Mode":
        - Upon sending a message, the UI transforms into a chat interface.
        - User messages are shown in bubbles.
        - `IntentConfirmation` is rendered as an "Assistant" message card inline.
    - Added logic to re-send the original (or refined) request when `handleConfirm` is triggered, ensuring seamless transition to the persisted V0 chat.
    - Styled the interactions to match the main chat application.

## User Flow
1. User enters a prompt in the "New Chat" input.
2. The UI updates to show the user's message bubble.
3. A "Thinking..." indicator appears.
4. The Draft AppSpec is returned and displayed as a structured Card within the message stream.
5. User can:
    - **Confirm**: Persists the app and redirects to the full chat view.
    - **Refine**: Adds a new user message to the stream, triggers a re-generation of the Draft Spec, and appends the new version to the history.
