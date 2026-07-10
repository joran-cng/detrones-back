import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id')

    const user = await prisma.user.findUnique({
        where: { id },
        select: {
            id: true,
            username: true,
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
