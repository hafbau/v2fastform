import { test as base } from '@playwright/test'
import { hash } from 'bcrypt-ts'
import { randomUUID } from 'crypto'
import type { User } from '../../lib/db/schema'

/**
 * Playwright Fixtures for E2E Tests
 *
 * Provides reusable test utilities:
 * - authenticatedUser: Creates and authenticates a test user
 * - testHelpers: Common helper functions for navigation, extraction, etc.
 */

export interface AuthenticatedUser {
  user: User
  email: string
  password: string
}

export interface TestHelpers {
  /**
   * Wait for network idle and navigation to complete
   */
  waitForNavigation: (timeout?: number) => Promise<void>

  /**
   * Extract app ID from current URL
   */
  extractAppId: () => string | null

  /**
   * Extract chat ID from current URL
   */
  extractChatId: () => string | null

  /**
   * Clean up test user and associated data
   */
  cleanupUser: (userId: string) => Promise<void>

  /**
   * Create a test user in the database
   */
  createUser: (email?: string, password?: string) => Promise<User>

  /**
   * Authenticate a user via login page
   */
  authenticateUser: (email: string, password: string) => Promise<void>
}

type TestFixtures = {
  authenticatedUser: AuthenticatedUser
  testHelpers: TestHelpers
}

/**
 * Create test user in database
 */
async function createTestUser(
  email?: string,
  password?: string
): Promise<{ user: User; email: string; password: string }> {
  const testEmail = email || `test-${randomUUID()}@example.com`
  const testPassword = password || 'TestPassword123!'
  const hashedPassword = await hash(testPassword, 10)

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

  return { user, email: testEmail, password: testPassword }
}

/**
 * Clean up test data
 */
async function cleanupTestData(userId: string): Promise<void> {
  try {
    const { getDb } = await import('../../lib/db/connection')
    const { users, apps, chatOwnerships } = await import('../../lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const db = getDb()

    // Delete in order to respect foreign key constraints
    await db.delete(chatOwnerships).where(eq(chatOwnerships.userId, userId))
    await db.delete(apps).where(eq(apps.userId, userId))
    await db.delete(users).where(eq(users.id, userId))
  } catch (error) {
    console.error('Failed to cleanup test data:', error)
  }
}

/**
 * Extended test with custom fixtures
 */
export const test = base.extend<TestFixtures>({
  /**
   * Fixture: authenticatedUser
   * Automatically creates and authenticates a test user
   */
  authenticatedUser: async ({ page }, use) => {
    // Setup: Create and authenticate user
    const { user, email, password } = await createTestUser()

    // Navigate to login
    await page.goto('/login')
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="password"]').fill(password)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL('/', { timeout: 10000 })

    // Provide user to test
    await use({ user, email, password })

    // Teardown: Clean up user
    await cleanupTestData(user.id)
  },

  /**
   * Fixture: testHelpers
   * Provides helper functions scoped to the current page
   */
  testHelpers: async ({ page }, use) => {
    const helpers: TestHelpers = {
      waitForNavigation: async (timeout = 15000) => {
        await Promise.race([
          page.waitForLoadState('networkidle', { timeout }),
          page.waitForLoadState('domcontentloaded', { timeout }),
        ])
      },

      extractAppId: () => {
        const url = page.url()
        const match = url.match(/\/apps\/([a-f0-9-]+)/)
        return match ? match[1] : null
      },

      extractChatId: () => {
        const url = page.url()
        const match = url.match(/\/chats\/([a-zA-Z0-9-_]+)/)
        return match ? match[1] : null
      },

      cleanupUser: async (userId: string) => {
        await cleanupTestData(userId)
      },

      createUser: async (email?: string, password?: string) => {
        const { user } = await createTestUser(email, password)
        return user
      },

      authenticateUser: async (email: string, password: string) => {
        await page.goto('/login')
        await page.locator('input[name="email"]').fill(email)
        await page.locator('input[name="password"]').fill(password)
        await page.locator('button[type="submit"]').click()
        await page.waitForURL('/', { timeout: 10000 })
      },
    }

    await use(helpers)
  },
})

export { expect } from '@playwright/test'
