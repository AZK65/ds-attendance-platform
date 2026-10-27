import type { NextRequest } from 'next/server'
import { describeDevice } from './admin-session'
import { prisma } from './db'

export interface StaffActor {
  sessionId: string | null
  label: string
}

/** Who is signed in on this browser. The app shares one staff password, so the device session is the actor. */
export async function staffActor(request: NextRequest): Promise<StaffActor> {
  const sid = request.cookies.get('sid')?.value
  if (!sid) return { sessionId: null, label: 'Staff' }
  const session = await prisma.adminSession.findUnique({ where: { id: sid } })
  if (!session) return { sessionId: null, label: 'Staff' }
  const label = session.label?.trim() || describeDevice(session.userAgent)
  return { sessionId: session.id, label: label || 'Staff' }
}
