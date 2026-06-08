import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
    const user = getUserFromEvent(event)

    // Get all accepted friends
    const friendships = await prisma.friend.findMany({
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

    const friends = friendships.map(f => f.userId === user.userId ? f.friend : f.user)

    // For each friend, fetch the last message and count unread messages from them
    const conversations = await Promise.all(friends.map(async (friend) => {
        const lastMessage = await prisma.message.findFirst({
            where: {
                OR: [
                    { senderId: user.userId, receiverId: friend.id },
                    { senderId: friend.id, receiverId: user.userId },
                ]
            },
            orderBy: { createdAt: 'desc' },
            select: {
                content: true,
                createdAt: true,
                senderId: true,
            }
        })

        const unreadCount = await prisma.message.count({
            where: {
                senderId: friend.id,
                receiverId: user.userId,
                read: false
            }
        })

        return {
            ...friend,
            lastMessage,
            unreadCount,
        }
    }))

    // Sort by last message date, or if none, push to the end
    conversations.sort((a, b) => {
        if (!a.lastMessage && !b.lastMessage) return 0
        if (!a.lastMessage) return 1
        if (!b.lastMessage) return -1
        return new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
    })

    return conversations
})
