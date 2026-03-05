import { NextResponse } from 'next/server'

/**
 * POST /api/auth/logout
 * Clears the HttpOnly auth_token cookie, effectively logging the user out.
 * No backend call needed — the token lives entirely in the Next.js cookie.
 */
export async function POST() {
    const response = NextResponse.json({ success: true, message: 'Logged out' })

    // Expire the cookie immediately
    response.cookies.set('auth_token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
    })

    return response
}
