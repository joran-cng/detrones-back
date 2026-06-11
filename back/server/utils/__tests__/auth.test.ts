import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import { getUserFromEvent } from '../auth'

// Mock global Nuxt/h3 utilities to ensure predictable unit test behavior
vi.stubGlobal('getRequestHeader', (event: any, headerName: string) => {
  return event.headers?.[headerName] || event.headers?.[headerName.toLowerCase()]
})

vi.stubGlobal('createError', (errorObj: any) => {
  const err = new Error(errorObj.statusMessage)
  ;(err as any).statusCode = errorObj.statusCode
  ;(err as any).statusMessage = errorObj.statusMessage
  return err
})

describe('getUserFromEvent', () => {
  const secret = 'super-secret-jwt-key-change-me'
  
  beforeEach(() => {
    process.env.JWT_SECRET = secret
  })

  it('should throw 401 Unauthorized if Authorization header is missing', () => {
    const event = { headers: {} } as any
    expect(() => getUserFromEvent(event)).toThrow('Unauthorized')
  })

  it('should throw 401 Unauthorized if Authorization header does not start with Bearer ', () => {
    const event = { headers: { Authorization: 'Basic dXNlcjpwYXNz' } } as any
    expect(() => getUserFromEvent(event)).toThrow('Unauthorized')
  })

  it('should throw 401 Invalid token if JWT token is invalid', () => {
    const event = { headers: { Authorization: 'Bearer invalid-token-value' } } as any
    expect(() => getUserFromEvent(event)).toThrow('Invalid token')
  })

  it('should return decoded token payload if JWT token is valid', () => {
    const payload = { userId: 'user-123' }
    const token = jwt.sign(payload, secret)
    const event = { headers: { Authorization: `Bearer ${token}` } } as any

    const result = getUserFromEvent(event)
    expect(result).toBeDefined()
    expect(result.userId).toBe('user-123')
  })
})
