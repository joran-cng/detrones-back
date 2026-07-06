import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
    const user = getUserFromEvent(event)
    const body = await readBody(event)

    if (!body.inviteId) {
        throw createError({ statusCode: 400, statusMessage: 'inviteId is required' })
    }

    const invite = await prisma.gameInvite.findUnique({
        where: { id: body.inviteId },
    })

    if (!invite || invite.toUserId !== user.userId) {
        throw createError({ statusCode: 404, statusMessage: 'Invite not found' })
    }

    if (invite.status === 'PENDING') {
        await prisma.gameInvite.update({
            where: { id: invite.id },
            data: { status: 'DECLINED' },
        })
    }

    return { success: true }
})
