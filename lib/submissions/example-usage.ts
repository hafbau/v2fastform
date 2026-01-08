/**
 * Example usage of the submission validation service.
 * This demonstrates how to use the validation functions in production code.
 */

import { validateSubmission, validateTransition, sanitizeSubmissionData } from './validation'
import type { FastformAppSpec } from '../types/appspec'

// Example: Validate a submission before persisting to database
export async function handleSubmissionCreate(
  data: Record<string, unknown>,
  appSpec: FastformAppSpec
) {
  // 1. Sanitize input to prevent XSS
  const sanitizedData = sanitizeSubmissionData(data)

  // 2. Validate against AppSpec
  const validationResult = validateSubmission(sanitizedData, appSpec)

  if (!validationResult.valid) {
    const errorMessages = validationResult.errors.map((e) => e.message).join(', ')
    throw new Error(`Validation failed: ${errorMessages}`)
  }

  // 3. Safe to persist to database
  // await db.insert(submissions).values({
  //   appId: appSpec.id,
  //   data: sanitizedData,
  //   status: 'SUBMITTED',
  // })

  return { success: true, data: sanitizedData }
}

// Example: Validate state transition before updating
export async function handleStatusTransition(
  submissionId: string,
  newStatus: string,
  userRole: 'PATIENT' | 'STAFF',
  appSpec: FastformAppSpec
) {
  // 1. Fetch current submission
  // const submission = await db.query.submissions.findFirst({
  //   where: eq(submissions.id, submissionId)
  // })

  const mockSubmission = {
    id: submissionId,
    appId: appSpec.id,
    data: {},
    status: 'SUBMITTED',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  // 2. Validate transition
  const validationResult = validateTransition(
    mockSubmission,
    newStatus,
    appSpec,
    userRole
  )

  if (!validationResult.valid) {
    const errorMessages = validationResult.errors.map((e) => e.message).join(', ')
    throw new Error(`Transition not allowed: ${errorMessages}`)
  }

  // 3. Update status
  // await db.update(submissions)
  //   .set({ status: newStatus, updatedAt: new Date() })
  //   .where(eq(submissions.id, submissionId))

  return { success: true }
}
