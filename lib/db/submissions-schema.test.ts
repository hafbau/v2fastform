import { describe, it, expect } from 'vitest'
import { submissions } from './schema'
import type { Submission } from './schema'

describe('Database Schema - submissions table', () => {
  describe('table structure', () => {
    it('should have submissions table defined', () => {
      expect(submissions).toBeDefined()
    })

    it('should have all required columns', () => {
      const columns = Object.keys(submissions)
      expect(columns).toContain('id')
      expect(columns).toContain('appId')
      expect(columns).toContain('data')
      expect(columns).toContain('status')
      expect(columns).toContain('createdAt')
      expect(columns).toContain('updatedAt')
    })
  })

  describe('id column', () => {
    it('should be defined', () => {
      expect(submissions.id).toBeDefined()
    })

    it('should be string type (uuid stored as string)', () => {
      expect(submissions.id.dataType).toBe('string')
    })

    it('should be primary key', () => {
      expect(submissions.id.primary).toBe(true)
    })

    it('should have default value', () => {
      expect(submissions.id.hasDefault).toBe(true)
    })
  })

  describe('appId column', () => {
    it('should be defined', () => {
      expect(submissions.appId).toBeDefined()
    })

    it('should be string type (uuid stored as string)', () => {
      expect(submissions.appId.dataType).toBe('string')
    })

    it('should be not null', () => {
      expect(submissions.appId.notNull).toBe(true)
    })
  })

  describe('data column', () => {
    it('should be defined', () => {
      expect(submissions.data).toBeDefined()
    })

    it('should be jsonb type', () => {
      expect(submissions.data.dataType).toBe('json')
    })

    it('should be not null', () => {
      expect(submissions.data.notNull).toBe(true)
    })
  })

  describe('status column', () => {
    it('should be defined', () => {
      expect(submissions.status).toBeDefined()
    })

    it('should be varchar type', () => {
      expect(submissions.status.dataType).toBe('string')
    })

    it('should be not null', () => {
      expect(submissions.status.notNull).toBe(true)
    })

    it('should have length constraint of 20', () => {
      expect(submissions.status.length).toBe(20)
    })
  })

  describe('createdAt column', () => {
    it('should be defined', () => {
      expect(submissions.createdAt).toBeDefined()
    })

    it('should be timestamp type', () => {
      expect(submissions.createdAt.dataType).toBe('date')
    })

    it('should be not null', () => {
      expect(submissions.createdAt.notNull).toBe(true)
    })

    it('should have default value', () => {
      expect(submissions.createdAt.hasDefault).toBe(true)
    })
  })

  describe('updatedAt column', () => {
    it('should be defined', () => {
      expect(submissions.updatedAt).toBeDefined()
    })

    it('should be timestamp type', () => {
      expect(submissions.updatedAt.dataType).toBe('date')
    })

    it('should be not null', () => {
      expect(submissions.updatedAt.notNull).toBe(true)
    })

    it('should have default value', () => {
      expect(submissions.updatedAt.hasDefault).toBe(true)
    })
  })

  describe('Submission type', () => {
    it('should be exported and compatible with table structure', () => {
      // Type checking - this will fail at compile time if the type is not exported
      const mockSubmission: Submission = {
        id: 'uuid-here',
        appId: 'app-uuid-here',
        data: { field1: 'value1' },
        status: 'SUBMITTED',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(mockSubmission).toBeDefined()
      expect(mockSubmission.id).toBe('uuid-here')
      expect(mockSubmission.appId).toBe('app-uuid-here')
      expect(mockSubmission.data).toEqual({ field1: 'value1' })
      expect(mockSubmission.status).toBe('SUBMITTED')
      expect(mockSubmission.createdAt).toBeInstanceOf(Date)
      expect(mockSubmission.updatedAt).toBeInstanceOf(Date)
    })
  })
})
