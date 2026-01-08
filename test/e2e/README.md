# E2E Tests - Playwright

This directory contains end-to-end tests for the authenticated user flow using Playwright.

## Test Files

### Core Tests

- **`apps-anonymous-user.spec.ts`** - E2E test suite for anonymous (unauthenticated) users
  - Tests authentication gate on /apps page
  - Verifies auth modal appears when anonymous user submits message
  - Tests redirect to /register and /login with callbackUrl
  - Includes modal dismissal and UI state tests

- **`apps-authenticated-user.spec.ts`** - Complete E2E test suite for authenticated users
  - Tests the full user journey from /apps to chat creation
  - Includes comprehensive error handling and edge case tests
  - Self-contained with inline helper functions

- **`apps-authenticated-user-with-fixtures.spec.ts`** - Alternative implementation using fixtures
  - Cleaner, more maintainable test code
  - Reusable fixtures for authentication and helpers
  - Recommended for new tests

### Supporting Files

- **`fixtures.ts`** - Custom Playwright fixtures
  - `authenticatedUser` - Auto-creates and authenticates test users
  - `testHelpers` - Common helper functions for navigation, URL extraction, etc.

- **`auth.setup.ts`** - Authentication setup for global state
  - Creates authenticated browser states
  - Can be used with `storageState` for faster test execution

## Prerequisites

1. **Database**: Ensure PostgreSQL is running and accessible
   ```bash
   # Default connection string
   POSTGRES_URL="postgres://postgres:postgrespassword@localhost:5435/fastform"
   ```

2. **Environment Variables**: Set up required environment variables
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your values
   ```

3. **Dependencies**: Install Playwright browsers
   ```bash
   pnpm exec playwright install
   ```

## Running Tests

### Run all E2E tests
```bash
pnpm test:e2e
```

### Run specific test file
```bash
pnpm exec playwright test test/e2e/apps-authenticated-user.spec.ts
```

### Run in headed mode (see browser)
```bash
pnpm exec playwright test --headed
```

### Run in debug mode
```bash
pnpm test:e2e:debug
```

### Run in UI mode (interactive)
```bash
pnpm test:e2e:ui
```

### Run specific test by name
```bash
pnpm exec playwright test -g "should complete full authenticated user flow"
```

## Test Structure

### Standard Test (apps-authenticated-user.spec.ts)

```typescript
test.describe('Authenticated User Flow', () => {
  let testContext: TestContext

  test.beforeEach(async ({ page }) => {
    // Create test user
    const user = await createTestUser()
    testContext = { user, sessionToken: '' }

    // Authenticate
    await authenticateUser(page, user.email)
  })

  test.afterEach(async () => {
    // Clean up test data
    if (testContext?.user?.id) {
      await cleanupTestUser(testContext.user.id)
    }
  })

  test('should do something', async ({ page }) => {
    // Test implementation
  })
})
```

### Fixture-Based Test (apps-authenticated-user-with-fixtures.spec.ts)

```typescript
import { test, expect } from './fixtures'

test('should do something', async ({
  page,
  authenticatedUser,
  testHelpers
}) => {
  // User is already authenticated
  // Access user: authenticatedUser.user
  // Use helpers: testHelpers.waitForNavigation()
})
```

## Test Coverage

### Anonymous User Flow
- ✅ Navigate to /apps page (unauthenticated)
- ✅ Verify chat input visible, no apps grid
- ✅ Submit message and verify auth modal appears
- ✅ Verify modal content (title, description, buttons)
- ✅ Click Sign Up and verify redirect to /register with callbackUrl
- ✅ Click Sign In and verify redirect to /login with callbackUrl
- ✅ Close modal with Escape key
- ✅ Submit button disabled when textarea empty

### Authenticated User Flow
- ✅ Navigate to /apps page
- ✅ Submit message to create app and chat
- ✅ Verify redirect to /apps/:appId/chats/:chatId
- ✅ Navigate to /apps/:appId/chats
- ✅ Verify chat input and chats list
- ✅ Submit another message
- ✅ Verify redirect to new chat

### UI Verification
- ✅ Chat input visibility and functionality
- ✅ Apps grid display when apps exist
- ✅ Empty state when no apps/chats exist
- ✅ Button states (enabled/disabled)
- ✅ Loading states during submission

### Error Handling
- ✅ Empty message submission prevention
- ✅ Network error handling
- ✅ Concurrent submission handling
- ✅ Authentication persistence

### URL Validation
- ✅ App ID format (UUID)
- ✅ Chat ID format (v0 SDK format)
- ✅ URL structure correctness

## Best Practices

1. **Use Fixtures**: Prefer fixture-based tests for cleaner code
2. **Clean Up Data**: Always clean up test data in afterEach hooks
3. **Wait for Navigation**: Use `testHelpers.waitForNavigation()` after navigation
4. **Accessible Selectors**: Use semantic selectors (text, placeholder, role)
5. **Explicit Waits**: Use `waitForURL` for redirects instead of arbitrary timeouts
6. **Isolation**: Each test should be independent and idempotent

## Debugging

### View test report
```bash
pnpm exec playwright show-report
```

### Run with trace
```bash
pnpm exec playwright test --trace on
```

### Run single test in debug mode
```bash
pnpm exec playwright test --debug -g "test name"
```

### VS Code Integration
Install the Playwright Test for VSCode extension for:
- Run tests from editor
- Set breakpoints
- View test results inline

## Troubleshooting

### Database Connection Errors
Ensure PostgreSQL is running and the connection string is correct:
```bash
# Check if database is accessible
psql $POSTGRES_URL -c "SELECT 1"
```

### Authentication Failures
Check that AUTH_SECRET and NEXTAUTH_SECRET are set:
```bash
echo $AUTH_SECRET
echo $NEXTAUTH_SECRET
```

### Timeout Errors
Increase timeout in test or globally in playwright.config.ts:
```typescript
test('my test', async ({ page }) => {
  test.setTimeout(60000) // 60 seconds
})
```

### V0 API Errors
Ensure V0_API_KEY is set and valid:
```bash
echo $V0_API_KEY
```

## CI/CD Integration

Tests are configured to run in CI with:
- Retries: 2 (in CI only)
- Workers: 1 (in CI only)
- Screenshots: On failure
- Video: On failure
- Trace: On first retry

See `playwright.config.ts` for full configuration.

## Writing New Tests

1. **Create test file**: `test/e2e/my-feature.spec.ts`

2. **Import fixtures**:
   ```typescript
   import { test, expect } from './fixtures'
   ```

3. **Write test**:
   ```typescript
   test('should do something', async ({
     page,
     authenticatedUser,
     testHelpers
   }) => {
     // Test implementation
   })
   ```

4. **Run and verify**:
   ```bash
   pnpm exec playwright test test/e2e/my-feature.spec.ts
   ```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright Test Fixtures](https://playwright.dev/docs/test-fixtures)
- [Playwright Selectors](https://playwright.dev/docs/selectors)
