import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { DUMMY_PASSWORD } from "@/lib/constants"
import type { DefaultJWT } from "next-auth/jwt"

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

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
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

          const users = await getUser(email)

          if (users.length === 0) {
            await compare(password, DUMMY_PASSWORD)
            return null
          }

          const [user] = users

          if (!user.password) {
            await compare(password, DUMMY_PASSWORD)
            return null
          }

          const passwordsMatch = await compare(password, user.password)

          if (!passwordsMatch) return null

          return { ...user, type: "regular" as const }
        } catch (error) {
          console.error("[v0] Auth authorize error:", error)
          return null
        }
      },
    }),
    Credentials({
      id: "guest",
      credentials: {},
      async authorize() {
        try {
          const { createGuestUser } = await import("@/lib/db/queries")
          const [guestUser] = await createGuestUser()
          return { ...guestUser, type: "guest" as const }
        } catch (error) {
          console.error("[v0] Guest auth error:", error)
          return null
        }
      },
    }),
  ],
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
  },
})

export { authConfig }
