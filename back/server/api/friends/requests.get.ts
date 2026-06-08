import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
    const user = getUserFromEvent(event)

    // Get pending requests received by this user
    const requests = await prisma.friend.findMany({
        where: {
            friendId: user.userId,
            status: 'PENDING',
        },
        include: {
            user: {
                select: { id: true, username: true, mmr: true, avatarUrl: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    })

    return requests.map(r => ({
        requestId: r.id,
        createdAt: r.createdAt,
        from: r.user,
    }))
})
