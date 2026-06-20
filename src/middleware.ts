import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/api/auth', '/camera', '/enroll', '/api/enroll', '/api/zoom/webhook', '/register', '/api/register', '/api/payment', '/exam', '/api/exam', '/book', '/api/book', '/api/leads/webhook', '/api/kiosk/heartbeat', '/api/kiosk/stream']
const IGNORED_PREFIXES = ['/_next', '/favicon.ico']
const PUBLIC_FILE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.gif']

// Cross-origin allowlist for the public registration API.
// The marketing site lives on Cloudflare Pages at qazidriving.ca and POSTs
// to qazidrivingschool.ca/api/register from a different origin, so the API
// must respond with CORS headers.
// Override with env var:
//   ALLOWED_ORIGINS="https://qazidriving.ca,https://www.qazidriving.ca"
const DEFAULT_ALLOWED_ORIGINS = [
  'https://qazidriving.ca',
  'https://www.qazidriving.ca',
]
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)
  .concat(DEFAULT_ALLOWED_ORIGINS)

const CORS_PATHS = ['/api/register', '/api/payment']

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const origin = request.headers.get('origin')

  // CORS preflight + response decoration for the public registration API.
  if (CORS_PATHS.some(p => pathname.startsWith(p))) {
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
    }
    const res = NextResponse.next()
    for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v)
    return res
  }

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
