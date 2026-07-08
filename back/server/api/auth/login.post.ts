import { z } from 'zod'
import prisma from '../../utils/prisma'
import * as argon2 from 'argon2'
import jwt from 'jsonwebtoken'

const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
})

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const result = LoginSchema.safeParse(body)

    if (!result.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Validation Error',
            data: result.error.issues,
        })
    }

    const { email, password } = result.data

    const user = await prisma.user.findUnique({
        where: { email },
    })

    if (!user) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Invalid credentials',
        })
    }

    const validPassword = await argon2.verify(user.password, password)

    if (!validPassword) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Invalid credentials',
        })
    }

    // TODO: Move secret to env
    // TEST
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', {
        expiresIn: '7d',
    })

    const refreshToken = jwt.sign({ userId: user.id }, process.env.JWT_REFRESH_SECRET || 'refresh_secret', {
        expiresIn: '7d',
    })

    return {
        user: {
            id: user.id,
            email: user.email,
            username: user.username,
            mmr: user.mmr,
            avatarUrl: user.avatarUrl,
        },
        token,
        refreshToken
    }
})
