'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import useSWR, { mutate } from 'swr'

interface App {
  id: string
  userId: string
  name: string
  createdAt: string
}

interface AppsResponse {
  data: App[]
}

export function AppsListClient() {
  const { data, error, isLoading } = useSWR<AppsResponse>('/api/apps')
  const apps = data?.data || []
  const [newAppName, setNewAppName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)

  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAppName.trim()) return

    setIsCreating(true)
    try {
      const response = await fetch('/api/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAppName.trim() }),
      })

      if (response.ok) {
        setNewAppName('')
        setShowCreateForm(false)
        mutate('/api/apps')
      }
    } catch (error) {
      console.error('Failed to create app:', error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeleteApp = async (appId: string, appName: string) => {
    if (!confirm(`Delete "${appName}"? This will also delete all chats in this app.`)) {
      return
    }

    try {
      const response = await fetch(`/api/apps/${appId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        mutate('/api/apps')
      }
    } catch (error) {
      console.error('Failed to delete app:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
            <span className="ml-2 text-gray-600 dark:text-gray-300">
              Loading apps...
            </span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4 mb-6">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                  Error loading apps
                </h3>
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                  {error.message || 'Failed to load apps'}
                </p>
              </div>
            </div>
          </div>
        )}

        {!isLoading && !error && (
          <>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Your Apps
                </h2>
                <p className="text-gray-600 dark:text-gray-300">
                  {apps.length} {apps.length === 1 ? 'app' : 'apps'}
                </p>
              </div>
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <Plus className="h-4 w-4 mr-2" />
                New App
              </button>
            </div>

            {showCreateForm && (
              <div className="mb-6 p-4 border border-border dark:border-input rounded-lg bg-white dark:bg-gray-900">
                <form onSubmit={handleCreateApp} className="flex gap-4">
                  <input
                    type="text"
                    value={newAppName}
                    onChange={(e) => setNewAppName(e.target.value)}
                    placeholder="App name"
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={isCreating || !newAppName.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreating ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false)
                      setNewAppName('')
                    }}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </form>
              </div>
            )}

            {apps.length === 0 ? (
              <div className="text-center py-12">
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                  No apps yet
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Get started by creating your first app.
                </p>
                <div className="mt-6">
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New App
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {apps.map((app) => (
                  <div
                    key={app.id}
                    className="group relative border border-border dark:border-input rounded-lg p-6 hover:shadow-md transition-shadow"
                  >
                    <Link
                      href={`/apps/${app.id}/chats`}
                      className="block"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                            {app.name}
                          </h3>
                          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            Created{' '}
                            {new Date(app.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </Link>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        handleDeleteApp(app.id, app.name)
                      }}
                      className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete app"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
