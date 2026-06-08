import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
    const user = getUserFromEvent(event)

    // Get pending requests sent by this user
    const sent = await prisma.friend.findMany({
        where: {
            userId: user.userId,
            status: 'PENDING',
        },
        include: {
            friend: {
                select: { id: true, username: true, mmr: true, avatarUrl: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    })

    return sent.map(r => ({
        requestId: r.id,
        createdAt: r.createdAt,
        to: r.friend,
    }))
})
