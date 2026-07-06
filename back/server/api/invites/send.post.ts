import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
    const user = getUserFromEvent(event)
    const body = await readBody(event)

    if (!body.friendId) {
        throw createError({ statusCode: 400, statusMessage: 'friendId is required' })
    }
    if (!body.roomCode || typeof body.roomCode !== 'string') {
        throw createError({ statusCode: 400, statusMessage: 'roomCode is required' })
    }

    const roomCode = body.roomCode.toUpperCase().trim()
    if (roomCode.length !== 4) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid room code' })
    }

    if (user.userId === body.friendId) {
        throw createError({ statusCode: 400, statusMessage: 'Cannot invite yourself' })
    }

    const friendship = await prisma.friend.findFirst({
        where: {
            status: 'ACCEPTED',
            OR: [
                { userId: user.userId, friendId: body.friendId },
                { userId: body.friendId, friendId: user.userId },
            ],
        },
    })

    if (!friendship) {
        throw createError({ statusCode: 403, statusMessage: 'You can only invite friends' })
    }

    const existing = await prisma.gameInvite.findFirst({
        where: {
            fromUserId: user.userId,
            toUserId: body.friendId,
            roomCode,
            status: 'PENDING',
            expiresAt: { gt: new Date() },
        },
    })

    if (existing) {
        throw createError({ statusCode: 400, statusMessage: 'Invite already sent' })
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

    const invite = await prisma.gameInvite.create({
        data: {
            fromUserId: user.userId,
            toUserId: body.friendId,
            roomCode,
            expiresAt,
        },
    })

    return { success: true, inviteId: invite.id }
})
