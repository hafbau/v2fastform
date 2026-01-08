import { GradientMesh } from '@/components/ui/gradient-mesh'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center">
      {/* Animated gradient mesh background */}
      <GradientMesh className="fixed inset-0 -z-10" intensity="medium" />

      {/* Auth content */}
      <main className="relative z-10 w-full max-w-md px-4">
        {children}
      </main>
    </div>
  )
}
