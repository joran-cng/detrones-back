import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
    const user = getUserFromEvent(event)
    const friendId = getRouterParam(event, 'friendId') as string
    const body = await readBody(event)

    if (!body.content || !body.content.trim()) {
        throw createError({ statusCode: 400, statusMessage: 'Message content is required' })
    }

    if (body.content.trim().length > 1000) {
        throw createError({ statusCode: 400, statusMessage: 'Message too long (max 1000 chars)' })
    }

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

    const message = await prisma.message.create({
        data: {
            senderId: user.userId,
            receiverId: friendId,
            content: body.content.trim(),
        },
        include: {
            sender: { select: { id: true, username: true, avatarUrl: true } }
        }
    })

    return message
})
