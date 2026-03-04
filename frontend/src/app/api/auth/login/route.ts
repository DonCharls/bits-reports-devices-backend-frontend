import { NextRequest, NextResponse } from 'next/server'

// BACKEND_URL must be set in .env.local (local) or docker-compose.yml (Docker).
// The server must NOT silently fall back to an internal Docker hostname
// when running locally, as that would make all login requests fail.
const backendUrl = process.env.BACKEND_URL;
if (!backendUrl) {
    throw new Error(
        '[STARTUP] BACKEND_URL is not set.\n' +
        '  LOCAL:  Add BACKEND_URL=http://localhost:3001 to frontend/.env.local\n' +
        '  DOCKER: Set BACKEND_URL in docker-compose.yml (already configured).'
    );
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()

        const res = await fetch(`${backendUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })

        const data = await res.json()
        return NextResponse.json(data, { status: res.status })
    } catch (error) {
        return NextResponse.json(
            { message: 'Network error. Could not reach the server.' },
            { status: 503 }
        )
    }
}
