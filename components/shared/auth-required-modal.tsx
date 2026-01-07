'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface AuthRequiredModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AuthRequiredModal({
  open,
  onOpenChange,
}: AuthRequiredModalProps) {
  const pathname = usePathname()
  const callbackUrl = encodeURIComponent(pathname)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign in to continue</DialogTitle>
          <DialogDescription>
            Create an account or sign in to start building with FastForm.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href={`/login?callbackUrl=${callbackUrl}`}>Sign In</Link>
          </Button>
          <Button asChild className="w-full sm:w-auto">
            <Link href={`/register?callbackUrl=${callbackUrl}`}>Sign Up</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
