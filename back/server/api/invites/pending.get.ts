import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
    const user = getUserFromEvent(event)
    const now = new Date()

    // Expire stale invites
    await prisma.gameInvite.updateMany({
        where: {
            status: 'PENDING',
            expiresAt: { lte: now },
        },
        data: { status: 'EXPIRED' },
    })

    const invites = await prisma.gameInvite.findMany({
        where: {
            toUserId: user.userId,
            status: 'PENDING',
            expiresAt: { gt: now },
        },
        include: {
            fromUser: {
                select: { id: true, username: true, avatarUrl: true },
            },
        },
        orderBy: { createdAt: 'desc' },
    })

    return invites.map((inv) => ({
        id: inv.id,
        roomCode: inv.roomCode,
        createdAt: inv.createdAt,
        from: inv.fromUser,
    }))
})
