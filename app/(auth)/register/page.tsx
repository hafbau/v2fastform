import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '../auth'
import { AuthForm } from '@/components/auth-form'
import {
  GlassCard,
  GlassCardHeader,
  GlassCardTitle,
  GlassCardDescription,
  GlassCardContent,
  GlassCardFooter,
} from '@/components/ui/glass-card'

export default async function RegisterPage() {
  const session = await auth()

  if (session) {
    redirect('/')
  }

  return (
    <GlassCard className="animate-in fade-in duration-500">
      <GlassCardHeader className="text-center">
        <GlassCardTitle>Join FastForm</GlassCardTitle>
        <GlassCardDescription>
          Create your account to get started
        </GlassCardDescription>
      </GlassCardHeader>

      <GlassCardContent>
        <AuthForm type="signup" />
      </GlassCardContent>

      <GlassCardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </GlassCardFooter>
    </GlassCard>
  )
}
