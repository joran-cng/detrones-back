import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
    const user = getUserFromEvent(event)
    const body = await readBody(event)

    if (!body.requestId) {
        throw createError({ statusCode: 400, statusMessage: 'requestId is required' })
    }

    // Find the pending request where we are the recipient
    const request = await prisma.friend.findFirst({
        where: {
            id: body.requestId,
            friendId: user.userId,
            status: 'PENDING',
        }
    })

    if (!request) {
        throw createError({ statusCode: 404, statusMessage: 'Friend request not found' })
    }

    // Accept: update status to ACCEPTED
    const updated = await prisma.friend.update({
        where: { id: request.id },
        data: { status: 'ACCEPTED' }
    })

    return { success: true, friendship: updated }
})
