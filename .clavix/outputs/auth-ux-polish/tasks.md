# Implementation Plan

**Project**: auth-ux-polish
**Generated**: 2026-01-08T23:35:00Z

## Technical Context & Standards
*Detected Stack & Patterns*
- **Framework**: Next.js 16 (App Router) + React 19
- **Styling**: Tailwind CSS 4 + shadcn/ui (`components/ui/`)
- **Auth**: NextAuth 5 beta + Nodemailer + Drizzle ORM
- **State**: SWR for data fetching
- **Conventions**:
  - `cn()` utility for className merging
  - CSS custom properties in `globals.css`
  - Layouts in `components/layouts/`
  - Auth routes in `app/(auth)/`

---

## Phase 1: Design System Foundation

- [ ] **Create Animated Gradient Mesh Background** (ref: Modern Auth Pages, Animated Background)
  Task ID: phase-1-design-01
  > **Implementation**: Create `components/ui/gradient-mesh.tsx`
  > **Details**:
  > - Create a reusable React component using CSS gradients + keyframe animations
  > - Use brand colors: teal primary (`oklch(0.52 0.16 175)`), coral accent (`oklch(0.68 0.19 38)`)
  > - Animation should be subtle and performant (CSS only, no JS animation)
  > - Support both light and dark mode via CSS variables
  > - Export as `<GradientMesh />` for use in auth pages

- [ ] **Add Glassmorphism CSS Classes** (ref: Glassmorphism UI)
  Task ID: phase-1-design-02
  > **Implementation**: Edit `app/globals.css`
  > **Details**:
  > - Add `.glass` utility class with `backdrop-blur-xl`, `bg-white/70` (light), `bg-black/30` (dark)
  > - Add `.glass-card` variant with subtle border and shadow
  > - Add `.glass-navbar` variant optimized for fixed headers
  > - Include `@supports` fallback for browsers without backdrop-filter

- [ ] **Create Glassmorphism Card Variant** (ref: Glassmorphism UI)
  Task ID: phase-1-design-03
  > **Implementation**: Create `components/ui/glass-card.tsx`
  > **Details**:
  > - Extend existing Card component pattern from `components/ui/card.tsx`
  > - Apply glassmorphism styling: `backdrop-blur-xl`, semi-transparent bg, subtle border
  > - Export `GlassCard`, `GlassCardHeader`, `GlassCardContent`, `GlassCardFooter`

---

## Phase 2: Auth Page Redesign

- [ ] **Create Auth Layout with Gradient Background** (ref: Modern Auth Pages)
  Task ID: phase-2-auth-01
  > **Implementation**: Create `app/(auth)/layout.tsx`
  > **Details**:
  > - Wrap auth pages in shared layout with `<GradientMesh />` background
  > - Center content vertically and horizontally
  > - Ensure layout doesn't conflict with existing root layout

- [ ] **Redesign Login Page** (ref: Modern Auth Pages)
  Task ID: phase-2-auth-02
  > **Implementation**: Edit `app/(auth)/login/page.tsx`
  > **Details**:
  > - Replace current bordered card with `<GlassCard>`
  > - Update typography to use Stripe-like understated elegance
  > - Add "Forgot password?" link pointing to `/forgot-password`
  > - Keep existing `<AuthForm type="signin" />` but style it better
  > - Add subtle animations (fade-in on mount)

- [ ] **Redesign Register Page** (ref: Modern Auth Pages)
  Task ID: phase-2-auth-03
  > **Implementation**: Edit `app/(auth)/register/page.tsx`
  > **Details**:
  > - Mirror login page design with `<GlassCard>`
  > - Maintain existing `<AuthForm type="signup" />` logic
  > - Update copy to be more welcoming ("Join FastForm" vs "Create Account")

- [ ] **Create Forgot Password Page** (ref: Forgot Password Flow)
  Task ID: phase-2-auth-04
  > **Implementation**: Create `app/(auth)/forgot-password/page.tsx`
  > **Details**:
  > - Use same glassmorphism layout as login/register
  > - Single email input with submit button
  > - Call `requestPasswordReset` server action (to be created)
  > - Show success message: "Check your email for reset link"
  > - Handle errors gracefully (email not found, SMTP not configured)

- [ ] **Create Reset Password Page** (ref: Reset Password Page)
  Task ID: phase-2-auth-05
  > **Implementation**: Create `app/(auth)/reset-password/page.tsx`
  > **Details**:
  > - Accept `?token=xxx` query parameter
  > - Two password inputs: new password + confirm password
  > - Validate token on mount, show error if expired/invalid
  > - Call `resetPassword` server action with token + new password
  > - Redirect to `/login` with success message on completion

- [ ] **Update AuthForm with Improved Styling** (ref: Modern Auth Pages)
  Task ID: phase-2-auth-06
  > **Implementation**: Edit `components/auth-form.tsx`
  > **Details**:
  > - Style inputs with glass effect (subtle backdrop-blur on focus)
  > - Improve error message styling (not just red text)
  > - Add loading spinner to submit button
  > - Make the "Sign up" / "Sign in" link more prominent

