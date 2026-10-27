import type { NextRequest } from 'next/server'
import { prisma } from '../db'
import { getStudentById } from '../external-db'
import { Rsep1Error } from './errors'
import { profileStudentName } from './values'

export interface Class1Context {
  externalStudentId: number
  studentName: string
  registrationId: string | null
}

export interface Actor {
  sessionId: string | null
  label: string | null
}

/**
 * Class 1 in this app is `vehicleType === "truck"`. There is no separate
 * Class 3 flag on the student or the registration.
 */
export async function resolveClass1(studentIdParam: string): Promise<Class1Context> {
  const externalStudentId = Number(studentIdParam)
  if (!Number.isInteger(externalStudentId) || externalStudentId <= 0) {
    throw new Rsep1Error(400, 'invalid_student', 'Student id is invalid')
  }

  const student = await getStudentById(externalStudentId)
  if (!student) throw new Rsep1Error(404, 'not_found', 'Student not found')

  const digits = (student.phone_number || '').replace(/\D/g, '')
  const phoneSearch = digits.length > 10 ? digits.slice(-10) : digits

  const registration = await prisma.studentRegistration.findFirst({
    where: {
      OR: [
        { externalId: externalStudentId },
        ...(phoneSearch.length >= 7 ? [{ phoneNumber: { contains: phoneSearch } }] : []),
      ],
      status: { in: ['confirmed', 'submitted'] },
    },
    orderBy: { createdAt: 'desc' },
  })

  const memberships = phoneSearch.length >= 7
    ? await prisma.groupMember.findMany({
        where: { phone: { contains: phoneSearch } },
        select: { group: { select: { vehicleType: true } } },
      })
    : []

  const vehicleType = registration?.vehicleType
    || (memberships.some(member => member.group.vehicleType === 'truck') ? 'truck' : 'car')

  if (vehicleType !== 'truck') {
    throw new Rsep1Error(404, 'not_class1', 'Results sheets are for Class 1 students only')
  }

  return {
    externalStudentId,
    studentName: profileStudentName(student.full_name),
    registrationId: registration?.id ?? null,
  }
}

export async function actorFrom(request: NextRequest): Promise<Actor> {
  const sid = request.cookies.get('sid')?.value
  if (!sid) return { sessionId: null, label: null }
  const session = await prisma.adminSession.findUnique({ where: { id: sid } })
  if (!session) return { sessionId: null, label: null }
  return { sessionId: session.id, label: session.label }
}
