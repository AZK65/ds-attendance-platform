import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/api/auth', '/camera', '/enroll', '/api/enroll', '/api/zoom/webhook']
const IGNORED_PREFIXES = ['/_next', '/favicon.ico']
const PUBLIC_FILE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.gif']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware for static assets and public paths
  if (IGNORED_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }
  if (PUBLIC_FILE_EXTENSIONS.some(ext => pathname.endsWith(ext))) {
    return NextResponse.next()
  }
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // Allow internal server-side requests (from instrumentation.ts / scheduled processors)
  if (request.headers.get('x-internal') === '1') {
    const referer = request.headers.get('referer') || ''
    const host = request.headers.get('host') || ''
    // Only trust x-internal from localhost (server calling itself)
    if (host.includes('localhost') || host.includes('127.0.0.1') || !referer) {
      return NextResponse.next()
    }
  }

  // Check for auth cookie
  const authToken = request.cookies.get('auth-token')?.value
  if (authToken === 'valid') {
    return NextResponse.next()
  }

  // Not authenticated - redirect pages to /login, return 401 for API routes
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const loginUrl = new URL('/login', request.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
