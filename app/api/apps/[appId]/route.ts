import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/(auth)/auth'
import { getAppById, deleteApp, deleteChatOwnershipsByAppId } from '@/lib/db/queries'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { appId } = await params
    const app = await getAppById({ appId })

    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 })
    }

    // Verify user owns the app
    if (app.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ data: app })
  } catch (error) {
    console.error('App fetch error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch app',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { appId } = await params
    const app = await getAppById({ appId })

    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 })
    }

    // Verify user owns the app
    if (app.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // First delete all chat ownerships for this app (cascade)
    await deleteChatOwnershipsByAppId({ appId })

    // Then delete the app
    await deleteApp({ appId })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('App deletion error:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete app',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
