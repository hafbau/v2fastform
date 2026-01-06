import { describe, it, expect } from 'vitest'
import {
  users,
  apps,
  chatOwnerships,
  anonymousChatLogs,
  type User,
  type App,
  type ChatOwnership,
  type AnonymousChatLog,
} from '../../lib/db/schema'

describe('Database Schema', () => {
  describe('users table', () => {
    it('should have camelCase column names', () => {
      // Verify the schema structure exists
      expect(users).toBeDefined()

      // Check that the columns object has camelCase keys
      const columnKeys = Object.keys(users)
      expect(columnKeys).toContain('createdAt')
      expect(columnKeys).not.toContain('created_at')
    })

    it('should export User type', () => {
      // TypeScript will catch this at compile time, but we verify the export works
      const mockUser: User = {
        id: '123',
        email: 'test@example.com',
        password: 'hash',
        createdAt: new Date(),
      }
      expect(mockUser.createdAt).toBeInstanceOf(Date)
    })
  })

  describe('apps table', () => {
    it('should have camelCase column names', () => {
      expect(apps).toBeDefined()

      const columnKeys = Object.keys(apps)
      expect(columnKeys).toContain('userId')
      expect(columnKeys).toContain('createdAt')

      // Should NOT have snake_case columns
      expect(columnKeys).not.toContain('user_id')
      expect(columnKeys).not.toContain('created_at')
    })

    it('should export App type', () => {
      const mockApp: App = {
        id: '123',
        userId: 'user-456',
        name: 'My App',
        createdAt: new Date(),
      }
      expect(mockApp.userId).toBe('user-456')
      expect(mockApp.name).toBe('My App')
    })
  })

  describe('chatOwnerships table', () => {
    it('should have camelCase column names', () => {
      expect(chatOwnerships).toBeDefined()

      const columnKeys = Object.keys(chatOwnerships)
      expect(columnKeys).toContain('v0ChatId')
      expect(columnKeys).toContain('userId')
      expect(columnKeys).toContain('createdAt')

      // Should NOT have snake_case columns
      expect(columnKeys).not.toContain('v0_chat_id')
      expect(columnKeys).not.toContain('user_id')
      expect(columnKeys).not.toContain('created_at')
    })

    it('should export ChatOwnership type', () => {
      const mockOwnership: ChatOwnership = {
        id: '123',
        v0ChatId: 'chat-456',
        userId: 'user-789',
        createdAt: new Date(),
      }
      expect(mockOwnership.v0ChatId).toBe('chat-456')
      expect(mockOwnership.userId).toBe('user-789')
    })
  })

  describe('anonymousChatLogs table', () => {
    it('should have camelCase column names', () => {
      expect(anonymousChatLogs).toBeDefined()

      const columnKeys = Object.keys(anonymousChatLogs)
      expect(columnKeys).toContain('ipAddress')
      expect(columnKeys).toContain('v0ChatId')
      expect(columnKeys).toContain('createdAt')

      // Should NOT have snake_case columns
      expect(columnKeys).not.toContain('ip_address')
      expect(columnKeys).not.toContain('v0_chat_id')
      expect(columnKeys).not.toContain('created_at')
    })

    it('should export AnonymousChatLog type', () => {
      const mockLog: AnonymousChatLog = {
        id: '123',
        ipAddress: '192.168.1.1',
        v0ChatId: 'chat-456',
        createdAt: new Date(),
      }
      expect(mockLog.ipAddress).toBe('192.168.1.1')
    })
  })
})
