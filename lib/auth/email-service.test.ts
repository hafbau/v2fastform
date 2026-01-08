import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendMagicLinkEmail } from './email-service'
import nodemailer from 'nodemailer'

// Mock nodemailer
vi.mock('nodemailer')

describe('Email Service', () => {
  const mockSendMail = vi.fn()
  const mockTransporter = {
    sendMail: mockSendMail,
  }

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks()

    // Setup nodemailer.createTransport mock
    vi.mocked(nodemailer.createTransport).mockReturnValue(
      mockTransporter as unknown as ReturnType<typeof nodemailer.createTransport>
    )

    // Mock environment variables
    process.env.SMTP_HOST = 'smtp.test.com'
    process.env.SMTP_PORT = '587'
    process.env.SMTP_USER = 'test@example.com'
    process.env.SMTP_PASS = 'test-password'
  })

  afterEach(() => {
    // Clean up environment variables
    delete process.env.SMTP_HOST
    delete process.env.SMTP_PORT
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
  })

  describe('sendMagicLinkEmail', () => {
    it('should send email with correct parameters', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' })

      const to = 'user@example.com'
      const magicLink = 'https://example.com/auth/verify?token=abc123'
      const appName = 'TestApp'

      await sendMagicLinkEmail(to, magicLink, appName)

      expect(mockSendMail).toHaveBeenCalledTimes(1)
      expect(mockSendMail).toHaveBeenCalledWith({
        from: process.env.SMTP_USER,
        to,
        subject: `Sign in to ${appName}`,
        text: expect.stringContaining(magicLink),
        html: expect.stringContaining(magicLink),
      })
    })

    it('should create transporter with correct SMTP configuration', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' })

      await sendMagicLinkEmail('user@example.com', 'https://example.com/auth/verify?token=abc123', 'TestApp')

      expect(nodemailer.createTransport).toHaveBeenCalledTimes(1)
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.test.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@example.com',
          pass: 'test-password',
        },
      })
    })

    it('should include expiry information in email template', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' })

      const magicLink = 'https://example.com/auth/verify?token=abc123'

      await sendMagicLinkEmail('user@example.com', magicLink, 'TestApp')

      const callArgs = mockSendMail.mock.calls[0][0]
      expect(callArgs.text).toContain('15 minutes')
      expect(callArgs.html).toContain('15 minutes')
    })

    it('should include magic link in both text and HTML templates', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' })

      const magicLink = 'https://example.com/auth/verify?token=abc123'

      await sendMagicLinkEmail('user@example.com', magicLink, 'TestApp')

      const callArgs = mockSendMail.mock.calls[0][0]
      expect(callArgs.text).toContain(magicLink)
      expect(callArgs.html).toContain(magicLink)
    })

    it('should throw error when SMTP_HOST is missing', async () => {
      delete process.env.SMTP_HOST

      await expect(
        sendMagicLinkEmail('user@example.com', 'https://example.com/auth/verify?token=abc123', 'TestApp')
      ).rejects.toThrow('SMTP_HOST environment variable is required')
    })

    it('should throw error when SMTP_PORT is missing', async () => {
      delete process.env.SMTP_PORT

      await expect(
        sendMagicLinkEmail('user@example.com', 'https://example.com/auth/verify?token=abc123', 'TestApp')
      ).rejects.toThrow('SMTP_PORT environment variable is required')
    })

    it('should throw error when SMTP_USER is missing', async () => {
      delete process.env.SMTP_USER

      await expect(
        sendMagicLinkEmail('user@example.com', 'https://example.com/auth/verify?token=abc123', 'TestApp')
      ).rejects.toThrow('SMTP_USER environment variable is required')
    })

    it('should throw error when SMTP_PASS is missing', async () => {
      delete process.env.SMTP_PASS

      await expect(
        sendMagicLinkEmail('user@example.com', 'https://example.com/auth/verify?token=abc123', 'TestApp')
      ).rejects.toThrow('SMTP_PASS environment variable is required')
    })

    it('should throw error when email sending fails', async () => {
      const emailError = new Error('SMTP connection failed')
      mockSendMail.mockRejectedValueOnce(emailError)

      await expect(
        sendMagicLinkEmail('user@example.com', 'https://example.com/auth/verify?token=abc123', 'TestApp')
      ).rejects.toThrow('Failed to send magic link email: SMTP connection failed')
    })

    it('should handle SMTP port as number', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' })
      process.env.SMTP_PORT = '465'

      await sendMagicLinkEmail('user@example.com', 'https://example.com/auth/verify?token=abc123', 'TestApp')

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 465,
        })
      )
    })

    it('should use secure connection for port 465', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' })
      process.env.SMTP_PORT = '465'

      await sendMagicLinkEmail('user@example.com', 'https://example.com/auth/verify?token=abc123', 'TestApp')

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          secure: true,
        })
      )
    })

    it('should use non-secure connection for port 587', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' })
      process.env.SMTP_PORT = '587'

      await sendMagicLinkEmail('user@example.com', 'https://example.com/auth/verify?token=abc123', 'TestApp')

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          secure: false,
        })
      )
    })

    it('should escape HTML special characters in text email', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' })

      const magicLink = 'https://example.com/auth/verify?token=abc<script>alert("xss")</script>'

      await sendMagicLinkEmail('user@example.com', magicLink, 'TestApp')

      const callArgs = mockSendMail.mock.calls[0][0]
      expect(callArgs.html).not.toContain('<script>')
    })

    it('should set correct subject line with app name', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' })

      await sendMagicLinkEmail('user@example.com', 'https://example.com/auth/verify?token=abc123', 'MyCustomApp')

      const callArgs = mockSendMail.mock.calls[0][0]
      expect(callArgs.subject).toBe('Sign in to MyCustomApp')
    })

    it('should resolve successfully when email is sent', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' })

      await expect(
        sendMagicLinkEmail('user@example.com', 'https://example.com/auth/verify?token=abc123', 'TestApp')
      ).resolves.toBeUndefined()
    })
  })
})
