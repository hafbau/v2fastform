'use client'

import { ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { AppNavbar, type AppNavbarProps } from './app-navbar'
import { cn } from '@/lib/utils'

interface AppLayoutProps {
  /** Page content to render below the navbar */
  children: ReactNode
  /** Custom navigation items (optional, defaults to Apps) */
  navItems?: AppNavbarProps['navItems']
  /** Additional CSS classes for the main content area */
  className?: string
}

/**
 * Layout component for app pages with navigation.
 *
 * Features:
 * - Fixed top navigation bar with FastForm branding
 * - Centered navigation with 'Apps' link (customizable)
 * - User avatar with dropdown menu containing Log Out
 * - Responsive design for mobile and desktop
 * - Automatic padding to account for fixed navbar
 *
 * Note: Authentication is handled by middleware (proxy.ts), not this component.
 *
 * @example
 * ```tsx
 * export default function AppsPage() {
 *   return (
 *     <AppLayout>
 *       <div className="container mx-auto py-8">
 *         <h1>My Apps</h1>
 *       </div>
 *     </AppLayout>
 *   )
 * }
 * ```
 */
export function AppLayout({
  children,
  navItems,
  className,
}: AppLayoutProps) {
  const { data: session, status } = useSession()

  // Determine if user is authenticated
  const isAuthenticated = status === 'authenticated' && !!session?.user

  // Extract user info from session (may be null for anonymous users)
  const user = isAuthenticated
    ? {
        name: session?.user?.name,
        email: session?.user?.email,
        avatarUrl: session?.user?.image,
      }
    : undefined

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar user={user} navItems={navItems} isAuthenticated={isAuthenticated} />

      {/* Main content area with top padding for fixed navbar */}
      <main className={cn('pt-14', className)}>
        {children}
      </main>
    </div>
  )
}

// Re-export components for convenience
export { AppNavbar } from './app-navbar'
export { UserAvatarMenu } from './user-avatar-menu'
export type { AppNavbarProps } from './app-navbar'
export type { UserAvatarMenuProps } from './user-avatar-menu'
