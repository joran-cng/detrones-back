import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
    const user = getUserFromEvent(event)
    const body = await readBody(event)

    if (!body.friendId) {
        throw createError({ statusCode: 400, statusMessage: 'friendId is required' })
    }

    if (user.userId === body.friendId) {
        throw createError({ statusCode: 400, statusMessage: 'Cannot add yourself' })
    }

    // Check if a relationship already exists in either direction
    const existing = await prisma.friend.findFirst({
        where: {
            OR: [
                { userId: user.userId, friendId: body.friendId },
                { userId: body.friendId, friendId: user.userId },
            ]
        }
    })

    if (existing) {
        if (existing.status === 'ACCEPTED') {
            throw createError({ statusCode: 400, statusMessage: 'Already friends' })
        }
        throw createError({ statusCode: 400, statusMessage: 'Friend request already pending' })
    }

    // Create a PENDING friend request
    const request = await prisma.friend.create({
        data: {
            userId: user.userId,
            friendId: body.friendId,
            status: 'PENDING',
        }
    })

    return { success: true, request }
})
