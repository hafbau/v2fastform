/**
 * Migration script to assign existing chats to apps
 *
 * This script:
 * 1. Finds all users who have chats without an appId
 * 2. Creates a "Default App" for each such user
 * 3. Updates all orphaned chats to belong to the user's default app
 *
 * Run with: npx tsx scripts/migrate-chats-to-apps.ts
 */

import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { eq, isNull } from "drizzle-orm"
import * as schema from "../lib/db/schema"

async function migrate() {
  const connectionString = process.env.POSTGRES_URL

  if (!connectionString) {
    console.error("POSTGRES_URL environment variable is required")
    process.exit(1)
  }

  console.log("Connecting to database...")
  const client = postgres(connectionString)
  const db = drizzle(client, { schema })

  try {
    // Find all distinct user IDs that have chats without an appId
    console.log("Finding users with orphaned chats...")
    const orphanedChats = await db
      .select({ userId: schema.chatOwnerships.userId })
      .from(schema.chatOwnerships)
      .where(isNull(schema.chatOwnerships.appId))
      .groupBy(schema.chatOwnerships.userId)

    const userIds = orphanedChats.map(row => row.userId)
    console.log(`Found ${userIds.length} users with orphaned chats`)

    if (userIds.length === 0) {
      console.log("No orphaned chats found. Migration complete!")
      await client.end()
      return
    }

    // For each user, create a default app and update their chats
    for (const userId of userIds) {
      console.log(`Processing user ${userId}...`)

      // Check if user already has a "Default App"
      const existingApp = await db
        .select()
        .from(schema.apps)
        .where(eq(schema.apps.userId, userId))
        .limit(1)

      let defaultAppId: string

      if (existingApp.length > 0) {
        // Use existing app as default
        defaultAppId = existingApp[0].id
        console.log(`  Using existing app ${defaultAppId} for user ${userId}`)
      } else {
        // Create a new default app
        const [newApp] = await db
          .insert(schema.apps)
          .values({
            userId,
            name: "Default App",
          })
          .returning()

        defaultAppId = newApp.id
        console.log(`  Created new default app ${defaultAppId} for user ${userId}`)
      }

      // Update all orphaned chats for this user to use the default app
      const result = await db
        .update(schema.chatOwnerships)
        .set({ appId: defaultAppId })
        .where(
          eq(schema.chatOwnerships.userId, userId)
        )
        .returning()

      // Filter to only count those that had null appId
      const updatedCount = result.filter(r => r.appId === defaultAppId).length
      console.log(`  Updated ${updatedCount} chats for user ${userId}`)
    }

    console.log("\nMigration complete!")
  } catch (error) {
    console.error("Migration failed:", error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

migrate()
