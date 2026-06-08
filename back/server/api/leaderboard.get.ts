import prisma from '../utils/prisma'

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const filter = query.filter as string | undefined

    // If filter=friends, only return friends of the authenticated user
    if (filter === 'friends') {
        let userId: string | null = null
        try {
            const user = getUserFromEvent(event)
            userId = user.userId
        } catch {
            // Not authenticated, return empty list
            return []
        }

        const friends = await prisma.friend.findMany({
            where: { userId },
            include: {
                friend: {
                    select: {
                        id: true,
                        username: true,
                        mmr: true,
                        winsCount: true,
                        avatarUrl: true,
                    }
                }
            }
        })

        // Also include the user themselves
        const me = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                mmr: true,
                winsCount: true,
                avatarUrl: true,
            }
        })

        const allUsers = [
            ...friends.map(f => f.friend),
            ...(me ? [me] : [])
        ]

        // Sort by MMR descending
        allUsers.sort((a, b) => b.mmr - a.mmr)

        return allUsers
    }

    // Default: global leaderboard
    const users = await prisma.user.findMany({
        select: {
            id: true,
            username: true,
            mmr: true,
            winsCount: true,
            avatarUrl: true,
        },
        orderBy: {
            mmr: 'desc',
        },
        take: 50,
    })

    return users
})
