import { describe, it, expect, vi, beforeEach } from 'vitest'

// We need to hoist global stubs for Nuxt handler definition
vi.hoisted(() => {
  vi.stubGlobal('defineEventHandler', (handler: any) => handler)
  vi.stubGlobal('getQuery', (event: any) => event.query || {})
  vi.stubGlobal('createError', (options: any) => options)
})

// Mock the prisma utility
vi.mock('../../utils/prisma', () => {
  return {
    default: {
      friend: {
        findMany: vi.fn()
      },
      user: {
        findMany: vi.fn()
      }
    }
  }
})

// Mock the auth utility
vi.mock('../../utils/auth', () => {
  return {
    getUserFromEvent: vi.fn()
  }
})

import prisma from '../../utils/prisma'
import { getUserFromEvent } from '../../utils/auth'
import leaderboardHandler from '../leaderboard.get'

describe('Leaderboard Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return users ordered by MMR by default', async () => {
    const mockUsers = [
      { id: '1', username: 'Player1', mmr: 1500, wins: 10, avatarUrl: '' },
      { id: '2', username: 'Player2', mmr: 1200, wins: 5, avatarUrl: '' }
    ]
    vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers)

    const event = { query: { filter: '' } } as any
    const response = await leaderboardHandler(event)

    expect(response).toEqual(mockUsers)
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {},
      select: {
        id: true,
        username: true,
        mmr: true,
        wins: true,
        avatarUrl: true,
      },
      orderBy: {
        mmr: 'desc',
      },
      take: 50,
    })
  })

  it('should throw 401 if filter is friends and user is not authenticated', async () => {
    vi.mocked(getUserFromEvent).mockImplementation(() => {
      throw new Error('No token')
    })

    const event = { query: { filter: 'friends' } } as any

    const promise = leaderboardHandler(event)
    await expect(promise).rejects.toHaveProperty('statusCode', 401)
    await expect(promise).rejects.toHaveProperty('statusMessage', 'Authentication required for friends filter')
  })
})
