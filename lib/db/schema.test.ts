import { describe, it, expect } from 'vitest'
import { apps } from './schema'

describe('Database Schema', () => {
  describe('apps table', () => {
    it('should have spec column defined', () => {
      expect(apps.spec).toBeDefined()
    })

    it('should have spec column as jsonb type', () => {
      expect(apps.spec.dataType).toBe('json')
    })

    it('should have spec column as not null', () => {
      expect(apps.spec.notNull).toBe(true)
    })

    it('should have spec column with default value', () => {
      expect(apps.spec.hasDefault).toBe(true)
    })

    it('should have all required columns', () => {
      const columns = Object.keys(apps)
      expect(columns).toContain('id')
      expect(columns).toContain('userId')
      expect(columns).toContain('name')
      expect(columns).toContain('spec')
      expect(columns).toContain('createdAt')
    })
  })
})
