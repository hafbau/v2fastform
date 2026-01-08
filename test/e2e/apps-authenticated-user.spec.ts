import { test, expect, type Page } from '@playwright/test'
import { hash } from 'bcrypt-ts'
import { randomUUID } from 'crypto'
import type { User } from '../../lib/db/schema'

/**
 * E2E Test Suite: Authenticated User Flow
 * Tests the complete user journey through /apps and /apps/:appId/chats pages
 *
 * Flow:
 * 1. Create test user and authenticate
 * 2. Navigate to /apps
 * 3. Submit message to create app and chat
 * 4. Verify redirect to chat page
 * 5. Navigate to app's chats page
 * 6. Submit another message
 * 7. Verify redirect to new chat
 */

interface TestContext {
  user: User
  sessionToken: string
}

/**
 * Helper: Create a test user in the database
 */
async function createTestUser(): Promise<User> {
  const testEmail = `test-${randomUUID()}@example.com`
  const testPassword = 'TestPassword123!'
  const hashedPassword = await hash(testPassword, 10)

  // Direct database insertion to ensure user exists
  const { getDb } = await import('../../lib/db/connection')
  const { users } = await import('../../lib/db/schema')
  const db = getDb()

  const [user] = await db
    .insert(users)
    .values({
      email: testEmail,
      password: hashedPassword,
    })
    .returning()

  return user
}

/**
 * Helper: Authenticate user and return session token
 */
async function authenticateUser(
  page: Page,
  email: string,
  password: string = 'TestPassword123!'
): Promise<void> {
  // Navigate to login page
  await page.goto('/login')

  // Fill in credentials
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)

  // Submit form
  await page.locator('button[type="submit"]').click()

  // Wait for redirect after successful login
  await page.waitForURL('/', { timeout: 10000 })
}

/**
 * Helper: Clean up test data
 */
