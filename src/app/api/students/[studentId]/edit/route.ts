import { NextRequest, NextResponse } from 'next/server'
import { loadEditableProfile, saveEditableProfile } from '@/lib/student-profile-edit'
import { prisma } from '@/lib/db'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
type Context = { params: Promise<{ studentId: string }> }

export async function GET(request: NextRequest, { params }: Context) {
  if (request.cookies.get('auth-token')?.value !== 'valid') return json({ error: 'Sign in to edit profiles.' }, 401)
  const { studentId } = await params
  if (!/^\d+$/.test(studentId)) return json({ error: 'Invalid student ID.' }, 400)
  try {
    const profile = await loadEditableProfile(Number(studentId))
    return profile ? json(profile) : json({ error: 'Student not found.' }, 404)
  } catch { return json({ error: 'Could not load this profile. Please retry.' }, 503) }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  if (request.cookies.get('auth-token')?.value !== 'valid') return json({ error: 'Sign in to edit profiles.' }, 401)
  const origin = request.headers.get('origin')
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && new URL(origin).host !== (request.headers.get('host') || request.nextUrl.host))) return json({ error: 'Open the profile from the school platform.' }, 403)
  } catch { return json({ error: 'Invalid origin.' }, 403) }
  const { studentId } = await params
  if (!/^\d+$/.test(studentId)) return json({ error: 'Invalid student ID.' }, 400)
  const body = await request.json().catch(() => null)
  if (!body || typeof body.revision !== 'string') return json({ error: 'Reload the profile before saving.' }, 400)
  const sid = request.cookies.get('sid')?.value
  const session = sid ? await prisma.adminSession.findUnique({ where: { id: sid } }) : null
  if (!session) return json({ error: 'Sign in again before saving profile changes.' }, 401)
  try {
    return json(await saveEditableProfile(Number(studentId), body.fields, body.revision, session.label || session.id))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/Profile changed/.test(message)) return json({ error: message }, 409)
    if (/required|valid|Check |must be|Only profile|Use Change|belongs to|Enter /.test(message)) return json({ error: message }, 400)
    console.error('Profile update failed:', error)
    return json({ error: 'Could not save the profile. Reload and check the details before retrying.' }, 500)
  }
}
