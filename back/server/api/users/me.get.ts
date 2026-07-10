import prisma from '../../utils/prisma'
import { getUserFromEvent } from '../../utils/auth'

export default defineEventHandler(async (event) => {
    const { userId } = getUserFromEvent(event)

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            username: true,
            email: true,
            mmr: true,
            wins: true,
            avatarUrl: true,
            createdAt: true,
        },
    })

    if (!user) {
        throw createError({
            statusCode: 404,
            statusMessage: 'User not found',
        })
    }

    return user
})
