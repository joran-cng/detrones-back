import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
    const body = await readBody<{ players: { username: string, role: string }[] }>(event)

    if (!body || !body.players) {
        throw createError({ statusCode: 400, message: 'Invalid payload' })
    }

    const roleMmrMap: Record<string, number> = {
        'PRESIDENT': 30,
        'VICE_PRESIDENT': 15,
        'NEUTRE': 0,
        'VICE_TDC': -15,
        'TDC': -30
    }

    for (const player of body.players) {
        const delta = roleMmrMap[player.role] || 0
        
        // Don't update bots
        if (player.username.startsWith('🤖')) continue
            
        const updateData: any = { mmr: { increment: delta } }
        if (player.role === 'PRESIDENT') {
            updateData.wins = { increment: 1 }
        }

        await prisma.user.updateMany({
            where: { username: player.username },
            data: updateData
        })
    }

    return { success: true }
})
