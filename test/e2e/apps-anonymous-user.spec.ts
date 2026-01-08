import { test, expect } from '@playwright/test'

/**
 * E2E Test: Anonymous User Flow on /apps Page
 *
 * This test verifies the authentication gate for anonymous users attempting
 * to submit messages on the /apps page. It ensures that unauthenticated users
 * are prompted to sign up or sign in before creating an app.
 *
 * Test Flow:
 * 1. Navigate to /apps without authentication
 * 2. Verify chat input is visible but apps grid is not
 * 3. Submit a test message
 * 4. Verify authentication modal appears with correct content
 * 5. Click Sign Up button
 * 6. Verify redirect to /register with callbackUrl parameter
 */
test.describe('Apps Page - Anonymous User Authentication Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    // Clear all cookies and local storage to ensure unauthenticated state
    await context.clearCookies()
    await page.goto('/apps')
    await page.waitForLoadState('networkidle')
  })

  test('should show authentication modal when anonymous user submits message and redirect to register on sign up', async ({
    page,
  }) => {
    // Step 1: Verify page is loaded and chat input is visible
    await expect(page).toHaveURL('/apps')

    const pageHeading = page.getByRole('heading', {
      name: /what would you like to build/i,
    })
    await expect(pageHeading).toBeVisible()

    // Step 2: Verify only chat input is visible, no apps grid
    // The chat input should be present
    const chatTextarea = page.getByPlaceholder(/continue the conversation/i)
    await expect(chatTextarea).toBeVisible()

    // The "Your Apps" section should not be visible for anonymous users
    const yourAppsHeading = page.getByRole('heading', { name: /your apps/i })
    await expect(yourAppsHeading).not.toBeVisible()

    // Step 3: Type a test message and submit
    const testMessage = 'Build a todo app'
    await chatTextarea.fill(testMessage)

    // Verify the message is filled correctly
    await expect(chatTextarea).toHaveValue(testMessage)

    // Find and click the submit button
    // The submit button is within a form that contains the textarea
    const submitButton = page.locator('form').filter({
      has: chatTextarea,
    }).locator('button[type="submit"]')

    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    // Step 4: Verify auth modal appears with correct title
    // Wait for the dialog to appear (Radix UI Dialog)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Verify modal title
    const dialogTitle = dialog.getByRole('heading', {
      name: /sign up or sign in to continue/i,
    })
    await expect(dialogTitle).toBeVisible()

    // Verify modal description
    const dialogDescription = dialog.getByText(
      /create an account or sign in to start building with fastform/i,
    )
    await expect(dialogDescription).toBeVisible()

    // Step 5: Verify modal has both "Sign In" and "Sign Up" buttons
    const signInButton = dialog.getByRole('link', { name: /^sign in$/i })
    const signUpButton = dialog.getByRole('link', { name: /^sign up$/i })

    await expect(signInButton).toBeVisible()
    await expect(signUpButton).toBeVisible()

    // Verify the Sign In button has correct href
    await expect(signInButton).toHaveAttribute(
      'href',
      '/login?callbackUrl=%2Fapps',
    )

    // Step 6: Click "Sign Up" button
    await signUpButton.click()

    // Step 7: Verify redirected to /register with callbackUrl=/apps
    await page.waitForURL('/register?callbackUrl=%2Fapps', { timeout: 5000 })
    await expect(page).toHaveURL('/register?callbackUrl=%2Fapps')

    // Additional verification: Ensure we're on the register page
    // Look for registration page indicators
    const registerHeading = page.getByRole('heading', {
      name: /sign up|create account|register/i,
    })
    await expect(registerHeading).toBeVisible()
  })

  test('should allow anonymous user to navigate to sign in from auth modal', async ({
    page,
  }) => {
    // Navigate to /apps and trigger auth modal
    const chatTextarea = page.getByPlaceholder(/continue the conversation/i)
    await chatTextarea.fill('Create a calculator app')

    const submitButton = page.locator('form').filter({
      has: chatTextarea,
    }).locator('button[type="submit"]')

    await submitButton.click()

    // Wait for auth modal
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Click "Sign In" button
    const signInButton = dialog.getByRole('link', { name: /^sign in$/i })
    await signInButton.click()

    // Verify redirected to /login with callbackUrl=/apps
    await page.waitForURL('/login?callbackUrl=%2Fapps', { timeout: 5000 })
    await expect(page).toHaveURL('/login?callbackUrl=%2Fapps')

    // Verify we're on the login page
    const loginHeading = page.getByRole('heading', {
      name: /sign in|log in|login/i,
    })
    await expect(loginHeading).toBeVisible()
  })

  test('should close auth modal when clicking outside or pressing escape', async ({
    page,
  }) => {
    // Trigger auth modal
    const chatTextarea = page.getByPlaceholder(/continue the conversation/i)
    await chatTextarea.fill('Build a notes app')

    const submitButton = page.locator('form').filter({
      has: chatTextarea,
    }).locator('button[type="submit"]')

    await submitButton.click()

    // Wait for auth modal to appear
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Press Escape key to close modal
    await page.keyboard.press('Escape')

    // Verify modal is closed
    await expect(dialog).not.toBeVisible({ timeout: 2000 })

    // Verify we're still on /apps page
    await expect(page).toHaveURL('/apps')

    // The message should still be in the textarea (preserved state)
    await expect(chatTextarea).toHaveValue('Build a notes app')
  })

  test('should disable submit button when textarea is empty', async ({
    page,
  }) => {
    const chatTextarea = page.getByPlaceholder(/continue the conversation/i)
    const submitButton = page.locator('form').filter({
      has: chatTextarea,
    }).locator('button[type="submit"]')

    // Initially, the textarea should be empty and button disabled
    await expect(chatTextarea).toHaveValue('')
    await expect(submitButton).toBeDisabled()

    // Type a message
    await chatTextarea.fill('Test message')
    await expect(submitButton).toBeEnabled()

    // Clear the message
    await chatTextarea.clear()
    await expect(submitButton).toBeDisabled()
  })
})
