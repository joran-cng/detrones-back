import prisma from '../utils/prisma'
import { getUserFromEvent } from '../utils/auth'

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const filter = query.filter as string

    let userId: string | null = null
    try {
        const decoded = getUserFromEvent(event)
        userId = decoded.userId
    } catch (e) {
        if (filter === 'friends') {
            throw createError({
                statusCode: 401,
                statusMessage: 'Authentication required for friends filter',
            })
        }
    }

    let whereClause = {}

    if (filter === 'friends' && userId) {
        const friendsList = await prisma.friend.findMany({
            where: { userId },
            select: { friendId: true }
        })
        const friendIds = friendsList.map(f => f.friendId)
        friendIds.push(userId)

        whereClause = {
            id: { in: friendIds }
        }
    }

    const users = await prisma.user.findMany({
        where: whereClause,
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

    return users
})
