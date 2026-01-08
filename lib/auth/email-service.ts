import nodemailer from 'nodemailer'

/**
 * Configuration for SMTP email service
 */
interface SMTPConfig {
  host: string
  port: number
  secure: boolean
  auth: {
    user: string
    pass: string
  }
}

/**
 * Validates and retrieves SMTP configuration from environment variables
 * @throws {Error} If any required environment variable is missing
 */
function getSMTPConfig(): SMTPConfig {
  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host) {
    throw new Error('SMTP_HOST environment variable is required')
  }

  if (!port) {
    throw new Error('SMTP_PORT environment variable is required')
  }

  if (!user) {
    throw new Error('SMTP_USER environment variable is required')
  }

  if (!pass) {
    throw new Error('SMTP_PASS environment variable is required')
  }

  const portNumber = parseInt(port, 10)

  return {
    host,
    port: portNumber,
    secure: portNumber === 465,
    auth: {
      user,
      pass,
    },
  }
}

/**
 * Escapes HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (char) => map[char] || char)
}

/**
 * Generates the text template for the magic link email
 */
function generateTextTemplate(magicLink: string, appName: string): string {
  return `Sign in to ${appName}

Click the link below to sign in to your account:

${magicLink}

This link will expire in 15 minutes.

If you did not request this email, you can safely ignore it.`
}

/**
 * Generates the HTML template for the magic link email
 */
function generateHtmlTemplate(magicLink: string, appName: string): string {
  const escapedAppName = escapeHtml(appName)
  const escapedMagicLink = escapeHtml(magicLink)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to ${escapedAppName}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
    <h1 style="color: #333; margin-top: 0;">Sign in to ${escapedAppName}</h1>
    <p>Click the button below to sign in to your account:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${escapedMagicLink}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Sign In</a>
    </div>
    <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #007bff; font-size: 14px;">${escapedMagicLink}</p>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
    <p style="color: #999; font-size: 12px;">This link will expire in 15 minutes.</p>
    <p style="color: #999; font-size: 12px;">If you did not request this email, you can safely ignore it.</p>
  </div>
</body>
</html>`
}

/**
 * Sends a magic link email to the specified recipient
 *
 * @param to - The recipient's email address
 * @param magicLink - The magic link URL for authentication
 * @param appName - The name of the application
 * @throws {Error} If SMTP configuration is invalid or email sending fails
 */
export async function sendMagicLinkEmail(
  to: string,
  magicLink: string,
  appName: string
): Promise<void> {
  try {
    const config = getSMTPConfig()

    const transporter = nodemailer.createTransport(config)

    const mailOptions = {
      from: config.auth.user,
      to,
      subject: `Sign in to ${appName}`,
      text: generateTextTemplate(magicLink, appName),
      html: generateHtmlTemplate(magicLink, appName),
    }

    await transporter.sendMail(mailOptions)
  } catch (error) {
    if (error instanceof Error) {
      // If it's a configuration error (from getSMTPConfig), re-throw it
      if (error.message.includes('environment variable is required')) {
        throw error
      }
      // Otherwise, wrap it as an email sending error
      throw new Error(`Failed to send magic link email: ${error.message}`)
    }
    throw new Error('Failed to send magic link email: Unknown error')
  }
}
