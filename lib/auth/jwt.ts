import 'server-only'

import { jwtVerify, SignJWT } from 'jose'

/**
 * JWT configuration for generated app authentication.
 *
 * Generated apps authenticate to the Fastform backend using JWTs.
 * Each app receives a unique secret key during generation.
 */

/**
 * JWT payload for generated app authentication.
 */
export interface AppJWTPayload {
  /** App ID that this token authenticates */
  appId: string
  /** Token issued at timestamp */
  iat?: number
  /** Token expiration timestamp */
  exp?: number
}

/**
 * Creates a JWT for a generated app.
 *
 * This is used during app generation to create the authentication token
 * that the generated app will use to authenticate with the Fastform backend.
 *
 * @param appId - The app ID to create token for
 * @param secret - The app-specific secret key
 * @param expiresIn - Token expiration in seconds (default: 10 years)
 * @returns Signed JWT token string
 *
 * @example
 * ```typescript
 * const token = await createAppJWT(appId, appSecret)
 * // Include token in generated app's environment variables
 * ```
 */
export async function createAppJWT(
  appId: string,
  secret: string,
  expiresIn: number = 60 * 60 * 24 * 365 * 10 // 10 years default
): Promise<string> {
  const encoder = new TextEncoder()
  const secretKey = encoder.encode(secret)

  const token = await new SignJWT({ appId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .sign(secretKey)

  return token
}

/**
 * Verifies a JWT from a generated app.
 *
 * This is used in API endpoints to verify that requests are coming from
 * a legitimate generated app with a valid token.
 *
 * @param token - The JWT token to verify
 * @param secret - The app-specific secret key
 * @returns Decoded JWT payload if valid
 * @throws Error if token is invalid or expired
 *
 * @example
 * ```typescript
 * try {
 *   const payload = await verifyAppJWT(token, appSecret)
 *   // Token is valid, proceed with request
 * } catch (error) {
 *   // Token is invalid, return 401
 * }
 * ```
 */
export async function verifyAppJWT(token: string, secret: string): Promise<AppJWTPayload> {
  const encoder = new TextEncoder()
  const secretKey = encoder.encode(secret)

  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    })

    if (!payload.appId || typeof payload.appId !== 'string') {
      throw new Error('Invalid token: missing appId')
    }

    return payload as AppJWTPayload
  } catch (error) {
    throw new Error(`Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Extracts JWT token from Authorization header.
 *
 * @param authHeader - The Authorization header value
 * @returns JWT token string or null if not found/invalid format
 *
 * @example
 * ```typescript
 * const token = extractTokenFromHeader(request.headers.get('authorization'))
 * if (!token) {
 *   return NextResponse.json({ error: 'Missing token' }, { status: 401 })
 * }
 * ```
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader) {
    return null
  }

  // Support both "Bearer <token>" and just "<token>" formats
  const parts = authHeader.split(' ')
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1]
  }

  // If it's just the token without "Bearer" prefix
  if (parts.length === 1) {
    return parts[0]
  }

  return null
}
