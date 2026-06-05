import { NextRequest, NextResponse } from 'next/server'

// GET /api/auth — lightweight check for whether the current request has
// a valid admin session cookie. The cookie is httpOnly so the client JS
// can't read it directly; this endpoint exists so public pages (like
// /register) can decide whether to show admin-only affordances.
export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value
  return NextResponse.json({ authed: token === 'valid' })
}

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()
    const correctPassword = process.env.AUTH_PASSWORD

    if (!correctPassword) {
      // If no password is set, allow access (dev mode)
      const response = NextResponse.json({ success: true })
      response.cookies.set('auth-token', 'valid', {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      })
      return response
    }

    if (password !== correctPassword) {
      return NextResponse.json(
        { error: 'Wrong password' },
        { status: 401 }
      )
    }

    const response = NextResponse.json({ success: true })
    response.cookies.set('auth-token', 'valid', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })
    return response
  } catch {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    )
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.set('auth-token', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}
