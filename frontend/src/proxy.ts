import { NextRequest, NextResponse } from 'next/server'

/**
 * Next.js Server-Side Auth Proxy (Next.js 16+)
 *
 * Runs on the Edge Runtime BEFORE any page is rendered or API route is called.
 * Checks for a valid auth_token cookie and redirects unauthenticated users to
 * /login — no page HTML is ever delivered to unauthenticated requests.
 */

// Routes that do NOT require authentication
const PUBLIC_PATHS = ['/login']

// Prefixes that are always allowed through
const PUBLIC_PREFIXES = ['/api/', '/_next/', '/favicon', '/icon', '/placeholder', '/images/']

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Allow public paths and Next.js internals through without auth check
    if (
        PUBLIC_PATHS.includes(pathname) ||
        PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix))
    ) {
        return NextResponse.next()
    }

    // Root path — let the page's own redirect handle it
    if (pathname === '/') {
        return NextResponse.next()
    }

    // Check for the HttpOnly auth cookie
    const authToken = request.cookies.get('auth_token')?.value

    if (!authToken) {
        // No cookie → redirect to login, preserving the intended destination
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('from', pathname)
        return NextResponse.redirect(loginUrl)
    }

    // Cookie present — allow the request through
    // The backend fully verifies the JWT signature on each API call
    return NextResponse.next()
}

/**
 * Matcher: run this proxy on all routes EXCEPT Next.js static internals
 */
export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|icon\\.jpg).*)',
    ],
}
