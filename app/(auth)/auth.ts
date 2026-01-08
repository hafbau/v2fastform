import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Nodemailer from "next-auth/providers/nodemailer"
import { DUMMY_PASSWORD } from "@/lib/constants"
import type { DefaultJWT } from "next-auth/jwt"
import { getDb } from "@/lib/db/connection"
import { users, verificationTokens } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    newUser: "/",
  },
  providers: [],
  callbacks: {},
}

if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "v0-dev-secret-key-not-for-production-use"
}

export type UserType = "guest" | "regular"

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string
      type: UserType
    } & DefaultSession["user"]
  }

  interface User {
    id?: string
    email?: string | null
    type: UserType
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string
    type: UserType
  }
}

/**
 * Check if email service is configured
 */
function isEmailConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  )
}

/**
 * Get SMTP transport configuration for Nodemailer provider
 */
function getSmtpTransport() {
  if (!isEmailConfigured()) {
    return undefined
  }

  return {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  }
}

/**
 * Custom adapter for verification tokens (magic links)
 * Uses Drizzle ORM directly for token storage
 */
const verificationTokenAdapter = {
  async createVerificationToken(data: {
    identifier: string
    token: string
    expires: Date
  }) {
    const db = getDb()
    await db.insert(verificationTokens).values({
      identifier: data.identifier,
      token: data.token,
      expires: data.expires,
    })
    return data
  },

  async useVerificationToken(params: { identifier: string; token: string }) {
    const db = getDb()
    const [tokenRecord] = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, params.identifier),
          eq(verificationTokens.token, params.token)
        )
      )

    if (!tokenRecord) {
      return null
    }

    // Delete the token after use (one-time use)
    await db
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, params.identifier),
          eq(verificationTokens.token, params.token)
        )
      )

    return {
      identifier: tokenRecord.identifier,
      token: tokenRecord.token,
      expires: tokenRecord.expires,
    }
  },
}

/**
 * Build providers array dynamically based on configuration
 */
function buildProviders() {
  const providers = [
    // Standard email/password credentials
    Credentials({
      credentials: {},
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string" ? credentials.email : undefined
        const password =
          typeof credentials?.password === "string"
            ? credentials.password
            : undefined

        if (!email || !password) return null

        try {
          const { compare } = await import("bcrypt-ts")
          const { getUser } = await import("@/lib/db/queries")

          const existingUsers = await getUser(email)

          if (existingUsers.length === 0) {
            await compare(password, DUMMY_PASSWORD)
            return null
          }

          const [user] = existingUsers

          if (!user.password) {
            await compare(password, DUMMY_PASSWORD)
            return null
          }

          const passwordsMatch = await compare(password, user.password)

          if (!passwordsMatch) return null

          return { ...user, type: "regular" as const }
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.error("[v0] Auth authorize error:", error)
          }
          return null
        }
      },
    }),

    // Guest login (creates anonymous user)
    Credentials({
      id: "guest",
      credentials: {},
      async authorize() {
        try {
          const { createGuestUser } = await import("@/lib/db/queries")
          const [guestUser] = await createGuestUser()
          return { ...guestUser, type: "guest" as const }
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.error("[v0] Guest auth error:", error)
          }
          return null
        }
      },
    }),
  ]

  // Add magic link provider if email is configured
  const smtpTransport = getSmtpTransport()
  if (smtpTransport) {
    providers.push(
      Nodemailer({
        server: smtpTransport,
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
      })
    )
  }

  return providers
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: buildProviders(),
  adapter: {
    // Use custom verification token adapter for magic links
    createVerificationToken: verificationTokenAdapter.createVerificationToken,
    useVerificationToken: verificationTokenAdapter.useVerificationToken,

    // User management - find or create user by email for magic link
    async getUserByEmail(email: string) {
      const db = getDb()
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))

      if (!user) return null
      return { ...user, type: "regular" as UserType }
    },

    async createUser(data: { email: string }) {
      const db = getDb()
      const [newUser] = await db
        .insert(users)
        .values({
          email: data.email,
        })
        .returning()

      return { ...newUser, type: "regular" as UserType }
    },

    async getUser(id: string) {
      const { getUserById } = await import("@/lib/db/queries")
      const user = await getUserById(id)
      if (!user) return null
      return { ...user, type: "regular" as UserType }
    },

    // Required adapter methods that we don't need for our use case
    async getUserByAccount() {
      return null
    },
    async updateUser() {
      return null as never
    },
    async linkAccount() {
      return null
    },
    async createSession() {
      return null as never
    },
    async getSessionAndUser() {
      return null
    },
    async updateSession() {
      return null
    },
    async deleteSession() {
      return
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        token.type = user.type
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.type = token.type
      }

      return session
    },
    async signIn({ user, account }) {
      // For magic link sign in, ensure user exists and is properly typed
      if (account?.provider === "nodemailer") {
        // User will be created by adapter if not exists
        if (user && !("type" in user)) {
          (user as { type: UserType }).type = "regular"
        }
      }
      return true
    },
  },
})

export { authConfig }
