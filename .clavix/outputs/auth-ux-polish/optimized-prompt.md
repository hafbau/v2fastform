# Optimized Prompt (Clavix Enhanced)

## Objective
Transform FastForm's authentication experience into a modern, Stripe-inspired design system with three interconnected improvements: visual polish, UX fixes, and functional completion.

## Part 1: Modern Auth Page Design

Redesign `/login`, `/register`, and new `/forgot-password` pages with:

**Visual Foundation:**
- Soft animated gradient mesh background (Linear.app style) using the existing teal primary (`oklch(0.52 0.16 175)`) and coral accent (`oklch(0.68 0.19 38)`)
- Subtle, performant CSS/canvas animation - understated elegance, not flashy
- Glassmorphism card styling: `backdrop-blur-xl`, semi-transparent backgrounds, subtle borders

**Layout:**
- Centered auth card with generous whitespace
- Clean typography using Geist Sans
- Smooth micro-interactions on form inputs and buttons
- Responsive design that works on mobile without performance issues

**Pages to create/update:**
1. `/login` - Sign in with email/password
2. `/register` - Create account
3. `/forgot-password` - Request password reset email
4. `/reset-password` - Set new password (with token validation)

## Part 2: Logged-Out Navigation Fix

Update `AppLayout` and `AppNavbar` components to handle authentication state properly:

**When user is NOT authenticated:**
- Hide the `UserAvatarMenu` component entirely
- Show two buttons instead: "Log In" (secondary style) and "Sign Up" (primary style)
- Buttons should link to `/login` and `/register` respectively

**When user IS authenticated:**
- Show the existing `UserAvatarMenu` with working logout functionality

**Files to modify:**
- `components/layouts/app-layout.tsx` - Add auth state conditional
- `components/layouts/app-navbar.tsx` - Conditional rendering of avatar vs buttons

## Part 3: Forgot Password Flow

Implement complete password reset using existing NextAuth + Nodemailer infrastructure:

**Flow:**
1. User clicks "Forgot password?" on login page → navigates to `/forgot-password`
2. User enters email → server generates reset token, stores in `verificationTokens` table
3. Email sent via Nodemailer with reset link
4. User clicks link → `/reset-password?token=xxx`
5. User enters new password → server validates token, updates password hash
6. Success → redirect to login with success message

**Technical implementation:**
- Reuse existing `verificationTokenAdapter` pattern from `auth.ts`
- Create server actions in `app/(auth)/actions.ts` for reset flow
- Handle edge cases: invalid token, expired token, email not found

## Part 4: App-Wide Glassmorphism

Apply consistent glassmorphism styling across the app:
- Update navbar with backdrop-blur effect
- Add subtle glass effect to cards and modals
- Ensure dark mode compatibility
- Graceful degradation for browsers without backdrop-filter support

## Technical Constraints
- Stack: Next.js 16, React 19, NextAuth, Drizzle ORM, Tailwind CSS
- Email: Nodemailer (SMTP must be configured for password reset to work)
- No new dependencies for gradient mesh - use CSS/canvas
- Maintain existing brand palette and Geist font system

## Success Criteria
- [ ] Auth pages have animated gradient mesh background that performs well
- [ ] Glassmorphism applied to auth cards, navbar, and key UI elements
- [ ] Logged-out users see "Log In" / "Sign Up" buttons (not avatar)
- [ ] Forgot password flow works end-to-end with email delivery
- [ ] Design quality matches Stripe's understated elegance
- [ ] All changes work correctly in both light and dark modes

---

## Optimization Improvements Applied

1. **[STRUCTURED]** - Reorganized into 4 clear implementation parts with specific deliverables
2. **[CLARIFIED]** - Specified exact files to modify and components to update
3. **[COMPLETENESS]** - Added full password reset flow with step-by-step implementation details
4. **[ACTIONABILITY]** - Converted vague "make it modern" into specific styling requirements (backdrop-blur-xl, color values)
5. **[SCOPED]** - Defined what glassmorphism applies to (auth cards, navbar, modals) vs entire app
6. **[EXPANDED]** - Added technical constraints, success criteria checklist, and edge cases

---
*Optimized by Clavix on 2026-01-08. This version is ready for implementation.*
