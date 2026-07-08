import { z } from 'zod'
import prisma from '../../utils/prisma'
import * as argon2 from 'argon2'
import jwt from 'jsonwebtoken'

const RegisterSchema = z.object({
    email: z.string().email(),
    username: z.string().min(3).max(20),
    password: z.string().min(6),
})

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const result = RegisterSchema.safeParse(body)

    if (!result.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Validation Error',
            data: result.error.issues,
        })
    }

    const { email, username, password } = result.data

    // Check email uniqueness first
    const existingEmail = await prisma.user.findUnique({ where: { email } })
    if (existingEmail) {
        throw createError({
            statusCode: 409,
            statusMessage: 'Email already in use',
        })
    }

    // Check username uniqueness — suggest a #N suffix if taken
    const existingUsername = await prisma.user.findUnique({ where: { username } })
    if (existingUsername) {
        // Find the next available suffix: username#1, username#2, ...
        let suggestion = username
        for (let i = 1; i <= 99; i++) {
            const candidate = `${username}#${i}`
            const taken = await prisma.user.findUnique({ where: { username: candidate } })
            if (!taken) {
                suggestion = candidate
                break
            }
        }
        throw createError({
            statusCode: 409,
            statusMessage: 'Username already taken',
            data: { suggestion },
        })
    }

    const hashedPassword = await argon2.hash(password)

    const user = await prisma.user.create({
        data: {
            email,
            username,
            password: hashedPassword,
        },
    })

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
