'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  GlassCard,
  GlassCardHeader,
  GlassCardTitle,
  GlassCardDescription,
  GlassCardContent,
  GlassCardFooter,
} from '@/components/ui/glass-card'
import { resetPassword, validateResetToken } from '../actions'

function ResetPasswordLoading() {
  return (
    <GlassCard className="animate-in fade-in duration-500">
      <GlassCardContent className="py-12">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </GlassCardContent>
    </GlassCard>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordLoading />}>
      <ResetPasswordContent />
    </Suspense>
  )
}

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isValidating, setIsValidating] = useState(true)
  const [isTokenValid, setIsTokenValid] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkToken = async () => {
      if (!token) {
        setIsValidating(false)
        setError('No reset token provided.')
        return
      }

      const result = await validateResetToken(token)
      setIsValidating(false)
      setIsTokenValid(result.type === 'success')

      if (result.type === 'error') {
        setError(result.message)
      }
    }

    checkToken()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (!token) {
      setError('No reset token provided.')
      return
    }

    setIsLoading(true)
    const result = await resetPassword(token, password)
    setIsLoading(false)

    if (result.type === 'error') {
      setError(result.message)
    } else {
      setIsSuccess(true)
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    }
  }

  if (isValidating) {
    return (
      <GlassCard className="animate-in fade-in duration-500">
        <GlassCardContent className="py-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Validating reset link...</p>
          </div>
        </GlassCardContent>
      </GlassCard>
    )
  }

  if (!isTokenValid && !isSuccess) {
    return (
      <GlassCard className="animate-in fade-in duration-500">
        <GlassCardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-6 w-6 text-destructive" />
          </div>
          <GlassCardTitle>Invalid or expired link</GlassCardTitle>
          <GlassCardDescription>
            {error || 'This password reset link is no longer valid.'}
          </GlassCardDescription>
        </GlassCardHeader>

        <GlassCardFooter className="flex-col gap-4">
          <Link href="/forgot-password">
            <Button variant="outline" className="w-full">
              Request new reset link
            </Button>
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </GlassCardFooter>
      </GlassCard>
    )
  }

  if (isSuccess) {
    return (
      <GlassCard className="animate-in fade-in duration-500">
        <GlassCardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <GlassCardTitle>Password reset successful</GlassCardTitle>
          <GlassCardDescription>
            Your password has been updated. Redirecting to sign in...
          </GlassCardDescription>
        </GlassCardHeader>
      </GlassCard>
    )
  }

  return (
    <GlassCard className="animate-in fade-in duration-500">
      <GlassCardHeader className="text-center">
        <GlassCardTitle>Reset your password</GlassCardTitle>
        <GlassCardDescription>
          Enter your new password below.
        </GlassCardDescription>
      </GlassCardHeader>

      <GlassCardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              'Reset password'
            )}
          </Button>
        </form>
      </GlassCardContent>

      <GlassCardFooter className="justify-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </GlassCardFooter>
    </GlassCard>
  )
}
