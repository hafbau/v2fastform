/**
 * Submission Detail and Actions API
 *
 * Provides endpoints for viewing and managing individual submissions.
 * Supports GET (view details), PATCH (status transitions), and DELETE (soft delete).
 *
 * @module api/apps/[appId]/submissions/[submissionId]
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/(auth)/auth'
import {
  getAppById,
  getSubmissionById,
  updateSubmission,
  softDeleteSubmission,
  getSubmissionHistory,
  createSubmissionHistory,
} from '@/lib/db/queries'
import { validateTransition } from '@/lib/submissions/validation'
import type { FastformAppSpec } from '@/lib/types/appspec'

/**
 * Role type for authorization
 */
type UserRole = 'staff' | 'admin'

/**
 * Request body type for PATCH operation
 */
interface UpdateSubmissionRequest {
  status: string
  notes?: string
  assignedTo?: string
}

/**
 * Maps user email to role for authorization
 * In production, this would be fetched from a user roles table
 */
function getUserRole(email: string): UserRole {
  // For now, simple heuristic: admin emails contain 'admin'
  // In production, this should query a proper roles table
  if (email.includes('admin')) {
    return 'admin'
  }
  return 'staff'
}

/**
 * GET /api/apps/[appId]/submissions/[submissionId]
 *
 * Returns full submission details including data, history, and audit trail.
 *
 * @requires Authentication (staff or admin role)
 * @returns 200 - Success with submission details
 * @returns 401 - Unauthorized (not authenticated)
 * @returns 403 - Forbidden (user doesn't have access to app)
 * @returns 404 - Submission not found
 * @returns 500 - Server error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string; submissionId: string }> }
) {
  try {
    // Authenticate user
    const session = await auth()

    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { appId, submissionId } = await params

    // Verify app exists and user has access
    const app = await getAppById({ appId })

    if (!app) {
      return NextResponse.json(
        { success: false, error: 'App not found' },
        { status: 404 }
      )
    }

    // Verify user owns the app (staff/admin must own the app to manage submissions)
    if (app.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Get submission
    const submission = await getSubmissionById({ submissionId })

    if (!submission) {
      return NextResponse.json(
        { success: false, error: 'Submission not found' },
        { status: 404 }
      )
    }

    // Verify submission belongs to the app
    if (submission.appId !== appId) {
      return NextResponse.json(
        { success: false, error: 'Submission does not belong to this app' },
        { status: 404 }
      )
    }

    // Check if submission is soft deleted
    if (submission.deleted) {
      return NextResponse.json(
        { success: false, error: 'Submission has been deleted' },
        { status: 404 }
      )
    }

    // Get submission history
    const history = await getSubmissionHistory({ submissionId })

    // Format response
    return NextResponse.json({
      success: true,
      submission: {
        id: submission.id,
        appId: submission.appId,
        data: submission.data,
        status: submission.status,
        createdAt: submission.createdAt.toISOString(),
        updatedAt: submission.updatedAt.toISOString(),
        submittedBy: submission.submittedBy || null,
        assignedTo: submission.assignedTo || null,
        history: history.map((entry) => ({
          status: entry.status,
          updatedAt: entry.createdAt.toISOString(),
          updatedBy: entry.updatedBy,
          notes: entry.notes || null,
        })),
      },
    })
  } catch (error) {
    console.error('Submission fetch error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch submission',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/apps/[appId]/submissions/[submissionId]
 *
 * Updates submission status (workflow transition) with audit logging.
 *
 * @requires Authentication (staff or admin role)
 * @body status - Target workflow status
 * @body notes - Optional notes for the transition
 * @body assignedTo - Optional staff member to assign
 * @returns 200 - Success with updated submission
 * @returns 400 - Invalid request (validation errors)
 * @returns 401 - Unauthorized (not authenticated)
 * @returns 403 - Forbidden (insufficient permissions)
 * @returns 404 - Submission not found
 * @returns 500 - Server error
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string; submissionId: string }> }
) {
  try {
    // Authenticate user
    const session = await auth()

    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { appId, submissionId } = await params

    // Parse request body
    const body: UpdateSubmissionRequest = await request.json()

    if (!body.status) {
      return NextResponse.json(
        { success: false, error: 'Status is required' },
        { status: 400 }
      )
    }

    // Verify app exists and user has access
    const app = await getAppById({ appId })

    if (!app) {
      return NextResponse.json(
        { success: false, error: 'App not found' },
        { status: 404 }
      )
    }

    // Verify user owns the app
    if (app.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Get submission
    const submission = await getSubmissionById({ submissionId })

    if (!submission) {
      return NextResponse.json(
        { success: false, error: 'Submission not found' },
        { status: 404 }
      )
    }

    // Verify submission belongs to the app
    if (submission.appId !== appId) {
      return NextResponse.json(
        { success: false, error: 'Submission does not belong to this app' },
        { status: 404 }
      )
    }

    // Check if submission is soft deleted
    if (submission.deleted) {
      return NextResponse.json(
        { success: false, error: 'Cannot update deleted submission' },
        { status: 400 }
      )
    }

    // Get user role for authorization
    const userRole = getUserRole(session.user.email)

    // Parse app spec for workflow validation
    const appSpec = app.spec as FastformAppSpec

    // Validate workflow transition
    const validation = validateTransition(
      {
        id: submission.id,
        appId: submission.appId,
        data: submission.data as Record<string, unknown>,
        status: submission.status,
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt,
      },
      body.status,
      appSpec,
      userRole === 'admin' ? 'STAFF' : 'STAFF' // Map to AppSpec role type
    )

    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid workflow transition',
          details: validation.errors.map((e) => e.message).join(', '),
        },
        { status: 400 }
      )
    }

    // Check role-based permissions for specific transitions
    const requiresAdmin = ['APPROVED', 'REJECTED'].includes(body.status)
    if (requiresAdmin && userRole !== 'admin') {
      return NextResponse.json(
        {
          success: false,
          error: 'Insufficient permissions',
          details: `Status ${body.status} requires admin role`,
        },
        { status: 403 }
      )
    }

    // Update submission
    const [updatedSubmission] = await updateSubmission({
      submissionId,
      status: body.status,
      assignedTo: body.assignedTo !== undefined ? body.assignedTo : undefined,
    })

    if (!updatedSubmission) {
      throw new Error('Failed to update submission')
    }

    // Create audit trail entry
    await createSubmissionHistory({
      submissionId,
      status: body.status,
      updatedBy: session.user.email,
      notes: body.notes,
    })

    // Return success response
    return NextResponse.json({
      success: true,
      submission: {
        id: updatedSubmission.id,
        status: updatedSubmission.status,
        updatedAt: updatedSubmission.updatedAt.toISOString(),
        message: `Submission status updated to ${body.status}`,
      },
    })
  } catch (error) {
    console.error('Submission update error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update submission',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/apps/[appId]/submissions/[submissionId]
 *
 * Soft deletes a submission (marks as deleted, preserves data).
 *
 * @requires Authentication (admin role only)
 * @returns 200 - Success
 * @returns 401 - Unauthorized (not authenticated)
 * @returns 403 - Forbidden (requires admin role)
 * @returns 404 - Submission not found
 * @returns 500 - Server error
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string; submissionId: string }> }
) {
  try {
    // Authenticate user
    const session = await auth()

    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { appId, submissionId } = await params

    // Get user role for authorization
    const userRole = getUserRole(session.user.email)

    // Only admins can delete submissions
    if (userRole !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden - Admin role required' },
        { status: 403 }
      )
    }

    // Verify app exists and user has access
    const app = await getAppById({ appId })

    if (!app) {
      return NextResponse.json(
        { success: false, error: 'App not found' },
        { status: 404 }
      )
    }

    // Verify user owns the app
    if (app.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Get submission
    const submission = await getSubmissionById({ submissionId })

    if (!submission) {
      return NextResponse.json(
        { success: false, error: 'Submission not found' },
        { status: 404 }
      )
    }

    // Verify submission belongs to the app
    if (submission.appId !== appId) {
      return NextResponse.json(
        { success: false, error: 'Submission does not belong to this app' },
        { status: 404 }
      )
    }

    // Check if already deleted
    if (submission.deleted) {
      return NextResponse.json(
        { success: false, error: 'Submission already deleted' },
        { status: 400 }
      )
    }

    // Soft delete submission
    await softDeleteSubmission({ submissionId })

    // Create audit trail entry
    await createSubmissionHistory({
      submissionId,
      status: 'DELETED',
      updatedBy: session.user.email,
      notes: 'Submission deleted by admin',
    })

    return NextResponse.json({
      success: true,
      message: 'Submission deleted successfully',
    })
  } catch (error) {
    console.error('Submission deletion error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete submission',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
