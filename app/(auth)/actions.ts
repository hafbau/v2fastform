'use server'

import { z } from 'zod'
import { signIn } from './auth'
import { createUser, getUser } from '@/lib/db/queries'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { AuthError } from 'next-auth'

const signInSchema = z.object({
  email: z.string().email('Please enter a valid email.'),
  password: z.string().min(1, 'Password is required.'),
})

const signUpSchema = z.object({
  email: z.string().email('Please enter a valid email.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
})

interface ActionResult {
  type: 'error' | 'success'
  message: string
}

export async function signInAction(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const validatedData = signInSchema.parse({
      email: formData.get('email'),
      password: formData.get('password'),
    })

    const result = await signIn('credentials', {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    })

    if (result?.error) {
      return {
        type: 'error',
        message: 'Invalid credentials. Please try again.',
      }
    }

    revalidatePath('/')
    redirect('/?refresh=session')
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        type: 'error',
        message: error.issues[0].message,
      }
    }

    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return {
            type: 'error',
            message: 'Invalid credentials. Please try again.',
          }
        default:
          return {
            type: 'error',
            message: 'Something went wrong. Please try again.',
          }
      }
    }

    // If it's a redirect, re-throw it
    throw error
  }
}

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email.'),
})

export async function requestPasswordReset(
  email: string,
): Promise<ActionResult> {
  try {
    const validated = forgotPasswordSchema.parse({ email })

    // Check if user exists (don't reveal if they don't for security)
    const existingUsers = await getUser(validated.email)

    if (existingUsers.length > 0) {
      // TODO: Phase 4 - Generate token and send email
      // For now, we log the request
      console.log('[Password Reset] Request for:', validated.email)
    }

    // Always return success to prevent email enumeration
    return {
      type: 'success',
      message: 'If an account exists, you will receive a password reset email.',
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        type: 'error',
        message: error.issues[0].message,
      }
    }

    return {
      type: 'error',
      message: 'Something went wrong. Please try again.',
    }
  }
}

export async function signUpAction(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const validatedData = signUpSchema.parse({
      email: formData.get('email'),
      password: formData.get('password'),
    })

    const existingUsers = await getUser(validatedData.email)

    if (existingUsers.length > 0) {
      return {
        type: 'error',
        message: 'User already exists. Please sign in instead.',
      }
    }

    await createUser(validatedData.email, validatedData.password)

    const result = await signIn('credentials', {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    })

    if (result?.error) {
      return {
        type: 'error',
        message:
          'Failed to sign in after registration. Please try signing in manually.',
      }
    }

    revalidatePath('/')
    redirect('/?refresh=session')
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        type: 'error',
        message: error.issues[0].message,
      }
    }

    if (error instanceof AuthError) {
      return {
        type: 'error',
        message: 'Something went wrong. Please try again.',
      }
    }

    // If it's a redirect, re-throw it
    throw error
  }
}

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
})

export async function validateResetToken(
  token: string,
): Promise<ActionResult> {
  // TODO: Phase 4 - Validate token from database
  // For now, we accept any non-empty token for UI development
  if (!token || token.length < 10) {
    return {
      type: 'error',
      message: 'Invalid or expired reset link.',
    }
  }

  // Placeholder: token validation will be implemented in Phase 4
  return {
    type: 'success',
    message: 'Token is valid.',
  }
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<ActionResult> {
  try {
    const validated = resetPasswordSchema.parse({ token, password: newPassword })

    // TODO: Phase 4 - Validate token, update password in database
    console.log('[Password Reset] Resetting password with token:', validated.token)

    // Placeholder: password reset will be implemented in Phase 4
    return {
      type: 'success',
      message: 'Password has been reset successfully.',
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        type: 'error',
        message: error.issues[0].message,
      }
    }

    return {
      type: 'error',
      message: 'Something went wrong. Please try again.',
    }
  }
}
