'use client'

import React, { useState } from 'react'
import { FastformAppSpec } from '@/lib/types/appspec'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  FileText,
  Users,
  GitBranch,
  CheckCircle2,
  Edit3,
  Loader2,
} from 'lucide-react'

/**
 * Props for the IntentConfirmation component.
 */
interface IntentConfirmationProps {
  /** The draft AppSpec to display */
  draftSpec: FastformAppSpec
  /** Callback invoked when user confirms the spec with optional edits */
  onConfirm: (editedSpec: FastformAppSpec) => void
  /** Callback invoked when user wants to refine the description */
  onRefine: () => void
}

/**
 * IntentConfirmation displays a rich preview of a draft AppSpec to the user
 * for confirmation before persisting to the database and generating code.
 *
 * Features:
 * - Displays preview of pages, fields, workflow states, and roles
 * - Allows editing of app name and URL slug
 * - Provides "Confirm & Build" and "Let me describe more..." actions
 * - Loading state during confirmation
 *
 * @example
 * ```tsx
 * <IntentConfirmation
 *   draftSpec={generatedSpec}
 *   onConfirm={(editedSpec) => persistAndBuild(editedSpec)}
 *   onRefine={() => showChatInput()}
 * />
 * ```
 */
export default function IntentConfirmation({
  draftSpec,
  onConfirm,
  onRefine,
}: IntentConfirmationProps) {
  const [appName, setAppName] = useState(draftSpec.meta.name)
  const [appSlug, setAppSlug] = useState(draftSpec.meta.slug)
  const [isConfirming, setIsConfirming] = useState(false)

  /**
   * Handles confirmation by creating an edited spec with updated name/slug.
   */
  const handleConfirm = () => {
    setIsConfirming(true)

    const editedSpec: FastformAppSpec = {
      ...draftSpec,
      meta: {
        ...draftSpec.meta,
        name: appName,
        slug: appSlug,
      },
    }

    onConfirm(editedSpec)
  }

  /**
   * Gets a human-readable label for a field type.
   */
  const getFieldTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      text: 'Text',
      email: 'Email',
      tel: 'Phone',
      date: 'Date',
      textarea: 'Long Text',
      select: 'Dropdown',
      radio: 'Radio',
      checkbox: 'Checkbox',
      number: 'Number',
    }
    return labels[type] || type
  }

  /**
   * Gets a human-readable label for a page type.
   */
  const getPageTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      welcome: 'Welcome',
      form: 'Form',
      review: 'Review',
      success: 'Success',
      login: 'Login',
      list: 'List',
      detail: 'Detail',
    }
    return labels[type] || type
  }

  const formPages = draftSpec.pages.filter(
    (page) => page.type === 'form' || page.type === 'welcome'
  )
  const totalFields = formPages.reduce(
    (acc, page) => acc + (page.fields?.length || 0),
    0
  )

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Here&apos;s what I&apos;m about to build:</CardTitle>
        <CardDescription>
          Review the app structure and confirm to start building
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* App Name and Slug Editing */}
        <div className="space-y-4 p-4 rounded-lg bg-muted/50">
          <div className="space-y-2">
            <Label htmlFor="app-name">App Name</Label>
            <Input
              id="app-name"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="Enter app name"
              disabled={isConfirming}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="app-slug">URL Slug</Label>
            <Input
              id="app-slug"
              value={appSlug}
              onChange={(e) => setAppSlug(e.target.value)}
              placeholder="enter-url-slug"
              disabled={isConfirming}
            />
            <p className="text-xs text-muted-foreground">
              This will be used in your app&apos;s URL
            </p>
          </div>
        </div>

        <Separator />

        {/* Feature Preview Section */}
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="size-4" />
              <span>Pages ({draftSpec.pages.length})</span>
            </div>
            <div className="grid gap-2">
              {draftSpec.pages.map((page) => (
                <div
                  key={page.id}
                  className="flex items-start justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{page.title}</span>
                      <Badge variant="secondary" className="text-xs">
                        {getPageTypeLabel(page.type)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {page.role}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {page.route}
                    </p>
                    {page.description && (
                      <p className="text-xs text-muted-foreground">
                        {page.description}
                      </p>
                    )}
                    {page.fields && page.fields.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {page.fields.slice(0, 5).map((field) => (
                          <Badge
                            key={field.id}
                            variant="outline"
                            className="text-xs"
                          >
                            {field.label} ({getFieldTypeLabel(field.type)})
                          </Badge>
                        ))}
                        {page.fields.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{page.fields.length - 5} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            {/* User Roles */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4" />
                <span>User Roles ({draftSpec.roles.length})</span>
              </div>
              <div className="space-y-2">
                {draftSpec.roles.map((role) => (
                  <div
                    key={role.id}
                    className="flex items-center justify-between p-2 rounded-md border bg-card"
                  >
                    <span className="text-sm font-medium">{role.id}</span>
                    <Badge
                      variant={role.authRequired ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {role.authRequired ? 'Auth Required' : 'Public'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Workflow States */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <GitBranch className="size-4" />
                <span>Workflow States ({draftSpec.workflow.states.length})</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {draftSpec.workflow.states.map((state) => (
                  <Badge
                    key={state}
                    variant={
                      state === draftSpec.workflow.initialState
                        ? 'default'
                        : 'secondary'
                    }
                    className="text-xs"
                  >
                    {state}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {totalFields > 0 && (
            <>
              <Separator />
              <div className="p-4 rounded-lg bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  This app includes <strong>{totalFields} form fields</strong>{' '}
                  across {formPages.length} page{formPages.length !== 1 ? 's' : ''}.
                </p>
              </div>
            </>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={handleConfirm}
          disabled={isConfirming || !appName.trim() || !appSlug.trim()}
          className="w-full sm:flex-1"
          size="lg"
        >
          {isConfirming ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Confirming...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4" />
              <span>Confirm & Build</span>
            </>
          )}
        </Button>
        <Button
          onClick={onRefine}
          variant="outline"
          disabled={isConfirming}
          className="w-full sm:flex-1"
          size="lg"
        >
          <Edit3 className="size-4" />
          <span>Let me describe more...</span>
        </Button>
      </CardFooter>
    </Card>
  )
}
