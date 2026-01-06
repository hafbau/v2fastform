import { type NextRequest, NextResponse } from "next/server"
import { GET as _GET, POST as _POST } from "@/app/(auth)/auth"

export async function GET(request: NextRequest) {
  try {
    return await _GET(request)
  } catch (error) {
    console.error("[v0] Auth GET error:", error)
    return NextResponse.json({ error: "Authentication service unavailable" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    return await _POST(request)
  } catch (error) {
    console.error("[v0] Auth POST error:", error)
    return NextResponse.json({ error: "Authentication service unavailable" }, { status: 500 })
  }
}
