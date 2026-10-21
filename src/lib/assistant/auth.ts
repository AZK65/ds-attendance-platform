import { createHash, timingSafeEqual } from 'crypto'

const QUERY_TOKEN_KEYS = ['token', 'access_token', 'api_key', 'api_token', 'authorization', 'auth']
const MAX_TOKEN_LENGTH = 512

export type AssistantAuthDecision =
  | { ok: true }
  | { ok: false; status: 400 | 401 | 503; error: string }

/** SHA-256 both sides so the comparison stays constant-time for any length. */
export function tokenMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header)
  if (!match) return null
  return match[1]
}

export function assistantAuthDecision(input: {
  authorization: string | null
  searchParams: URLSearchParams
  envToken: string | undefined
}): AssistantAuthDecision {
  const expected = input.envToken?.trim() || ''
  if (!expected) {
    return { ok: false, status: 503, error: 'Assistant API is disabled.' }
  }

  for (const key of QUERY_TOKEN_KEYS) {
    if (input.searchParams.has(key)) {
      return {
        ok: false,
        status: 400,
        error: 'Send the token in the Authorization header. Query-string tokens are not accepted.',
      }
    }
  }

  const provided = bearerToken(input.authorization) ?? ''
  // Always hash when the API is enabled so a missing header and a wrong
  // token take the same comparison path. Over-long values are not hashed.
  const comparable = provided.length > MAX_TOKEN_LENGTH ? '' : provided
  if (!tokenMatches(comparable, expected)) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  return { ok: true }
}
