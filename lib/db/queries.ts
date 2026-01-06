import "server-only"

import { and, count, desc, eq, gte } from "drizzle-orm"

import { users, apps, chatOwnerships, anonymousChatLogs, type User, type App } from "./schema"
import { generateUUID } from "../utils"
import { generateHashedPassword } from "./utils"
import { getDb } from "./connection"

export async function getUser(email: string): Promise<Array<User>> {
  try {
    const db = getDb()
    return await db.select().from(users).where(eq(users.email, email))
  } catch (error) {
    console.error("Failed to get user from database:", error)
    return []
  }
}

export async function createUser(email: string, password: string): Promise<User[]> {
  try {
    const db = getDb()
    const hashedPassword = generateHashedPassword(password)
    return await db
      .insert(users)
      .values({
        email,
        password: hashedPassword,
      })
      .returning()
  } catch (error) {
    console.error("Failed to create user in database:", error)
    throw error
  }
}

export async function createGuestUser(): Promise<User[]> {
  try {
    const db = getDb()
    const guestId = generateUUID()
    const guestEmail = `guest-${guestId}@example.com`

    return await db
      .insert(users)
      .values({
        email: guestEmail,
        password: null,
      })
      .returning()
  } catch (error) {
    console.error("Failed to create guest user in database:", error)
    throw error
  }
}

// App functions
export async function createApp({
  userId,
  name,
}: {
  userId: string
  name: string
}): Promise<App[]> {
  try {
    const db = getDb()
    return await db
      .insert(apps)
      .values({
        userId,
        name,
      })
      .returning()
  } catch (error) {
    console.error("Failed to create app in database:", error)
    throw error
  }
}

export async function getAppsByUserId({
  userId,
}: {
  userId: string
}): Promise<App[]> {
  try {
    const db = getDb()
    return await db
      .select()
      .from(apps)
      .where(eq(apps.userId, userId))
      .orderBy(desc(apps.createdAt))
  } catch (error) {
    console.error("Failed to get apps by user from database:", error)
    throw error
  }
}

export async function getAppById({
  appId,
}: {
  appId: string
}): Promise<App | undefined> {
  try {
    const db = getDb()
    const [app] = await db.select().from(apps).where(eq(apps.id, appId))
    return app
  } catch (error) {
    console.error("Failed to get app by id from database:", error)
    throw error
  }
}

export async function deleteApp({ appId }: { appId: string }) {
  try {
    const db = getDb()
    return await db.delete(apps).where(eq(apps.id, appId))
  } catch (error) {
    console.error("Failed to delete app from database:", error)
    throw error
  }
}

// Chat ownership functions
export async function createChatOwnership({
  v0ChatId,
  userId,
  appId,
}: {
  v0ChatId: string
  userId: string
  appId?: string // optional during migration, required for new chats
}) {
  try {
    const db = getDb()
    return await db
      .insert(chatOwnerships)
      .values({
        v0ChatId,
        userId,
        appId,
      })
      .onConflictDoNothing({ target: chatOwnerships.v0ChatId })
  } catch (error) {
    console.error("Failed to create chat ownership in database:", error)
    throw error
  }
}

export async function getChatOwnership({ v0ChatId }: { v0ChatId: string }) {
  try {
    const db = getDb()
    const [ownership] = await db.select().from(chatOwnerships).where(eq(chatOwnerships.v0ChatId, v0ChatId))
    return ownership
  } catch (error) {
    console.error("Failed to get chat ownership from database:", error)
    throw error
  }
}

export async function getChatIdsByUserId({
  userId,
}: {
  userId: string
}): Promise<string[]> {
  try {
    const db = getDb()
    const ownerships = await db
      .select({ v0ChatId: chatOwnerships.v0ChatId })
      .from(chatOwnerships)
      .where(eq(chatOwnerships.userId, userId))
      .orderBy(desc(chatOwnerships.createdAt))

    return ownerships.map((o) => o.v0ChatId)
  } catch (error) {
    console.error("Failed to get chat IDs by user from database:", error)
    throw error
  }
}

export async function deleteChatOwnership({ v0ChatId }: { v0ChatId: string }) {
  try {
    const db = getDb()
    return await db.delete(chatOwnerships).where(eq(chatOwnerships.v0ChatId, v0ChatId))
  } catch (error) {
    console.error("Failed to delete chat ownership from database:", error)
    throw error
  }
}

export async function getChatIdsByAppId({
  appId,
}: {
  appId: string
}): Promise<string[]> {
  try {
    const db = getDb()
    const ownerships = await db
      .select({ v0ChatId: chatOwnerships.v0ChatId })
      .from(chatOwnerships)
      .where(eq(chatOwnerships.appId, appId))
      .orderBy(desc(chatOwnerships.createdAt))

    return ownerships.map((o) => o.v0ChatId)
  } catch (error) {
    console.error("Failed to get chat IDs by app from database:", error)
    throw error
  }
}

export async function deleteChatOwnershipsByAppId({ appId }: { appId: string }) {
  try {
    const db = getDb()
    return await db.delete(chatOwnerships).where(eq(chatOwnerships.appId, appId))
  } catch (error) {
    console.error("Failed to delete chat ownerships by app from database:", error)
    throw error
  }
}

// Rate limiting functions
export async function getChatCountByUserId({
  userId,
  differenceInHours,
}: {
  userId: string
  differenceInHours: number
}): Promise<number> {
  try {
    const db = getDb()
    const hoursAgo = new Date(Date.now() - differenceInHours * 60 * 60 * 1000)

    const [stats] = await db
      .select({ count: count(chatOwnerships.id) })
      .from(chatOwnerships)
      .where(and(eq(chatOwnerships.userId, userId), gte(chatOwnerships.createdAt, hoursAgo)))

    return stats?.count || 0
  } catch (error) {
    console.error("Failed to get chat count by user from database:", error)
    throw error
  }
}

export async function getChatCountByIP({
  ipAddress,
  differenceInHours,
}: {
  ipAddress: string
  differenceInHours: number
}): Promise<number> {
  try {
    const db = getDb()
    const hoursAgo = new Date(Date.now() - differenceInHours * 60 * 60 * 1000)

    const [stats] = await db
      .select({ count: count(anonymousChatLogs.id) })
      .from(anonymousChatLogs)
      .where(and(eq(anonymousChatLogs.ipAddress, ipAddress), gte(anonymousChatLogs.createdAt, hoursAgo)))

    return stats?.count || 0
  } catch (error) {
    console.error("Failed to get chat count by IP from database:", error)
    throw error
  }
}

export async function createAnonymousChatLog({
  ipAddress,
  v0ChatId,
}: {
  ipAddress: string
  v0ChatId: string
}) {
  try {
    const db = getDb()
    return await db.insert(anonymousChatLogs).values({
      ipAddress: ipAddress,
      v0ChatId: v0ChatId,
    })
  } catch (error) {
    console.error("Failed to create anonymous chat log in database:", error)
    throw error
  }
}
