import { test, expect } from './fixtures'

/**
 * E2E Test Suite: Authenticated User Flow (Using Fixtures)
 *
 * This is an alternative implementation using custom fixtures
 * for cleaner, more maintainable test code.
 *
 * Flow:
 * 1. Authenticate (handled by fixture)
 * 2. Navigate to /apps
 * 3. Submit message to create app and chat
 * 4. Verify redirect to chat page
 * 5. Navigate to app's chats page
 * 6. Submit another message
 * 7. Verify redirect to new chat
 */

test.describe('Authenticated User Flow - With Fixtures', () => {
  test('should complete full user flow from /apps to chat creation', async ({
    page,
    authenticatedUser: _authenticatedUser,
    testHelpers,
  }) => {
    // Navigate to /apps
    await page.goto('/apps')
    await testHelpers.waitForNavigation()

    // Verify chat input is visible
    const chatInput = page.locator('textarea[placeholder*="What would you"]')
    await expect(chatInput).toBeVisible()

    // Verify heading
    await expect(
      page.locator('h2:has-text("What would you like to build?")')
    ).toBeVisible()

    // Submit message to create app and chat
    const testMessage = 'Build a blog platform with user authentication'
    await chatInput.fill(testMessage)

    const submitButton = page.locator('button[type="submit"]')
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    // Wait for redirect to chat page
    await page.waitForURL(/\/apps\/[a-f0-9-]+\/chats\/[a-zA-Z0-9-_]+/, {
      timeout: 30000,
    })

    const appId = testHelpers.extractAppId()
    const chatId = testHelpers.extractChatId()

    expect(appId).toBeTruthy()
    expect(chatId).toBeTruthy()
    expect(page.url()).toContain(`/apps/${appId}/chats/${chatId}`)

    // Navigate to app's chats page
    await page.goto(`/apps/${appId}/chats`)
    await testHelpers.waitForNavigation()

    // Verify chat input at top
    const chatsPageInput = page.locator(
      'textarea[placeholder*="Describe what you"]'
    )
    await expect(chatsPageInput).toBeVisible()

    // Verify heading
    await expect(
      page.locator('h2:has-text("Start a new conversation")')
    ).toBeVisible()

    // Verify previous chat appears in list
    await expect(page.locator('h3:has-text("Previous Chats")')).toBeVisible()
    await expect(
      page.locator(`a[href="/apps/${appId}/chats/${chatId}"]`)
    ).toBeVisible()

    // Submit another message
    const secondMessage = 'Add a comment system to the blog'
    await chatsPageInput.fill(secondMessage)

    const secondSubmitButton = page.locator('button[type="submit"]')
    await expect(secondSubmitButton).toBeEnabled()
    await secondSubmitButton.click()

    // Wait for redirect to new chat
    await page.waitForURL(/\/apps\/[a-f0-9-]+\/chats\/[a-zA-Z0-9-_]+/, {
      timeout: 30000,
    })

    const newChatId = testHelpers.extractChatId()
    expect(newChatId).toBeTruthy()
    expect(newChatId).not.toBe(chatId)

    // Verify same app, different chat
    const newAppId = testHelpers.extractAppId()
    expect(newAppId).toBe(appId)
    expect(page.url()).toContain(`/apps/${appId}/chats/${newChatId}`)
  })

  test('should display apps grid after creating an app', async ({
    page,
    authenticatedUser: _authenticatedUser,
    testHelpers,
  }) => {
    // Create first app
    await page.goto('/apps')
    await testHelpers.waitForNavigation()

    const chatInput = page.locator('textarea[placeholder*="What would you"]')
    await chatInput.fill('Test app for grid display')

    await page.locator('button[type="submit"]').click()

    await page.waitForURL(/\/apps\/[a-f0-9-]+\/chats\/[a-zA-Z0-9-_]+/, {
      timeout: 30000,
    })

    // Navigate back to /apps
    await page.goto('/apps')
    await testHelpers.waitForNavigation()

    // Verify "Your Apps" section is visible
    await expect(page.locator('h3:has-text("Your Apps")')).toBeVisible()

    // Verify apps grid contains the app
    const appCards = page.locator('.grid > div')
    await expect(appCards.first()).toBeVisible()

    // Verify app card has correct structure
    const firstCard = appCards.first()
    await expect(firstCard.locator('h4')).toBeVisible()
    await expect(
      firstCard.locator('a[href*="/apps/"][href*="/chats"]')
    ).toBeVisible()
  })

  test('should prevent empty message submission', async ({
    page,
    authenticatedUser: _authenticatedUser,
    testHelpers,
  }) => {
    await page.goto('/apps')
    await testHelpers.waitForNavigation()

    const submitButton = page.locator('button[type="submit"]')

    // Button should be disabled when empty
    await expect(submitButton).toBeDisabled()

    // Type and clear
    const chatInput = page.locator('textarea[placeholder*="What would you"]')
    await chatInput.fill('Test')
    await chatInput.clear()

    // Should be disabled again
    await expect(submitButton).toBeDisabled()
  })

  test('should validate UUID format for app and chat IDs', async ({
    page,
    authenticatedUser: _authenticatedUser,
    testHelpers,
  }) => {
    await page.goto('/apps')
    await testHelpers.waitForNavigation()

    await page.locator('textarea[placeholder*="What would you"]').fill('Test')
    await page.locator('button[type="submit"]').click()

    await page.waitForURL(/\/apps\/[a-f0-9-]+\/chats\/[a-zA-Z0-9-_]+/, {
      timeout: 30000,
    })

    // Validate app ID is UUID
    const appId = testHelpers.extractAppId()
    expect(appId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )

    // Validate chat ID format
    const chatId = testHelpers.extractChatId()
    expect(chatId).toMatch(/^[a-zA-Z0-9-_]+$/)
  })

  test('should maintain authentication across page transitions', async ({
    page,
    authenticatedUser: _authenticatedUser,
    testHelpers,
  }) => {
    // Start on /apps
    await page.goto('/apps')
    await testHelpers.waitForNavigation()

    // Create chat
    await page.locator('textarea[placeholder*="What would you"]').fill('Test')
    await page.locator('button[type="submit"]').click()

    await page.waitForURL(/\/apps\/[a-f0-9-]+\/chats\/[a-zA-Z0-9-_]+/, {
      timeout: 30000,
    })

    const appId = testHelpers.extractAppId()

    // Navigate between pages
    await page.goto(`/apps/${appId}/chats`)
    await testHelpers.waitForNavigation()
    expect(page.url()).not.toContain('/login')

    await page.goto('/apps')
    await testHelpers.waitForNavigation()
    expect(page.url()).not.toContain('/login')

    // Verify still authenticated
    await expect(
      page.locator('textarea[placeholder*="What would you"]')
    ).toBeVisible()
  })

  test('should disable submit button during submission', async ({
    page,
    authenticatedUser: _authenticatedUser,
    testHelpers,
  }) => {
    await page.goto('/apps')
    await testHelpers.waitForNavigation()

    const chatInput = page.locator('textarea[placeholder*="What would you"]')
    await chatInput.fill('Test submission state')

    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()

    // Button should be disabled immediately
    await expect(submitButton).toBeDisabled()

    // Wait for navigation
    await page.waitForURL(/\/apps\/[a-f0-9-]+\/chats\/[a-zA-Z0-9-_]+/, {
      timeout: 30000,
    })
  })

  test('should handle navigation between app chats page and individual chat', async ({
    page,
    authenticatedUser: _authenticatedUser,
    testHelpers,
  }) => {
    // Create app and chat
    await page.goto('/apps')
    await testHelpers.waitForNavigation()

    await page.locator('textarea[placeholder*="What would you"]').fill('Test')
    await page.locator('button[type="submit"]').click()

    await page.waitForURL(/\/apps\/[a-f0-9-]+\/chats\/[a-zA-Z0-9-_]+/, {
      timeout: 30000,
    })

    const appId = testHelpers.extractAppId()
    const firstChatId = testHelpers.extractChatId()

    // Go to app chats page
    await page.goto(`/apps/${appId}/chats`)
    await testHelpers.waitForNavigation()

    // Click on the chat in the list
    await page.locator(`a[href="/apps/${appId}/chats/${firstChatId}"]`).click()
    await testHelpers.waitForNavigation()

    // Should be on the chat page
    expect(page.url()).toContain(`/apps/${appId}/chats/${firstChatId}`)

    // Navigate back using browser back
    await page.goBack()
    await testHelpers.waitForNavigation()

    // Should be back on chats page
    expect(page.url()).toBe(`http://localhost:3000/apps/${appId}/chats`)
  })
})

