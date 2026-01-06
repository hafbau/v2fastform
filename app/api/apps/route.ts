import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/(auth)/auth'
import { createApp, getAppsByUserId } from '@/lib/db/queries'

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apps = await getAppsByUserId({ userId: session.user.id })

    return NextResponse.json({ data: apps })
  } catch (error) {
    console.error('Apps fetch error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch apps',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'App name is required' },
        { status: 400 },
      )
    }

    const [app] = await createApp({
      userId: session.user.id,
      name: name.trim(),
    })

    return NextResponse.json({ data: app }, { status: 201 })
  } catch (error) {
    console.error('App creation error:', error)
    return NextResponse.json(
      {
        error: 'Failed to create app',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
