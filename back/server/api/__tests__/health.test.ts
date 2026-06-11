import { describe, it, expect, vi } from 'vitest'

// Wrap global stub in hoisted to ensure it runs before module evaluation
vi.hoisted(() => {
  vi.stubGlobal('defineEventHandler', (handler: any) => handler)
})

import healthHandler from '../health.get'

describe('Health Endpoint', () => {
  it('should return status ok and a valid timestamp', () => {
    const event = {} as any
    const response = healthHandler(event)
    expect(response.status).toBe('ok')
    expect(response.timestamp).toBeDefined()
    expect(Date.parse(response.timestamp)).not.toBeNaN()
  })
})
