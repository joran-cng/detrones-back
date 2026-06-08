import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
    const user = getUserFromEvent(event)
    const body = await readBody(event)

    if (!body.requestId) {
        throw createError({ statusCode: 400, statusMessage: 'requestId is required' })
    }

    // Can decline a request sent to us, OR cancel our own request
    const request = await prisma.friend.findFirst({
        where: {
            id: body.requestId,
            OR: [
                { friendId: user.userId }, // received
                { userId: user.userId },   // sent (cancel)
            ]
        }
    })

    if (!request) {
        throw createError({ statusCode: 404, statusMessage: 'Friend request not found' })
    }

    await prisma.friend.delete({ where: { id: request.id } })

    return { success: true }
})