---

## Phase 3: Navigation Fix (Logged-Out State)

- [ ] **Update AppLayout with Auth State Check** (ref: Logged-Out State Fix)
  Task ID: phase-3-nav-01
  > **Implementation**: Edit `components/layouts/app-layout.tsx`
  > **Details**:
  > - Check `session` from `useSession()` hook (already imported)
  > - If `!session`, pass `isAuthenticated: false` to `<AppNavbar />`
  > - If `session`, pass user info + `isAuthenticated: true`

- [ ] **Update AppNavbar to Show Login/Signup Buttons** (ref: Logged-Out State Fix)
  Task ID: phase-3-nav-02
  > **Implementation**: Edit `components/layouts/app-navbar.tsx`
  > **Details**:
  > - Add `isAuthenticated?: boolean` prop to `AppNavbarProps`
  > - When `isAuthenticated === false`:
  >   - Hide `<UserAvatarMenu />` entirely
  >   - Show two buttons: "Log In" (variant="ghost") and "Sign Up" (variant="default")
  >   - Buttons link to `/login` and `/register` using Next.js `<Link>`
  > - When `isAuthenticated === true`: show existing `<UserAvatarMenu />`

- [ ] **Apply Glassmorphism to Navbar** (ref: Glassmorphism UI)
  Task ID: phase-3-nav-03
  > **Implementation**: Edit `components/layouts/app-navbar.tsx`
  > **Details**:
  > - Add `.glass-navbar` class to header element
  > - Update existing `bg-background/95 backdrop-blur-sm` to full glassmorphism
  > - Ensure dark mode compatibility

---

## Phase 4: Forgot Password Backend

- [ ] **Add Password Reset Server Actions** (ref: Password Reset Integration)
  Task ID: phase-4-backend-01
  > **Implementation**: Edit `app/(auth)/actions.ts`
  > **Details**:
  > - Create `requestPasswordReset(email: string)` action:
  >   - Look up user by email in database
  >   - Generate secure token (use `crypto.randomUUID()`)
  >   - Store token in `verificationTokens` table (reuse existing adapter pattern from `auth.ts`)
  >   - Send email via Nodemailer with reset link
  >   - Handle case where SMTP is not configured
  > - Create `resetPassword(token: string, newPassword: string)` action:
  >   - Validate token exists and not expired
  >   - Hash new password with `bcrypt-ts`
  >   - Update user's password in database
  >   - Delete used token
  >   - Return success/error

- [ ] **Create Password Reset Email Template** (ref: Password Reset Integration)
  Task ID: phase-4-backend-02
  > **Implementation**: Create `lib/email/password-reset.ts`
  > **Details**:
  > - Export `sendPasswordResetEmail(email: string, token: string)` function
  > - Generate reset URL: `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`
  > - Use existing Nodemailer transport pattern from `auth.ts`
  > - Clean, simple HTML email template with reset button

- [ ] **Add Token Expiry Handling** (ref: Password Reset Integration)
  Task ID: phase-4-backend-03
  > **Implementation**: Edit `app/(auth)/actions.ts`
  > **Details**:
  > - Set token expiry to 1 hour from creation
  > - Check expiry in `resetPassword` action
  > - Return clear error message if token expired

---

## Phase 5: App-Wide Glassmorphism Polish

- [ ] **Apply Glass Effect to Modals/Dialogs** (ref: Glassmorphism UI)
  Task ID: phase-5-polish-01
  > **Implementation**: Edit `components/ui/dialog.tsx`
  > **Details**:
  > - Update `DialogContent` with glassmorphism backdrop
  > - Add subtle animation (scale + fade)
  > - Test in both light and dark modes

- [ ] **Verify Dark Mode Compatibility** (ref: Dark Mode Polish)
  Task ID: phase-5-polish-02
  > **Implementation**: Test all new components
  > **Details**:
  > - Test gradient mesh in dark mode (adjust colors if needed)
  > - Test glass cards in dark mode (ensure readable contrast)
  > - Test navbar glass effect in dark mode
  > - Make adjustments to CSS variables in `globals.css` if needed

- [ ] **Add Graceful Degradation for backdrop-filter** (ref: Edge Cases)
  Task ID: phase-5-polish-03
  > **Implementation**: Edit `app/globals.css`
  > **Details**:
  > - Wrap glassmorphism styles in `@supports (backdrop-filter: blur(1px))`
  > - Provide solid background fallback for unsupported browsers
  > - Test in Safari, Chrome, Firefox

---

## Summary

| Phase | Tasks | Focus |
|-------|-------|-------|
| 1 | 3 | Design system foundation (gradient mesh, glassmorphism) |
| 2 | 6 | Auth page redesign (login, register, forgot, reset) |
| 3 | 3 | Navigation fix (logged-out state, glass navbar) |
| 4 | 3 | Backend (password reset actions, email) |
| 5 | 3 | Polish (dialogs, dark mode, fallbacks) |

**Total: 18 tasks**

---

*Generated by Clavix /clavix:plan*
