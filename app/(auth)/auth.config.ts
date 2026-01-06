import type { NextAuthConfig } from "next-auth"
import { authConfig } from "./auth"

const config: NextAuthConfig = {
  pages: {
    signIn: "/login",
    newUser: "/",
  },
  providers: [],
  callbacks: {},
}

export { authConfig }
