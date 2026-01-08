/**
 * Submission Resume/Resubmit API
 *
 * Allows users to resume and resubmit submissions that are in NEEDS_INFO status.
 * When staff request more information, users can update their submission data
 * and automatically transition back to UNDER_REVIEW status.
 *
 * @module api/apps/[appId]/submissions/[submissionId]/resume
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getAppById,
  getSubmissionById,
  updateSubmissionData,
  createSubmissionHistory,
  getSubmissionHistory,
} from '@/lib/db/queries'
import {
  validateSubmission,
  sanitizeSubmissionData,
} from '@/lib/submissions/validation'
import { verifyAppJWT, extractTokenFromHeader } from '@/lib/auth/jwt'
import type { FastformAppSpec } from '@/lib/types/appspec'
import { isValidAppSpec } from '@/lib/types/appspec'

/**
 * Request body type for PATCH operation
 */
interface ResumeSubmissionRequest {
  data: Record<string, unknown>
}

/**
 * GET /api/apps/[appId]/submissions/[submissionId]/resume
 *
 * Returns submission data for editing when in NEEDS_INFO status.
 * Shows what fields need attention based on staff notes.
 *
 * @requires Authentication (JWT from generated app OR authenticated session)
 * @returns 200 - Success with submission details for editing
 * @returns 400 - Submission not in NEEDS_INFO status
 * @returns 401 - Unauthorized (invalid or missing token)
 * @returns 403 - Forbidden (user doesn't own this submission)
 * @returns 404 - App or submission not found
 * @returns 500 - Server error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string; submissionId: string }> }
) {
  try {
    // ========================================================================
    // PHASE 1: Extract and validate JWT authentication
    // ========================================================================
    const authHeader = request.headers.get('authorization')
    const token = extractTokenFromHeader(authHeader)

    if (!token) {
      console.error('[Resume API] Missing authentication token')
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
    const { appId, submissionId } = await params
    const app = await getAppById({ appId })

    if (!app) {
      console.error(`[Resume API] App not found: ${appId}`)
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
      console.error(`[Resume API] App ${appId} has no JWT secret configured`)
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
      console.error(`[Resume API] JWT verification failed for app ${appId}:`, error)
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication failed',
          message:
            error instanceof Error ? error.message : 'Invalid authentication token',
        },
        { status: 401 }
      )
    }

    // Verify JWT appId matches URL appId
    if (jwtPayload.appId !== appId) {
      console.error(
        `[Resume API] JWT appId mismatch: JWT=${jwtPayload.appId}, URL=${appId}`
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
    // PHASE 3: Get and validate submission
    // ========================================================================
    const submission = await getSubmissionById({ submissionId })

    if (!submission) {
      console.error(`[Resume API] Submission not found: ${submissionId}`)
      return NextResponse.json(
        {
          success: false,
          error: 'Submission not found',
          message: `Submission with ID ${submissionId} does not exist`,
        },
        { status: 404 }
      )
    }

    // Verify submission belongs to the app
    if (submission.appId !== appId) {
      console.error(
        `[Resume API] Submission ${submissionId} does not belong to app ${appId}`
      )
      return NextResponse.json(
        {
          success: false,
          error: 'Submission does not belong to this app',
        },
        { status: 404 }
      )
    }

    // Check if submission is soft deleted
    if (submission.deleted) {
      return NextResponse.json(
        {
          success: false,
          error: 'Submission has been deleted',
        },
        { status: 404 }
      )
    }

    // Verify submission is in NEEDS_INFO status
    if (submission.status !== 'NEEDS_INFO') {
      console.warn(
        `[Resume API] Submission ${submissionId} is not in NEEDS_INFO status (current: ${submission.status})`
      )
      return NextResponse.json(
        {
          success: false,
          error: 'This submission cannot be resumed',
          details: 'Submission is not in NEEDS_INFO status',
        },
        { status: 400 }
      )
    }

    // ========================================================================
    // PHASE 4: Get submission history for context
    // ========================================================================
    const history = await getSubmissionHistory({ submissionId })

    // Get the most recent NEEDS_INFO entry to show staff notes
    const needsInfoEntry = history.find((entry) => entry.status === 'NEEDS_INFO')

    // ========================================================================
    // PHASE 5: Return submission data for editing
    // ========================================================================
    console.log(
      `[Resume API] Retrieved submission ${submissionId} for editing (status: ${submission.status})`
    )

    return NextResponse.json(
      {
        success: true,
        submission: {
          id: submission.id,
          appId: submission.appId,
          status: submission.status,
          data: submission.data,
          staffNotes: needsInfoEntry?.notes || null,
          history: history.map((entry) => ({
            status: entry.status,
            updatedAt: entry.createdAt.toISOString(),
            notes: entry.notes || null,
          })),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    // ========================================================================
    // ERROR HANDLING
    // ========================================================================
    console.error('[Resume API GET] Unexpected error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred while retrieving submission',
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/apps/[appId]/submissions/[submissionId]/resume
 *
 * Updates submission data and automatically transitions from NEEDS_INFO to UNDER_REVIEW.
 * Merges new data with existing submission data.
 *
 * @requires Authentication (JWT from generated app OR authenticated session)
 * @body data - Updated submission data (merged with existing)
 * @returns 200 - Success with updated submission
 * @returns 400 - Validation errors or wrong status
 * @returns 401 - Unauthorized (invalid or missing token)
 * @returns 403 - Forbidden (user doesn't own this submission)
 * @returns 404 - App or submission not found
 * @returns 500 - Server error
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string; submissionId: string }> }
) {
  try {
    // ========================================================================
    // PHASE 1: Extract and validate JWT authentication
    // ========================================================================
    const authHeader = request.headers.get('authorization')
    const token = extractTokenFromHeader(authHeader)

    if (!token) {
      console.error('[Resume API] Missing authentication token')
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
    const { appId, submissionId } = await params
    const app = await getAppById({ appId })

    if (!app) {
      console.error(`[Resume API] App not found: ${appId}`)
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
      console.error(`[Resume API] App ${appId} has no JWT secret configured`)
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
      console.error(`[Resume API] JWT verification failed for app ${appId}:`, error)
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication failed',
          message:
            error instanceof Error ? error.message : 'Invalid authentication token',
        },
        { status: 401 }
      )
    }

    // Verify JWT appId matches URL appId
    if (jwtPayload.appId !== appId) {
      console.error(
        `[Resume API] JWT appId mismatch: JWT=${jwtPayload.appId}, URL=${appId}`
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
    let body: ResumeSubmissionRequest
    try {
      body = await request.json()
    } catch (error) {
      console.error('[Resume API] Failed to parse request body:', error)
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
    // PHASE 4: Get and validate submission
    // ========================================================================
    const submission = await getSubmissionById({ submissionId })

    if (!submission) {
      console.error(`[Resume API] Submission not found: ${submissionId}`)
      return NextResponse.json(
        {
          success: false,
          error: 'Submission not found',
          message: `Submission with ID ${submissionId} does not exist`,
        },
        { status: 404 }
      )
    }

    // Verify submission belongs to the app
    if (submission.appId !== appId) {
      console.error(
        `[Resume API] Submission ${submissionId} does not belong to app ${appId}`
      )
      return NextResponse.json(
        {
          success: false,
          error: 'Submission does not belong to this app',
        },
        { status: 404 }
      )
    }

    // Check if submission is soft deleted
    if (submission.deleted) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot update deleted submission',
        },
        { status: 400 }
      )
    }

    // Verify submission is in NEEDS_INFO status
    if (submission.status !== 'NEEDS_INFO') {
      console.warn(
        `[Resume API] Submission ${submissionId} is not in NEEDS_INFO status (current: ${submission.status})`
      )
      return NextResponse.json(
        {
          success: false,
          error: 'This submission cannot be resumed',
          details: 'Submission is not in NEEDS_INFO status',
        },
        { status: 400 }
      )
    }

    // ========================================================================
    // PHASE 5: Validate AppSpec and merge data
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
      console.error(`[Resume API] Invalid AppSpec for app ${appId}:`, error)
      return NextResponse.json(
        {
          success: false,
          error: 'App configuration error',
          message: 'This app is not properly configured',
        },
        { status: 404 }
      )
    }

    // Merge updated data with existing data (updated fields override)
    const existingData = submission.data as Record<string, unknown>
    const mergedData = { ...existingData, ...body.data }

    // Validate merged data against AppSpec
    const validationResult = validateSubmission(mergedData, appSpec)

    if (!validationResult.valid) {
      console.warn(
        `[Resume API] Validation failed for submission ${submissionId}:`,
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
    // PHASE 6: Sanitize and update submission
    // ========================================================================
    const sanitizedData = sanitizeSubmissionData(mergedData)

    // Update submission with merged data and transition to UNDER_REVIEW
    const [updatedSubmission] = await updateSubmissionData({
      submissionId,
      data: sanitizedData,
      status: 'UNDER_REVIEW',
    })

    if (!updatedSubmission) {
      throw new Error('Failed to update submission')
    }

    // ========================================================================
    // PHASE 7: Create audit trail entry
    // ========================================================================
    await createSubmissionHistory({
      submissionId,
      status: 'UNDER_REVIEW',
      updatedBy: submission.submittedBy || 'user',
      notes: 'User resubmitted with additional information',
    })

    console.log(
      `[Resume API] Updated submission ${submissionId}: NEEDS_INFO -> UNDER_REVIEW`
    )

    // ========================================================================
    // PHASE 8: Return success response
    // ========================================================================
    return NextResponse.json(
      {
        success: true,
        submission: {
          id: updatedSubmission.id,
          appId: updatedSubmission.appId,
          status: updatedSubmission.status,
          updatedAt: updatedSubmission.updatedAt.toISOString(),
          message: 'Submission updated and moved to review',
        },
      },
      { status: 200 }
    )
  } catch (error) {
    // ========================================================================
    // ERROR HANDLING
    // ========================================================================
    console.error('[Resume API PATCH] Unexpected error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred while updating submission',
      },
      { status: 500 }
    )
  }
}
