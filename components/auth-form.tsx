'use client'

import { useActionState } from 'react'
import { Loader2 } from 'lucide-react'
import { signInAction, signUpAction } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AuthFormProps {
  type: 'signin' | 'signup'
}

export function AuthForm({ type }: AuthFormProps) {
  const [state, formAction, isPending] = useActionState(
    type === 'signin' ? signInAction : signUpAction,
    undefined,
  )

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          autoFocus
          autoComplete="email"
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          required
          autoComplete={type === 'signin' ? 'current-password' : 'new-password'}
          className="w-full"
          minLength={type === 'signup' ? 6 : 1}
        />
        {type === 'signup' && (
          <p className="text-xs text-muted-foreground">
            Must be at least 6 characters
          </p>
        )}
      </div>

      {state?.type === 'error' && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {state.message}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {type === 'signin' ? 'Signing in...' : 'Creating account...'}
          </>
        ) : type === 'signin' ? (
          'Sign in'
        ) : (
          'Create account'
        )}
      </Button>
    </form>
  )
}
