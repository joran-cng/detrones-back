import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
    const user = getUserFromEvent(event)
    const body = await readBody(event)

    if (!body.friendId) {
        throw createError({ statusCode: 400, statusMessage: 'friendId is required' })
    }

    // Delete accepted friendship in either direction
    await prisma.friend.deleteMany({
        where: {
            status: 'ACCEPTED',
            OR: [
                { userId: user.userId, friendId: body.friendId },
                { userId: body.friendId, friendId: user.userId },
            ]
        }
    })

    return { success: true }
})
