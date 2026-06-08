import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
    const user = getUserFromEvent(event)
    const friendId = getRouterParam(event, 'friendId') as string

    // Verify they are actual friends (ACCEPTED)
    const friendship = await prisma.friend.findFirst({
        where: {
            status: 'ACCEPTED',
            OR: [
                { userId: user.userId, friendId },
                { userId: friendId, friendId: user.userId },
            ]
        }
    })

    if (!friendship) {
        throw createError({ statusCode: 403, statusMessage: 'Not friends' })
    }

    // Fetch messages between the two users
    const messages = await prisma.message.findMany({
        where: {
            OR: [
                { senderId: user.userId, receiverId: friendId },
                { senderId: friendId, receiverId: user.userId },
            ]
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
        include: {
            sender: { select: { id: true, username: true, avatarUrl: true } }
        }
    })

    // Mark unread messages from friend as read
    await prisma.message.updateMany({
        where: {
            senderId: friendId,
            receiverId: user.userId,
            read: false,
        },
        data: { read: true }
    })

    return messages
})
