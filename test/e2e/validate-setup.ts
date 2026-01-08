/**
 * Validation Script for E2E Test Setup
 *
 * Run this script to verify that all prerequisites are met
 * before running E2E tests.
 *
 * Usage:
 *   npx tsx test/e2e/validate-setup.ts
 */

import { randomUUID } from 'crypto'

async function validateDatabaseConnection(): Promise<boolean> {
  try {
    const { getDb } = await import('../../lib/db/connection')
    const { sql } = await import('drizzle-orm')
    const db = getDb()

    // Test basic query
    await db.execute(sql`SELECT 1`)

    console.log('✅ Database connection: OK')
    return true
  } catch (error) {
    console.error('❌ Database connection: FAILED')
    console.error('Error:', error)
    return false
  }
}

async function validateDatabaseSchema(): Promise<boolean> {
  try {
    const { getDb } = await import('../../lib/db/connection')
    const { users, apps, chatOwnerships } = await import('../../lib/db/schema')
    const db = getDb()

    // Check if tables exist by querying them
    await db.select().from(users).limit(1)
    await db.select().from(apps).limit(1)
    await db.select().from(chatOwnerships).limit(1)

    console.log('✅ Database schema: OK')
    return true
  } catch (error) {
    console.error('❌ Database schema: FAILED')
    console.error('Error:', error)
    console.error('\nRun: pnpm db:migrate')
    return false
  }
}

async function validateEnvironmentVariables(): Promise<boolean> {
  const required = [
    'POSTGRES_URL',
    'AUTH_SECRET',
    'NEXTAUTH_SECRET',
    'V0_API_KEY',
  ]

  const missing: string[] = []

  for (const varName of required) {
    if (!process.env[varName]) {
      missing.push(varName)
    }
  }

  if (missing.length > 0) {
    console.error('❌ Environment variables: FAILED')
    console.error('Missing variables:', missing.join(', '))
    console.error('\nCheck your .env.local file')
    return false
  }

  console.log('✅ Environment variables: OK')
  return true
}

async function validateTestUserCreation(): Promise<boolean> {
  try {
    const { hash } = await import('bcrypt-ts')
    const { getDb } = await import('../../lib/db/connection')
    const { users } = await import('../../lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const db = getDb()

    // Create test user
    const testEmail = `validation-test-${randomUUID()}@example.com`
    const hashedPassword = await hash('TestPassword123!', 10)

    const [user] = await db
      .insert(users)
      .values({
        email: testEmail,
        password: hashedPassword,
      })
      .returning()

    // Clean up
    await db.delete(users).where(eq(users.id, user.id))

    console.log('✅ Test user creation: OK')
    return true
  } catch (error) {
    console.error('❌ Test user creation: FAILED')
    console.error('Error:', error)
    return false
  }
}

async function validateNextServer(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:3000', {
      method: 'HEAD',
    })

    if (response.ok || response.status === 404) {
      console.log('✅ Next.js server: OK')
      return true
    } else {
      throw new Error(`Server returned status ${response.status}`)
    }
  } catch (error) {
    console.error('❌ Next.js server: FAILED')
    console.error('Error:', error)
    console.error('\nRun: pnpm dev')
    return false
  }
}

async function main() {
  console.log('Validating E2E Test Setup...\n')

  const results = await Promise.all([
    validateEnvironmentVariables(),
    validateDatabaseConnection(),
    validateDatabaseSchema(),
    validateTestUserCreation(),
    validateNextServer(),
  ])

  const allPassed = results.every((r) => r)

  console.log('\n' + '='.repeat(50))

  if (allPassed) {
    console.log('✅ All checks passed! Ready to run E2E tests.')
    console.log('\nRun tests with:')
    console.log('  pnpm test:e2e')
    process.exit(0)
  } else {
    console.log('❌ Some checks failed. Please fix the issues above.')
    process.exit(1)
  }
}

main()
