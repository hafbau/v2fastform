import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Next.js server components
vi.mock('server-only', () => ({}))

// Mock auth
const mockAuth = vi.fn()
vi.mock('@/app/(auth)/auth', () => ({
  auth: () => mockAuth(),
}))

// Mock database queries
const mockGetAppsByUserId = vi.fn()
const mockCreateApp = vi.fn()
const mockGetAppById = vi.fn()
const mockDeleteApp = vi.fn()
const mockDeleteChatOwnershipsByAppId = vi.fn()

vi.mock('@/lib/db/queries', () => ({
  getAppsByUserId: (args: { userId: string }) => mockGetAppsByUserId(args),
  createApp: (args: { userId: string; name: string }) => mockCreateApp(args),
  getAppById: (args: { appId: string }) => mockGetAppById(args),
  deleteApp: (args: { appId: string }) => mockDeleteApp(args),
  deleteChatOwnershipsByAppId: (args: { appId: string }) => mockDeleteChatOwnershipsByAppId(args),
}))

describe('Apps API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/apps', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuth.mockResolvedValueOnce(null)

      const { GET } = await import('@/app/api/apps/route')
      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return apps for authenticated user', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 'user-123' } })
      mockGetAppsByUserId.mockResolvedValueOnce([
        { id: 'app-1', userId: 'user-123', name: 'App 1' },
        { id: 'app-2', userId: 'user-123', name: 'App 2' },
      ])

      const { GET } = await import('@/app/api/apps/route')
      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data).toHaveLength(2)
      expect(mockGetAppsByUserId).toHaveBeenCalledWith({ userId: 'user-123' })
    })
  })

  describe('POST /api/apps', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuth.mockResolvedValueOnce(null)

      const { POST } = await import('@/app/api/apps/route')
      const request = new Request('http://localhost/api/apps', {
        method: 'POST',
        body: JSON.stringify({ name: 'New App' }),
      })
      const response = await POST(request as any)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 400 when name is missing', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 'user-123' } })

      const { POST } = await import('@/app/api/apps/route')
      const request = new Request('http://localhost/api/apps', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      const response = await POST(request as any)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('App name is required')
    })

    it('should create app for authenticated user', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 'user-123' } })
      mockCreateApp.mockResolvedValueOnce([
        { id: 'app-new', userId: 'user-123', name: 'New App' },
      ])

      const { POST } = await import('@/app/api/apps/route')
      const request = new Request('http://localhost/api/apps', {
        method: 'POST',
        body: JSON.stringify({ name: 'New App' }),
      })
      const response = await POST(request as any)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.data.name).toBe('New App')
      expect(mockCreateApp).toHaveBeenCalledWith({
        userId: 'user-123',
        name: 'New App',
      })
    })
  })

  describe('GET /api/apps/[appId]', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuth.mockResolvedValueOnce(null)

      const { GET } = await import('@/app/api/apps/[appId]/route')
      const request = new Request('http://localhost/api/apps/app-123')
      const response = await GET(request as any, { params: Promise.resolve({ appId: 'app-123' }) })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 404 when app not found', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 'user-123' } })
      mockGetAppById.mockResolvedValueOnce(undefined)

      const { GET } = await import('@/app/api/apps/[appId]/route')
      const request = new Request('http://localhost/api/apps/app-123')
      const response = await GET(request as any, { params: Promise.resolve({ appId: 'app-123' }) })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('App not found')
    })

    it('should return 403 when user does not own the app', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 'user-123' } })
      mockGetAppById.mockResolvedValueOnce({ id: 'app-123', userId: 'other-user', name: 'App' })

      const { GET } = await import('@/app/api/apps/[appId]/route')
      const request = new Request('http://localhost/api/apps/app-123')
      const response = await GET(request as any, { params: Promise.resolve({ appId: 'app-123' }) })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('should return app when user owns it', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 'user-123' } })
      mockGetAppById.mockResolvedValueOnce({ id: 'app-123', userId: 'user-123', name: 'My App' })

      const { GET } = await import('@/app/api/apps/[appId]/route')
      const request = new Request('http://localhost/api/apps/app-123')
      const response = await GET(request as any, { params: Promise.resolve({ appId: 'app-123' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data.name).toBe('My App')
    })
  })

  describe('DELETE /api/apps/[appId]', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuth.mockResolvedValueOnce(null)

      const { DELETE } = await import('@/app/api/apps/[appId]/route')
      const request = new Request('http://localhost/api/apps/app-123', { method: 'DELETE' })
      const response = await DELETE(request as any, { params: Promise.resolve({ appId: 'app-123' }) })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should cascade delete chat ownerships when deleting app', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 'user-123' } })
      mockGetAppById.mockResolvedValueOnce({ id: 'app-123', userId: 'user-123', name: 'My App' })
      mockDeleteChatOwnershipsByAppId.mockResolvedValueOnce({ rowCount: 3 })
      mockDeleteApp.mockResolvedValueOnce({ rowCount: 1 })

      const { DELETE } = await import('@/app/api/apps/[appId]/route')
      const request = new Request('http://localhost/api/apps/app-123', { method: 'DELETE' })
      const response = await DELETE(request as any, { params: Promise.resolve({ appId: 'app-123' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockDeleteChatOwnershipsByAppId).toHaveBeenCalledWith({ appId: 'app-123' })
      expect(mockDeleteApp).toHaveBeenCalledWith({ appId: 'app-123' })
    })
  })
})
