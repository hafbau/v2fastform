import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/(auth)/auth'
import { getAppById } from '@/lib/db/queries'
import { getDb } from '@/lib/db/connection'
import { apps } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { isValidAppSpec, type FastformAppSpec } from '@/lib/types/appspec'

/**
 * POST /api/apps/[appId]/appspec
 *
 * Persists a confirmed AppSpec to the database. This endpoint is called when the user
 * clicks "Confirm & Build" in the intent confirmation component.
 *
 * Authentication: Required
 * Authorization: User must own the app
 *
 * Request Body:
 * {
 *   spec: FastformAppSpec,
 *   sessionId?: string // optional, for cleanup
 * }
 *
 * Success Response:
 * {
 *   success: true,
 *   app: {
 *     id: string,
 *     name: string,
 *     slug: string,
 *     spec: FastformAppSpec
 *   }
 * }
 *
 * Error Responses:
 * - 400: Invalid AppSpec structure or missing required fields
 * - 401: Not authenticated
 * - 403: User doesn't own the app
 * - 404: App not found
 * - 500: Database or server errors
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  try {
    // Authentication check
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      )
    }

    // Parse request body
    const { appId } = await params
    let body: { spec: unknown; sessionId?: string }

    try {
      body = await request.json()
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 },
      )
    }

    // Validate request body structure
    if (!body.spec) {
      return NextResponse.json(
        { error: 'Missing required field: spec' },
        { status: 400 },
      )
    }

    // Validate AppSpec structure
    if (!isValidAppSpec(body.spec)) {
      return NextResponse.json(
        {
          error: 'Invalid AppSpec structure',
          details:
            'The provided spec does not conform to FastformAppSpec v0.3 schema',
        },
        { status: 400 },
      )
    }

    const draftSpec = body.spec as FastformAppSpec

    // Fetch the app from database
    const app = await getAppById({ appId })

    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 })
    }

    // Authorization check: verify user owns the app
    if (app.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to modify this app' },
        { status: 403 },
      )
    }

    // Persist the AppSpec to database
    const db = getDb()
    const [updatedApp] = await db
      .update(apps)
      .set({ spec: draftSpec })
      .where(eq(apps.id, appId))
      .returning()

    if (!updatedApp) {
      throw new Error('Failed to update app spec in database')
    }

    // Extract slug from the AppSpec meta
    const slug = draftSpec.meta.slug

    // Return success response with app data
    return NextResponse.json({
      success: true,
      app: {
        id: updatedApp.id,
        name: updatedApp.name,
        slug,
        spec: updatedApp.spec,
      },
    })
  } catch (error) {
    console.error('AppSpec persistence error:', error)
    return NextResponse.json(
      {
        error: 'Failed to persist AppSpec',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

/**
 * GET /api/apps/[appId]/appspec
 *
 * Retrieves the AppSpec for a given app from the database.
 *
 * Authentication: Required
 * Authorization: User must own the app
 *
 * Success Response:
 * {
 *   success: true,
 *   spec: FastformAppSpec | null
 * }
 *
 * Error Responses:
 * - 401: Not authenticated
 * - 403: User doesn't own the app
 * - 404: App not found
 * - 500: Database or server errors
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  try {
    // Authentication check
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      )
    }

    const { appId } = await params

    // Fetch the app from database
    const app = await getAppById({ appId })

    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 })
    }

    // Authorization check: verify user owns the app
    if (app.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to access this app' },
        { status: 403 },
      )
    }

    // Return the AppSpec (may be null or empty object if not yet set)
    const spec = app.spec && Object.keys(app.spec).length > 0 ? app.spec : null

    return NextResponse.json({
      success: true,
      spec,
    })
  } catch (error) {
    console.error('AppSpec retrieval error:', error)
    return NextResponse.json(
      {
        error: 'Failed to retrieve AppSpec',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
