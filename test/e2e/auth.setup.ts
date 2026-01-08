import { test as setup, expect } from '@playwright/test'
import { hash } from 'bcrypt-ts'
import { randomUUID } from 'crypto'
import path from 'path'

/**
 * Authentication Setup for Playwright E2E Tests
 *
 * This file creates authenticated browser states that can be reused
 * across tests to avoid repeated login flows and improve test performance.
 *
 * Usage:
 * - This setup runs before all tests
 * - Creates a test user and authenticates
 * - Saves the authentication state to a file
 * - Other tests can reuse this state using storageState option
 */

const authFile = path.join(__dirname, '../../.auth/user.json')

/**
 * Setup: Create authenticated user state
 */
setup('authenticate', async ({ page }) => {
  // Create test user
  const testEmail = `e2e-test-${randomUUID()}@example.com`
  const testPassword = 'TestPassword123!'
  const hashedPassword = await hash(testPassword, 10)

  // Direct database insertion
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

  console.log(`Created test user: ${user.email} (${user.id})`)

  // Perform authentication
  await page.goto('/login')

  await page.locator('input[name="email"]').fill(testEmail)
  await page.locator('input[name="password"]').fill(testPassword)

  await page.locator('button[type="submit"]').click()

  // Wait for redirect after successful login
  await page.waitForURL('/', { timeout: 10000 })

  // Verify authentication succeeded
  await expect(page).toHaveURL('/')

  // Save signed-in state
  await page.context().storageState({ path: authFile })

  console.log(`Authentication state saved to ${authFile}`)
})

/**
 * Setup: Create guest user state
 */
setup('authenticate as guest', async ({ page }) => {
  const guestAuthFile = path.join(__dirname, '../../.auth/guest.json')

  // Navigate to home page
  await page.goto('/')

  // Click "Continue as Guest" button
  const guestButton = page.locator('button:has-text("Continue as Guest")')
  if (await guestButton.isVisible()) {
    await guestButton.click()
    await page.waitForURL('/', { timeout: 10000 })
  }

  // Save guest state
  await page.context().storageState({ path: guestAuthFile })

  console.log(`Guest authentication state saved to ${guestAuthFile}`)
})
