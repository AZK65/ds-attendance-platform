// Shared admin-session cookie config. One year, refreshed on every
// authenticated request by middleware (sliding), so active devices stay
// logged in indefinitely.
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365

export const AUTH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE,
}
