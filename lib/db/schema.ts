import type { InferSelectModel } from 'drizzle-orm'
import {
  pgTable,
  varchar,
  timestamp,
  uuid,
  unique,
  jsonb,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  email: varchar('email', { length: 64 }).notNull(),
  password: varchar('password', { length: 64 }),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export type User = InferSelectModel<typeof users>

// Apps - the primary entity users interact with
// An app contains multiple chats
export const apps = pgTable('apps', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  userId: uuid('userId')
    .notNull()
    .references(() => users.id),
  name: varchar('name', { length: 255 }).notNull(),
  spec: jsonb('spec').notNull().default('{}'),
  jwtSecret: varchar('jwtSecret', { length: 255 }), // JWT secret for generated app authentication
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export type App = InferSelectModel<typeof apps>

// Simple ownership mapping for v0 chats
// The actual chat data lives in v0 API, we just track who owns what
export const chatOwnerships = pgTable(
  'chatOwnerships',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    v0ChatId: varchar('v0ChatId', { length: 255 }).notNull(), // v0 API chat ID
    userId: uuid('userId')
      .notNull()
      .references(() => users.id),
    appId: uuid('appId')
      .notNull()
      .references(() => apps.id),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    // Ensure each v0 chat can only be owned by one user
    uniqueV0Chat: unique().on(table.v0ChatId),
  }),
)

export type ChatOwnership = InferSelectModel<typeof chatOwnerships>

// Track anonymous chat creation by IP for rate limiting
export const anonymousChatLogs = pgTable('anonymousChatLogs', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  ipAddress: varchar('ipAddress', { length: 45 }).notNull(), // IPv6 can be up to 45 chars
  v0ChatId: varchar('v0ChatId', { length: 255 }).notNull(), // v0 API chat ID
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export type AnonymousChatLog = InferSelectModel<typeof anonymousChatLogs>

// Submissions - form data submitted through generated apps
export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  appId: uuid('appId')
    .references(() => apps.id)
    .notNull(),
  data: jsonb('data').notNull(), // AppSpec-validated form data
  status: varchar('status', { length: 20 }).notNull(), // SUBMITTED, NEEDS_INFO, APPROVED, REJECTED
  submittedBy: varchar('submittedBy', { length: 255 }), // Optional identifier for who submitted (email, user ID, etc.)
  assignedTo: varchar('assignedTo', { length: 255 }), // Staff member assigned to this submission
  deleted: timestamp('deleted'), // Soft delete timestamp
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
})

export type Submission = InferSelectModel<typeof submissions>

// Submission History - audit trail for workflow transitions
export const submissionHistory = pgTable('submissionHistory', {
  id: uuid('id').primaryKey().defaultRandom(),
  submissionId: uuid('submissionId')
    .references(() => submissions.id)
    .notNull(),
  status: varchar('status', { length: 20 }).notNull(), // Status at this point in history
  updatedBy: varchar('updatedBy', { length: 255 }).notNull(), // User who made the change
  notes: varchar('notes', { length: 1000 }), // Optional notes/comments
  createdAt: timestamp('createdAt').defaultNow().notNull(),
})

export type SubmissionHistory = InferSelectModel<typeof submissionHistory>

// Verification Tokens - for NextAuth Email provider magic links
export const verificationTokens = pgTable(
  'verificationTokens',
  {
    identifier: varchar('identifier', { length: 255 }).notNull(), // Email address
    token: varchar('token', { length: 255 }).notNull(),
    expires: timestamp('expires').notNull(),
  },
  (table) => ({
    // Composite unique key on identifier + token
    uniqueToken: unique().on(table.identifier, table.token),
  })
)

export type VerificationToken = InferSelectModel<typeof verificationTokens>
