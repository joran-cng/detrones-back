import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
    const user = getUserFromEvent(event)

    // Count unread messages from all senders
    const count = await prisma.message.count({
        where: {
            receiverId: user.userId,
            read: false,
        }
    })

    // Also count pending friend requests
    const pendingRequests = await prisma.friend.count({
        where: {
            friendId: user.userId,
            status: 'PENDING',
        }
    })

    return { unreadMessages: count, pendingRequests }
})
