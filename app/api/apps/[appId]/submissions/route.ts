import { NextRequest, NextResponse } from 'next/server'
import { getAppById, createSubmission, getSubmissionsByAppId } from '@/lib/db/queries'
import { validateSubmission, sanitizeSubmissionData } from '@/lib/submissions/validation'
import { verifyAppJWT, extractTokenFromHeader } from '@/lib/auth/jwt'
import type { FastformAppSpec } from '@/lib/types/appspec'
import { isValidAppSpec } from '@/lib/types/appspec'

/**
 * POST /api/apps/[appId]/submissions
 *
 * Creates a new submission for a generated app.
 *
 * Request:
 * - Headers: Authorization: Bearer <JWT>
 * - Body: { data: Record<string, unknown>, submittedBy?: string }
 *
 * Workflow:
 * 1. Validate JWT token from generated app
 * 2. Verify app exists and has valid AppSpec
 * 3. Validate submission data against AppSpec
 * 4. Sanitize data to prevent XSS
 * 5. Create submission record with SUBMITTED status
 * 6. Return submission ID and metadata
 *
 * Response (201):
 * {
 *   success: true,
 *   submission: {
 *     id: string,
 *     appId: string,
 *     status: 'SUBMITTED',
 *     createdAt: string,
 *     submittedBy: string | null
 *   }
 * }
 *
 * Error responses:
 * - 401: Authentication failed (missing or invalid token)
 * - 404: App not found or no AppSpec
 * - 400: Validation failed (invalid submission data)
 * - 500: Database error
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  try {
    // ========================================================================
    // PHASE 1: Extract and validate JWT authentication
    // ========================================================================
    const authHeader = request.headers.get('authorization')
    const token = extractTokenFromHeader(authHeader)

    if (!token) {
      console.error('[Submissions API] Missing authentication token')
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
          message: 'Missing or invalid Authorization header',
        },
        { status: 401 }
      )
    }

    // ========================================================================
    // PHASE 2: Get app and verify JWT matches
    // ========================================================================
    const { appId } = await params
    const app = await getAppById({ appId })

    if (!app) {
      console.error(`[Submissions API] App not found: ${appId}`)
      return NextResponse.json(
        {
          success: false,
          error: 'App not found',
          message: `App with ID ${appId} does not exist`,
        },
        { status: 404 }
      )
    }

    // Check if app has JWT secret configured
    if (!app.jwtSecret) {
      console.error(`[Submissions API] App ${appId} has no JWT secret configured`)
      return NextResponse.json(
        {
          success: false,
          error: 'App not configured',
          message: 'This app is not configured to accept submissions',
        },
        { status: 403 }
      )
    }

    // Verify JWT token
    let jwtPayload
    try {
      jwtPayload = await verifyAppJWT(token, app.jwtSecret)
    } catch (error) {
      console.error(`[Submissions API] JWT verification failed for app ${appId}:`, error)
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication failed',
          message: error instanceof Error ? error.message : 'Invalid authentication token',
        },
        { status: 401 }
      )
    }

    // Verify JWT appId matches URL appId
    if (jwtPayload.appId !== appId) {
      console.error(
        `[Submissions API] JWT appId mismatch: JWT=${jwtPayload.appId}, URL=${appId}`
      )
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication failed',
          message: 'Token does not match app ID',
        },
        { status: 401 }
      )
    }

    // ========================================================================
    // PHASE 3: Parse and validate request body
    // ========================================================================
    let body: { data?: Record<string, unknown>; submittedBy?: string }
    try {
      body = await request.json()
    } catch (error) {
      console.error('[Submissions API] Failed to parse request body:', error)
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request',
          message: 'Request body must be valid JSON',
        },
        { status: 400 }
      )
    }

    if (!body.data || typeof body.data !== 'object') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request',
          message: 'Request body must contain a "data" object',
        },
        { status: 400 }
      )
    }

    // ========================================================================
    // PHASE 4: Validate AppSpec and submission data
    // ========================================================================
    // Parse and validate AppSpec
    let appSpec: FastformAppSpec
    try {
      if (!app.spec || typeof app.spec !== 'object') {
        throw new Error('App has no spec configured')
      }

      if (!isValidAppSpec(app.spec)) {
        throw new Error('App spec is invalid')
      }

      appSpec = app.spec as FastformAppSpec
    } catch (error) {
      console.error(`[Submissions API] Invalid AppSpec for app ${appId}:`, error)
      return NextResponse.json(
        {
          success: false,
          error: 'App configuration error',
          message: 'This app is not properly configured',
        },
        { status: 404 }
      )
    }

    // Validate submission data against AppSpec
    const validationResult = validateSubmission(body.data, appSpec)

    if (!validationResult.valid) {
      console.warn(
        `[Submissions API] Validation failed for app ${appId}:`,
        validationResult.errors
      )
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          validationErrors: validationResult.errors,
        },
        { status: 400 }
      )
    }

    // ========================================================================
    // PHASE 5: Sanitize data and create submission
    // ========================================================================
    const sanitizedData = sanitizeSubmissionData(body.data)

    const [submission] = await createSubmission({
      appId,
      data: sanitizedData,
      status: 'SUBMITTED',
      submittedBy: body.submittedBy || null,
    })

    console.log(
      `[Submissions API] Created submission ${submission.id} for app ${appId}`
    )

    // ========================================================================
    // PHASE 6: Return success response
    // ========================================================================
    return NextResponse.json(
      {
        success: true,
        submission: {
          id: submission.id,
          appId: submission.appId,
          status: submission.status,
          createdAt: submission.createdAt.toISOString(),
          submittedBy: submission.submittedBy,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    // ========================================================================
    // ERROR HANDLING
    // ========================================================================
    console.error('[Submissions API] Unexpected error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred while creating submission',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/apps/[appId]/submissions
 *
 * Lists submissions for an app with optional filtering and pagination.
 *
 * Query parameters:
 * - status: Filter by submission status (optional)
 * - page: Page number for pagination (default: 1)
 * - limit: Results per page (default: 20, max: 100)
 *
 * Request:
 * - Headers: Authorization: Bearer <JWT>
 *
 * Workflow:
 * 1. Validate JWT token from generated app
 * 2. Verify app exists and token matches
 * 3. Parse query parameters
 * 4. Fetch submissions with filters
 * 5. Return submission list with pagination metadata
 *
 * Response (200):
 * {
 *   success: true,
 *   submissions: Array<{
 *     id: string,
 *     appId: string,
 *     status: string,
 *     createdAt: string,
 *     submittedBy: string | null
 *   }>,
 *   pagination: {
 *     page: number,
 *     limit: number,
 *     total: number
 *   }
 * }
 *
 * Error responses:
 * - 401: Authentication failed (missing or invalid token)
 * - 404: App not found
 * - 400: Invalid query parameters
 * - 500: Database error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  try {
    // ========================================================================
    // PHASE 1: Extract and validate JWT authentication
    // ========================================================================
    const authHeader = request.headers.get('authorization')
    const token = extractTokenFromHeader(authHeader)

    if (!token) {
      console.error('[Submissions API] Missing authentication token')
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
          message: 'Missing or invalid Authorization header',
        },
        { status: 401 }
      )
    }

    // ========================================================================
    // PHASE 2: Get app and verify JWT matches
    // ========================================================================
    const { appId } = await params
    const app = await getAppById({ appId })

    if (!app) {
      console.error(`[Submissions API] App not found: ${appId}`)
      return NextResponse.json(
        {
          success: false,
          error: 'App not found',
          message: `App with ID ${appId} does not exist`,
        },
        { status: 404 }
      )
    }

    // Check if app has JWT secret configured
    if (!app.jwtSecret) {
      console.error(`[Submissions API] App ${appId} has no JWT secret configured`)
      return NextResponse.json(
        {
          success: false,
          error: 'App not configured',
          message: 'This app is not configured to accept requests',
        },
        { status: 403 }
      )
    }

    // Verify JWT token
    let jwtPayload
    try {
      jwtPayload = await verifyAppJWT(token, app.jwtSecret)
    } catch (error) {
      console.error(`[Submissions API] JWT verification failed for app ${appId}:`, error)
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication failed',
          message: error instanceof Error ? error.message : 'Invalid authentication token',
        },
        { status: 401 }
      )
    }

    // Verify JWT appId matches URL appId
    if (jwtPayload.appId !== appId) {
      console.error(
        `[Submissions API] JWT appId mismatch: JWT=${jwtPayload.appId}, URL=${appId}`
      )
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication failed',
          message: 'Token does not match app ID',
        },
        { status: 401 }
      )
    }

    // ========================================================================
    // PHASE 3: Parse query parameters
    // ========================================================================
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') || undefined
    const pageParam = searchParams.get('page')
    const limitParam = searchParams.get('limit')

    // Validate and parse page
    let page = 1
    if (pageParam) {
      const parsedPage = parseInt(pageParam, 10)
      if (isNaN(parsedPage) || parsedPage < 1) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid query parameter',
            message: 'Page must be a positive integer',
          },
          { status: 400 }
        )
      }
      page = parsedPage
    }

    // Validate and parse limit
    let limit = 20
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10)
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid query parameter',
            message: 'Limit must be a positive integer',
          },
          { status: 400 }
        )
      }
      // Cap limit at 100
      limit = Math.min(parsedLimit, 100)
    }

    // ========================================================================
    // PHASE 4: Fetch submissions
    // ========================================================================
    const result = await getSubmissionsByAppId({
      appId,
      status,
      page,
      limit,
    })

    console.log(
      `[Submissions API] Fetched ${result.submissions.length} submissions for app ${appId} (page ${page})`
    )

    // ========================================================================
    // PHASE 5: Return success response with pagination
    // ========================================================================
    return NextResponse.json(
      {
        success: true,
        submissions: result.submissions.map((sub) => ({
          id: sub.id,
          appId: sub.appId,
          status: sub.status,
          createdAt: sub.createdAt.toISOString(),
          submittedBy: sub.submittedBy,
        })),
        pagination: {
          page,
          limit,
          total: result.total,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    // ========================================================================
    // ERROR HANDLING
    // ========================================================================
    console.error('[Submissions API] Unexpected error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred while fetching submissions',
      },
      { status: 500 }
    )
  }
}
