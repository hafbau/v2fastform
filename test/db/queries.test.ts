import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock the database connection
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockReturnThis(),
  onConflictDoNothing: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
}

vi.mock('../../lib/db/connection', () => ({
  getDb: () => mockDb,
}))

vi.mock('../../lib/db/utils', () => ({
  generateHashedPassword: (p: string) => `hashed_${p}`,
}))

vi.mock('../../lib/utils', () => ({
  generateUUID: () => 'mock-uuid-123',
}))

describe('Database Queries - camelCase verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('imports', () => {
    it('should import camelCase table names from schema', async () => {
      // This test verifies that the imports use camelCase names
      // If the imports were snake_case, this would fail at compile time
      const queries = await import('../../lib/db/queries')

      // Verify the module exports the expected functions
      expect(queries.createChatOwnership).toBeDefined()
      expect(queries.getChatOwnership).toBeDefined()
      expect(queries.getChatIdsByUserId).toBeDefined()
      expect(queries.deleteChatOwnership).toBeDefined()
      expect(queries.getChatCountByUserId).toBeDefined()
      expect(queries.getChatCountByIP).toBeDefined()
      expect(queries.createAnonymousChatLog).toBeDefined()
      // App CRUD functions
      expect(queries.createApp).toBeDefined()
      expect(queries.getAppsByUserId).toBeDefined()
      expect(queries.getAppById).toBeDefined()
      expect(queries.deleteApp).toBeDefined()
      // Chat ownership by app functions
      expect(queries.getChatIdsByAppId).toBeDefined()
      expect(queries.deleteChatOwnershipsByAppId).toBeDefined()
    })
  })

  describe('createChatOwnership', () => {
    it('should use camelCase column names in values with appId', async () => {
      const { createChatOwnership } = await import('../../lib/db/queries')

      mockDb.returning.mockResolvedValueOnce([{ id: '1' }])

      await createChatOwnership({
        v0ChatId: 'chat-123',
        userId: 'user-456',
        appId: 'app-789',
      })

      // Verify insert was called
      expect(mockDb.insert).toHaveBeenCalled()

      // Verify values uses camelCase keys including appId
      expect(mockDb.values).toHaveBeenCalledWith({
        v0ChatId: 'chat-123',
        userId: 'user-456',
        appId: 'app-789',
      })
    })

    it('should allow appId to be undefined during migration', async () => {
      const { createChatOwnership } = await import('../../lib/db/queries')

      mockDb.returning.mockResolvedValueOnce([{ id: '1' }])

      await createChatOwnership({
        v0ChatId: 'chat-123',
        userId: 'user-456',
      })

      // Verify values includes undefined appId
      expect(mockDb.values).toHaveBeenCalledWith({
        v0ChatId: 'chat-123',
        userId: 'user-456',
        appId: undefined,
      })
    })
  })

  describe('createAnonymousChatLog', () => {
    it('should use camelCase column names in values', async () => {
      const { createAnonymousChatLog } = await import('../../lib/db/queries')

      mockDb.values.mockResolvedValueOnce([{ id: '1' }])

      await createAnonymousChatLog({
        ipAddress: '192.168.1.1',
        v0ChatId: 'chat-789',
      })

      // Verify values uses camelCase keys
      expect(mockDb.values).toHaveBeenCalledWith({
        ipAddress: '192.168.1.1',
        v0ChatId: 'chat-789',
      })
    })
  })

  describe('createApp', () => {
    it('should use camelCase column names in values', async () => {
      const { createApp } = await import('../../lib/db/queries')

      mockDb.returning.mockResolvedValueOnce([{ id: 'app-1', userId: 'user-123', name: 'My App' }])

      await createApp({
        userId: 'user-123',
        name: 'My App',
      })

      // Verify insert was called
      expect(mockDb.insert).toHaveBeenCalled()

      // Verify values uses camelCase keys
      expect(mockDb.values).toHaveBeenCalledWith({
        userId: 'user-123',
        name: 'My App',
      })
    })
  })

  describe('getAppsByUserId', () => {
    it('should query apps by userId', async () => {
      const { getAppsByUserId } = await import('../../lib/db/queries')

      mockDb.orderBy.mockResolvedValueOnce([
        { id: 'app-1', userId: 'user-123', name: 'App 1' },
        { id: 'app-2', userId: 'user-123', name: 'App 2' },
      ])

      const result = await getAppsByUserId({ userId: 'user-123' })

      expect(mockDb.select).toHaveBeenCalled()
      expect(mockDb.from).toHaveBeenCalled()
      expect(mockDb.where).toHaveBeenCalled()
      expect(mockDb.orderBy).toHaveBeenCalled()
      expect(result).toHaveLength(2)
    })
  })

  describe('getAppById', () => {
    it('should return app by id', async () => {
      const { getAppById } = await import('../../lib/db/queries')

      mockDb.where.mockResolvedValueOnce([{ id: 'app-1', userId: 'user-123', name: 'My App' }])

      const result = await getAppById({ appId: 'app-1' })

      expect(mockDb.select).toHaveBeenCalled()
      expect(mockDb.from).toHaveBeenCalled()
      expect(mockDb.where).toHaveBeenCalled()
      expect(result?.name).toBe('My App')
    })
  })

  describe('deleteApp', () => {
    it('should delete app by id', async () => {
      const { deleteApp } = await import('../../lib/db/queries')

      mockDb.where.mockResolvedValueOnce({ rowCount: 1 })

      await deleteApp({ appId: 'app-1' })

      expect(mockDb.delete).toHaveBeenCalled()
      expect(mockDb.where).toHaveBeenCalled()
    })
  })

  describe('getChatIdsByAppId', () => {
    it('should query chat IDs by appId', async () => {
      const { getChatIdsByAppId } = await import('../../lib/db/queries')

      mockDb.orderBy.mockResolvedValueOnce([
        { v0ChatId: 'chat-1' },
        { v0ChatId: 'chat-2' },
      ])

      const result = await getChatIdsByAppId({ appId: 'app-123' })

      expect(mockDb.select).toHaveBeenCalled()
      expect(mockDb.from).toHaveBeenCalled()
      expect(mockDb.where).toHaveBeenCalled()
      expect(mockDb.orderBy).toHaveBeenCalled()
      expect(result).toEqual(['chat-1', 'chat-2'])
    })
  })

  describe('deleteChatOwnershipsByAppId', () => {
    it('should delete all chat ownerships for an app', async () => {
      const { deleteChatOwnershipsByAppId } = await import('../../lib/db/queries')

      mockDb.where.mockResolvedValueOnce({ rowCount: 3 })

      await deleteChatOwnershipsByAppId({ appId: 'app-123' })

      expect(mockDb.delete).toHaveBeenCalled()
      expect(mockDb.where).toHaveBeenCalled()
    })
  })
})
