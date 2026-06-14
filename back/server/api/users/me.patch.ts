import { z } from 'zod'
import prisma from '../../utils/prisma'
import { getUserFromEvent } from '../../utils/auth'
import * as argon2 from 'argon2'

const UpdateUserSchema = z.object({
    username: z.string().min(3).max(20).optional(),
    email: z.string().email().optional(),
    currentPassword: z.string().min(6).optional(),
    newPassword: z.string().min(6).optional(),
})

export default defineEventHandler(async (event) => {
    const { userId } = getUserFromEvent(event)
    const body = await readBody(event)
    const result = UpdateUserSchema.safeParse(body)

    if (!result.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Validation Error',
            data: result.error.issues,
        })
    }

    const { username, email, currentPassword, newPassword } = result.data

    // Fetch current user for password verification
    const currentUser = await prisma.user.findUnique({ where: { id: userId } })
    if (!currentUser) {
        throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }

    // Username uniqueness check
    if (username) {
        const existing = await prisma.user.findUnique({ where: { username } })
        if (existing && existing.id !== userId) {
            throw createError({
                statusCode: 409,
                statusMessage: 'Username already taken'
            })
        }
    }

    // Email uniqueness check
    if (email) {
        const existing = await prisma.user.findUnique({ where: { email } })
        if (existing && existing.id !== userId) {
            throw createError({
                statusCode: 409,
                statusMessage: 'Email already in use'
            })
        }
    }

    // Password change: requires currentPassword to authenticate
    if (newPassword) {
        if (!currentPassword) {
            throw createError({
                statusCode: 400,
                statusMessage: 'Current password is required to set a new password'
            })
        }
        const valid = await argon2.verify(currentUser.password, currentPassword)
        if (!valid) {
            throw createError({
                statusCode: 401,
                statusMessage: 'Current password is incorrect'
            })
        }
    }

    const updateData: any = {}
    if (username !== undefined) updateData.username = username
    if (email !== undefined) updateData.email = email
    if (newPassword) updateData.password = await argon2.hash(newPassword)

    const user = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
            id: true,
            username: true,
            email: true,
            mmr: true,
            avatarUrl: true,
        },
    })

    return user
})