test.describe('Edge Cases - Authenticated User Flow', () => {
  test('should handle rapid successive submissions correctly', async ({
    page,
    authenticatedUser: _authenticatedUser,
    testHelpers,
  }) => {
    await page.goto('/apps')
    await testHelpers.waitForNavigation()

    const chatInput = page.locator('textarea[placeholder*="What would you"]')
    const submitButton = page.locator('button[type="submit"]')

    // Fill and submit first message
    await chatInput.fill('First message')
    await submitButton.click()

    // Try to submit again immediately (should be prevented by disabled state)
    const isDisabled = await submitButton.isDisabled()
    expect(isDisabled).toBe(true)

    // Wait for first submission to complete
    await page.waitForURL(/\/apps\/[a-f0-9-]+\/chats\/[a-zA-Z0-9-_]+/, {
      timeout: 30000,
    })

    // Verify navigation occurred
    expect(page.url()).toContain('/chats/')
  })

  test('should display loading state during submission', async ({
    page,
    authenticatedUser: _authenticatedUser,
    testHelpers,
  }) => {
    await page.goto('/apps')
    await testHelpers.waitForNavigation()

    const chatInput = page.locator('textarea[placeholder*="What would you"]')
    await chatInput.fill('Test loading state')

    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()

    // Button should show loading state (disabled)
    await expect(submitButton).toBeDisabled()

    // Wait for completion
    await page.waitForURL(/\/apps\/[a-f0-9-]+\/chats\/[a-zA-Z0-9-_]+/, {
      timeout: 30000,
    })
  })

  test('should clear input after successful submission', async ({
    page,
    authenticatedUser: _authenticatedUser,
    testHelpers,
  }) => {
    await page.goto('/apps')
    await testHelpers.waitForNavigation()

    const testMessage = 'This message should be cleared'
    const chatInput = page.locator('textarea[placeholder*="What would you"]')
    await chatInput.fill(testMessage)

    await page.locator('button[type="submit"]').click()

    await page.waitForURL(/\/apps\/[a-f0-9-]+\/chats\/[a-zA-Z0-9-_]+/, {
      timeout: 30000,
    })

    // Go back to apps page
    await page.goto('/apps')
    await testHelpers.waitForNavigation()

    // Input should be empty (or have placeholder)
    const inputValue = await chatInput.inputValue()
    expect(inputValue).toBe('')
  })
})
