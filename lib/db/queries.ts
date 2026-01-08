import "server-only"

import { and, count, desc, eq, gte } from "drizzle-orm"

import { users, apps, chatOwnerships, anonymousChatLogs, submissions, submissionHistory, type User, type App, type Submission, type SubmissionHistory } from "./schema"
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

export async function getUserById(id: string): Promise<User | null> {
  try {
    const db = getDb()
    const [user] = await db.select().from(users).where(eq(users.id, id))
    return user || null
  } catch (error) {
    console.error("Failed to get user by ID from database:", error)
    return null
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
/**
 * Creates a chat ownership record linking a v0 chat to a user and app.
 * All chats must belong to an app (no orphan chats allowed).
 */
export async function createChatOwnership({
  v0ChatId,
  userId,
  appId,
}: {
  v0ChatId: string
  userId: string
  appId: string
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

// Submission functions
/**
 * Creates a new submission record.
 */
export async function createSubmission({
  appId,
  data,
  status,
  submittedBy,
}: {
  appId: string
  data: Record<string, unknown>
  status: string
  submittedBy?: string | null
}): Promise<Submission[]> {
  try {
    const db = getDb()
    return await db
      .insert(submissions)
      .values({
        appId,
        data,
        status,
        submittedBy: submittedBy || null,
      })
      .returning()
  } catch (error) {
    console.error("Failed to create submission in database:", error)
    throw error
  }
}

/**
 * Gets a submission by ID.
 */
export async function getSubmissionById({
  submissionId,
}: {
  submissionId: string
}): Promise<Submission | undefined> {
  try {
    const db = getDb()
    const [submission] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionId))
    return submission
  } catch (error) {
    console.error("Failed to get submission from database:", error)
    throw error
  }
}

/**
 * Gets submissions for an app with optional filtering and pagination.
 */
export async function getSubmissionsByAppId({
  appId,
  status,
  page = 1,
  limit = 20,
}: {
  appId: string
  status?: string
  page?: number
  limit?: number
}): Promise<{ submissions: Submission[]; total: number }> {
  try {
    const db = getDb()
    const offset = (page - 1) * limit

    // Build where clause
    const whereConditions = [eq(submissions.appId, appId)]
    if (status) {
      whereConditions.push(eq(submissions.status, status))
    }

    // Get paginated submissions
    const submissionsData = await db
      .select()
      .from(submissions)
      .where(and(...whereConditions))
      .orderBy(desc(submissions.createdAt))
      .limit(limit)
      .offset(offset)

    // Get total count
    const [{ count: total }] = await db
      .select({ count: count(submissions.id) })
      .from(submissions)
      .where(and(...whereConditions))

    return {
      submissions: submissionsData,
      total: total || 0,
    }
  } catch (error) {
    console.error("Failed to get submissions from database:", error)
    throw error
  }
}

/**
 * Updates a submission status.
 */
export async function updateSubmissionStatus({
  submissionId,
  status,
}: {
  submissionId: string
  status: string
}): Promise<Submission[]> {
  try {
    const db = getDb()
    return await db
      .update(submissions)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, submissionId))
      .returning()
  } catch (error) {
    console.error("Failed to update submission status in database:", error)
    throw error
  }
}

/**
 * Deletes submissions for an app (used when deleting an app).
 */
export async function deleteSubmissionsByAppId({
  appId,
}: {
  appId: string
}) {
  try {
    const db = getDb()
    return await db.delete(submissions).where(eq(submissions.appId, appId))
  } catch (error) {
    console.error("Failed to delete submissions from database:", error)
    throw error
  }
}

/**
 * Updates a submission with full details (status, assignedTo, etc.).
 */
export async function updateSubmission({
  submissionId,
  status,
  assignedTo,
}: {
  submissionId: string
  status?: string
  assignedTo?: string | null
}): Promise<Submission[]> {
  try {
    const db = getDb()
    const updateData: Partial<Submission> = {
      updatedAt: new Date(),
    }

    if (status !== undefined) {
      updateData.status = status
    }

    if (assignedTo !== undefined) {
      updateData.assignedTo = assignedTo
    }

    return await db
      .update(submissions)
      .set(updateData)
      .where(eq(submissions.id, submissionId))
      .returning()
  } catch (error) {
    console.error("Failed to update submission in database:", error)
    throw error
  }
}

/**
 * Updates submission data and status (for resume/resubmit flows).
 */
export async function updateSubmissionData({
  submissionId,
  data,
  status,
}: {
  submissionId: string
  data: Record<string, unknown>
  status?: string
}): Promise<Submission[]> {
  try {
    const db = getDb()
    const updateData: Partial<Submission> = {
      data,
      updatedAt: new Date(),
    }

    if (status !== undefined) {
      updateData.status = status
    }

    return await db
      .update(submissions)
      .set(updateData)
      .where(eq(submissions.id, submissionId))
      .returning()
  } catch (error) {
    console.error("Failed to update submission data in database:", error)
    throw error
  }
}

/**
 * Soft deletes a submission by setting the deleted timestamp.
 */
export async function softDeleteSubmission({
  submissionId,
}: {
  submissionId: string
}): Promise<Submission[]> {
  try {
    const db = getDb()
    return await db
      .update(submissions)
      .set({
        deleted: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, submissionId))
      .returning()
  } catch (error) {
    console.error("Failed to soft delete submission in database:", error)
    throw error
  }
}

/**
 * Gets submission history for audit trail.
 */
export async function getSubmissionHistory({
  submissionId,
}: {
  submissionId: string
}): Promise<SubmissionHistory[]> {
  try {
    const db = getDb()
    return await db
      .select()
      .from(submissionHistory)
      .where(eq(submissionHistory.submissionId, submissionId))
      .orderBy(desc(submissionHistory.createdAt))
  } catch (error) {
    console.error("Failed to get submission history from database:", error)
    throw error
  }
}

/**
 * Creates a submission history entry.
 */
export async function createSubmissionHistory({
  submissionId,
  status,
  updatedBy,
  notes,
}: {
  submissionId: string
  status: string
  updatedBy: string
  notes?: string | null
}): Promise<SubmissionHistory[]> {
  try {
    const db = getDb()
    return await db
      .insert(submissionHistory)
      .values({
        submissionId,
        status,
        updatedBy,
        notes: notes || null,
      })
      .returning()
  } catch (error) {
    console.error("Failed to create submission history in database:", error)
    throw error
  }
}