async function cleanupTestUser(userId: string): Promise<void> {
  try {
    const { getDb } = await import('../../lib/db/connection')
    const { users, apps, chatOwnerships } = await import('../../lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const db = getDb()

    // Delete chat ownerships first (foreign key constraint)
    await db.delete(chatOwnerships).where(eq(chatOwnerships.userId, userId))

    // Delete apps
    await db.delete(apps).where(eq(apps.userId, userId))

    // Delete user
    await db.delete(users).where(eq(users.id, userId))
  } catch (error) {
    console.error('Failed to cleanup test user:', error)
    // Don't throw - cleanup is best effort
  }
}

/**
 * Helper: Extract app ID from URL
 */
function extractAppIdFromUrl(url: string): string | null {
  const match = url.match(/\/apps\/([a-f0-9-]+)/)
  return match ? match[1] : null
}

/**
 * Helper: Extract chat ID from URL
 */
function extractChatIdFromUrl(url: string): string | null {
  const match = url.match(/\/chats\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

/**
 * Helper: Wait for network idle and navigation to complete
 */
async function waitForNavigation(page: Page, timeout = 15000): Promise<void> {
  await Promise.race([
    page.waitForLoadState('networkidle', { timeout }),
    page.waitForLoadState('domcontentloaded', { timeout }),
  ])
}

test.describe('Authenticated User Flow - /apps and /apps/:appId/chats', () => {
  let testContext: TestContext

  test.beforeEach(async ({ page }) => {
    // Create test user
    const user = await createTestUser()
    testContext = {
      user,
      sessionToken: '',
    }

    // Authenticate
    await authenticateUser(page, user.email)

    // Verify we're on the home page and authenticated
    await expect(page).toHaveURL('/')
  })

  test.afterEach(async () => {
    // Clean up test data
    if (testContext?.user?.id) {
      await cleanupTestUser(testContext.user.id)
    }
  })

  test('should complete full authenticated user flow on /apps page', async ({
    page,
  }) => {
    // Step 1: Navigate to /apps
    await page.goto('/apps')
    await waitForNavigation(page)

    // Step 2: Verify chat input is visible at top
    const chatInput = page.locator('textarea[placeholder*="What would you"]')
    await expect(chatInput).toBeVisible()

    // Verify heading is correct
    const heading = page.locator('h2:has-text("What would you like to build?")')
    await expect(heading).toBeVisible()

    // Step 3: Type message and submit
    const testMessage = 'Build a blog platform'
    await chatInput.fill(testMessage)

    // Find and click submit button
    const submitButton = page.locator('button[type="submit"]')
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    // Step 4: Wait for redirect to /apps/:appId/chats/:chatId
    await page.waitForURL(/\/apps\/[a-f0-9-]+\/chats\/[a-zA-Z0-9-_]+/, {
      timeout: 30000,
    })

    const chatPageUrl = page.url()
    const appId = extractAppIdFromUrl(chatPageUrl)
    const chatId = extractChatIdFromUrl(chatPageUrl)

    expect(appId).toBeTruthy()
    expect(chatId).toBeTruthy()

    // Verify we're on the chat page
    expect(chatPageUrl).toContain(`/apps/${appId}/chats/${chatId}`)

    // Step 5: Navigate back to the app's chats page
    await page.goto(`/apps/${appId}/chats`)
    await waitForNavigation(page)

    // Step 6: Verify chat input at top
    const chatsPageInput = page.locator(
      'textarea[placeholder*="Describe what you"]'
    )
    await expect(chatsPageInput).toBeVisible()

    // Verify heading
    const chatsHeading = page.locator('h2:has-text("Start a new conversation")')
    await expect(chatsHeading).toBeVisible()

    // Step 7: Verify chats list below (should contain the chat we created)
    const chatsListHeading = page.locator('h3:has-text("Previous Chats")')
    await expect(chatsListHeading).toBeVisible()

    // Verify the chat we created appears in the list
    const firstChat = page.locator(`a[href="/apps/${appId}/chats/${chatId}"]`)
    await expect(firstChat).toBeVisible()

    // Step 8: Type another message and submit
    const secondMessage = 'Add a comment system to the blog'
    await chatsPageInput.fill(secondMessage)

    const secondSubmitButton = page.locator('button[type="submit"]')
    await expect(secondSubmitButton).toBeEnabled()
    await secondSubmitButton.click()

    // Step 9: Wait for redirect to new chat /apps/:appId/chats/:newChatId
    await page.waitForURL(/\/apps\/[a-f0-9-]+\/chats\/[a-zA-Z0-9-_]+/, {
      timeout: 30000,
    })

    const newChatPageUrl = page.url()
    const newChatId = extractChatIdFromUrl(newChatPageUrl)

    expect(newChatId).toBeTruthy()
    expect(newChatId).not.toBe(chatId) // Should be a different chat

    // Verify URL format
    expect(newChatPageUrl).toContain(`/apps/${appId}/chats/${newChatId}`)

    // Verify we have the same appId but different chatId
    const newAppId = extractAppIdFromUrl(newChatPageUrl)
    expect(newAppId).toBe(appId)
  })

  test('should display empty state when no apps exist', async ({ page }) => {
    // Navigate to /apps
    await page.goto('/apps')
    await waitForNavigation(page)

    // Chat input should be visible
    const chatInput = page.locator('textarea[placeholder*="What would you"]')
    await expect(chatInput).toBeVisible()

    // "Your Apps" section should not be visible when there are no apps
    const appsHeading = page.locator('h3:has-text("Your Apps")')
    await expect(appsHeading).not.toBeVisible()
  })

  test('should display apps grid when apps exist', async ({ page }) => {
    // First create an app by submitting a message
    await page.goto('/apps')
    await waitForNavigation(page)

    const chatInput = page.locator('textarea[placeholder*="What would you"]')
    await chatInput.fill('Test app creation')

    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()

    // Wait for redirect
    await page.waitForURL(/\/apps\/[a-f0-9-]+\/chats\/[a-zA-Z0-9-_]+/, {
      timeout: 30000,
    })

    // Go back to /apps
    await page.goto('/apps')
    await waitForNavigation(page)

    // Now "Your Apps" section should be visible
    const appsHeading = page.locator('h3:has-text("Your Apps")')
    await expect(appsHeading).toBeVisible()

    // Apps grid should contain at least one app
    const appCards = page.locator('.grid > div')
    await expect(appCards.first()).toBeVisible()

    // App card should have a link to chats page
    const appLink = appCards.first().locator('a[href*="/apps/"][href*="/chats"]')
    await expect(appLink).toBeVisible()
  })

  test('should handle empty chats list on /apps/:appId/chats page', async ({
    page,
  }) => {
    // Create an app first
    await page.goto('/apps')
    await waitForNavigation(page)

    const chatInput = page.locator('textarea[placeholder*="What would you"]')
    await chatInput.fill('Test empty chats page')

    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()

    await page.waitForURL(/\/apps\/[a-f0-9-]+\/chats\/[a-zA-Z0-9-_]+/, {
      timeout: 30000,
    })

    const chatPageUrl = page.url()
    const appId = extractAppIdFromUrl(chatPageUrl)

    // Delete the chat via API to create empty state
    const chatId = extractChatIdFromUrl(chatPageUrl)
    await page.evaluate(
      async ({ chatId }) => {
        await fetch(`/api/chat/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId }),
        })
      },
      { chatId }
    )

    // Navigate to chats page
    await page.goto(`/apps/${appId}/chats`)
    await waitForNavigation(page)

    // Chat input should be visible
    const chatsPageInput = page.locator(
      'textarea[placeholder*="Describe what you"]'
    )
    await expect(chatsPageInput).toBeVisible()

    // "Previous Chats" heading should not be visible when empty
    const chatsListHeading = page.locator('h3:has-text("Previous Chats")')
    await expect(chatsListHeading).not.toBeVisible()
  })

  test('should validate URL format for app and chat IDs', async ({ page }) => {
    await page.goto('/apps')
    await waitForNavigation(page)

    const chatInput = page.locator('textarea[placeholder*="What would you"]')
    await chatInput.fill('Validate URL format test')

    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()

    await page.waitForURL(/\/apps\/[a-f0-9-]+\/chats\/[a-zA-Z0-9-_]+/, {
      timeout: 30000,
    })

    const url = page.url()

    // Validate app ID format (UUID)
    const appId = extractAppIdFromUrl(url)
    expect(appId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )

    // Validate chat ID format (v0 SDK format)
    const chatId = extractChatIdFromUrl(url)
    expect(chatId).toMatch(/^[a-zA-Z0-9-_]+$/)
    expect(chatId).toBeTruthy()
  })

  test('should maintain authentication state across navigation', async ({
    page,
  }) => {
    // Start on /apps
    await page.goto('/apps')
    await waitForNavigation(page)

    // Create a chat
    const chatInput = page.locator('textarea[placeholder*="What would you"]')
    await chatInput.fill('Authentication persistence test')

    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()

    await page.waitForURL(/\/apps\/[a-f0-9-]+\/chats\/[a-zA-Z0-9-_]+/, {
      timeout: 30000,
    })

    const chatPageUrl = page.url()
    const appId = extractAppIdFromUrl(chatPageUrl)

    // Navigate to /apps/:appId/chats
    await page.goto(`/apps/${appId}/chats`)
    await waitForNavigation(page)

    // Should still be authenticated - verify by checking for chat input
    const chatsPageInput = page.locator(
      'textarea[placeholder*="Describe what you"]'
    )
    await expect(chatsPageInput).toBeVisible()

    // Navigate back to /apps
    await page.goto('/apps')
    await waitForNavigation(page)

    // Should still be authenticated
    const appsPageInput = page.locator('textarea[placeholder*="What would you"]')
    await expect(appsPageInput).toBeVisible()

    // Verify user is not redirected to login
    expect(page.url()).not.toContain('/login')
  })

  test('should handle concurrent chat submissions correctly', async ({
    page,
  }) => {
    await page.goto('/apps')
    await waitForNavigation(page)

    const chatInput = page.locator('textarea[placeholder*="What would you"]')
    await chatInput.fill('First concurrent message')

    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()

    await page.waitForURL(/\/apps\/[a-f0-9-]+\/chats\/[a-zA-Z0-9-_]+/, {
      timeout: 30000,
    })

    const firstChatUrl = page.url()
    const firstChatId = extractChatIdFromUrl(firstChatUrl)

    // Verify chat was created
    expect(firstChatId).toBeTruthy()

    // Button should be disabled during submission
    const appId = extractAppIdFromUrl(firstChatUrl)
    await page.goto(`/apps/${appId}/chats`)
    await waitForNavigation(page)

    const secondInput = page.locator(
      'textarea[placeholder*="Describe what you"]'
    )
    await secondInput.fill('Second message')

    const secondSubmitButton = page.locator('button[type="submit"]')

    // Start submission
    await secondSubmitButton.click()

    // Button should be disabled immediately after click
    await expect(secondSubmitButton).toBeDisabled()
  })
})

test.describe('Error Handling - Authenticated User Flow', () => {
  let testContext: TestContext

  test.beforeEach(async ({ page }) => {
    const user = await createTestUser()
    testContext = {
      user,
      sessionToken: '',
    }

    await authenticateUser(page, user.email)
    await expect(page).toHaveURL('/')
  })

  test.afterEach(async () => {
    if (testContext?.user?.id) {
      await cleanupTestUser(testContext.user.id)
    }
  })

  test('should prevent submission with empty message', async ({ page }) => {
    await page.goto('/apps')
    await waitForNavigation(page)

    const submitButton = page.locator('button[type="submit"]')

    // Button should be disabled when textarea is empty
    await expect(submitButton).toBeDisabled()

    // Type and then clear message
    const chatInput = page.locator('textarea[placeholder*="What would you"]')
    await chatInput.fill('Test')
    await chatInput.clear()

    // Button should be disabled again
    await expect(submitButton).toBeDisabled()
  })

  test('should handle network errors gracefully', async ({ page, context }) => {
    await page.goto('/apps')
    await waitForNavigation(page)

    // Simulate network failure
    await context.setOffline(true)

    const chatInput = page.locator('textarea[placeholder*="What would you"]')
    await chatInput.fill('This will fail due to network')

    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()

    // Wait a bit for the request to fail
    await page.waitForTimeout(2000)

    // Re-enable network
    await context.setOffline(false)

    // User should still be on /apps page (no redirect on failure)
    expect(page.url()).toContain('/apps')
  })
})
