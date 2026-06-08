import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
    const user = getUserFromEvent(event)

    // Return only ACCEPTED friends
    const friends = await prisma.friend.findMany({
        where: {
            OR: [
                { userId: user.userId, status: 'ACCEPTED' },
                { friendId: user.userId, status: 'ACCEPTED' },
            ]
        },
        include: {
            user: {
                select: { id: true, username: true, mmr: true, avatarUrl: true }
            },
            friend: {
                select: { id: true, username: true, mmr: true, avatarUrl: true }
            }
        }
    })

    // Return the "other" person in each relationship
    return friends.map(f => f.userId === user.userId ? f.friend : f.user)
})
