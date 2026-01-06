import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

type Database = PostgresJsDatabase<typeof schema>

let db: Database | null = null

// Only initialize database if POSTGRES_URL is available
if (process.env.POSTGRES_URL) {
  console.log("🗄️  Using PostgreSQL database")
  const client = postgres(process.env.POSTGRES_URL)
  db = drizzle(client, { schema })
}

export function getDb(): Database {
  if (!db) {
    throw new Error("Database not initialized. Please ensure POSTGRES_URL environment variable is set.")
  }
  return db
}

export default db
