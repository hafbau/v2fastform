'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo, LogoIcon } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { UserAvatarMenu, type UserAvatarMenuProps } from './user-avatar-menu'
import { cn } from '@/lib/utils'

interface NavItem {
  /** Display label for the navigation item */
  label: string
  /** URL path for the navigation item */
  href: string
  /** Whether this item is currently active (optional, auto-detected from pathname) */
  active?: boolean
}

export interface AppNavbarProps {
  /** User information for the avatar menu (optional when not authenticated) */
  user?: UserAvatarMenuProps
  /** Whether the user is authenticated */
  isAuthenticated?: boolean
  /** Navigation items to display in the center (defaults to Apps) */
  navItems?: NavItem[]
  /** Additional CSS classes for the navbar container */
  className?: string
}

/**
 * Fixed top navigation bar for logged-in users.
 * Features:
 * - Far left: FastForm branding
 * - Center: Navigation items (defaults to 'Apps')
 * - Far right: User avatar with dropdown menu
 */
export function AppNavbar({
  user,
  isAuthenticated = false,
  navItems = [{ label: 'Apps', href: '/apps' }],
  className,
}: AppNavbarProps) {
  const pathname = usePathname()

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50',
        'h-14 border-b border-border bg-background/95 backdrop-blur-sm',
        'supports-backdrop-filter:bg-background/80',
        className
      )}
    >
      <div className="h-full px-4 sm:px-6 lg:px-8">
        <div className="flex h-full items-center justify-between">
          {/* Left side - Logo/Branding */}
          <div className="shrink-0">
            <Link
              href="/"
              className="transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
              aria-label="Go to homepage"
            >
              {/* Logo on larger screens */}
              <div className="hidden sm:block">
                <Logo />
              </div>
              {/* Icon only on mobile */}
              <div className="block sm:hidden">
                <LogoIcon size="md" />
              </div>
            </Link>
          </div>

          {/* Center - Navigation */}
          <nav
            className="absolute left-1/2 -translate-x-1/2"
            aria-label="Main navigation"
          >
            <ul className="flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = item.active ?? pathname === item.href
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      )}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* Right side - User Avatar or Auth Buttons */}
          <div className="shrink-0">
            {isAuthenticated && user ? (
              <UserAvatarMenu
                name={user.name}
                email={user.email}
                avatarUrl={user.avatarUrl}
              />
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">Log in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/register">Sign up</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
