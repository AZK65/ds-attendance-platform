import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db'
import { editStudentProfile, getStudentById, type StudentRecord } from '@/lib/external-db'
import { findBestLocalStudent } from '@/lib/local-student-lookup'
import { profileFields, validateProfileFields } from '@/lib/student-profile-fields'

export function profileRevision(student: StudentRecord, local: { id: string; updatedAt: Date | string } | null) {
  return createHash('sha256').update(JSON.stringify({ id: student.student_id, phone: student.phone_number,
    fields: profileFields(student as unknown as Record<string, unknown>), local: local ? { id: local.id, updatedAt: local.updatedAt } : null })).digest('hex')
}

export async function loadEditableProfile(id: number, getStudent = getStudentById) {
  const student = await getStudent(id)
  if (!student) return null
  const local = await findBestLocalStudent({ phone: student.phone_number, name: student.full_name })
  const digits = (student.phone_number || '').replace(/\D/g, '').slice(-10)
  const member = digits.length === 10 ? await prisma.groupMember.findFirst({
    where: { phone: { contains: digits } }, include: { contact: true },
  }) : null
  return { fields: { ...profileFields(student as unknown as Record<string, unknown>), apartment: local?.apartment ?? '', email: local?.email ?? student.email ?? '' },
    phone: student.phone_number, contractNumber: student.contract_number, revision: profileRevision(student, local),
    chat: member ? { groupId: member.groupId, contactId: member.contactId, name: member.contact?.name || member.contact?.pushName || '' } : null }
}

export async function saveEditableProfile(id: number, input: unknown, revision: string, actor: string, rosterEdit = editStudentProfile) {
  const fields = validateProfileFields(input)
  return rosterEdit(id, async (student, save) => {
    const local = await findBestLocalStudent({ phone: student.phone_number, name: student.full_name })
    if (revision !== profileRevision(student, local)) throw new Error('Profile changed. Reload the profile before saving.')
    // A changed permit must not steal another student's certificate record.
    if (fields.permit_number) {
      const owner = await prisma.student.findUnique({ where: { licenceNumber: fields.permit_number } })
      if (owner && owner.id !== local?.id) throw new Error('This permit belongs to another student. Check the permit number.')
    }
    const mirror = {
      name: fields.full_name, email: fields.email || null, licenceNumber: fields.permit_number || null,
      address: fields.full_address || null, apartment: fields.apartment || null, municipality: fields.city || null, postalCode: fields.postal_code || null,
    }
    await prisma.$transaction(async tx => {
      if (local) {
        const updated = await tx.student.updateMany({ where: { id: local.id, updatedAt: local.updatedAt }, data: mirror })
        if (updated.count !== 1) throw new Error('Profile changed. Reload the profile before saving.')
      }
      else await tx.student.create({ data: { ...mirror, phone: student.phone_number || null } })
      await tx.appPreference.create({ data: {
        key: `student-profile-edit:${id}:${randomUUID()}`,
        value: JSON.stringify({ studentId: id, actor, at: new Date().toISOString(), before: student,
          localBefore: local ? { id: local.id, name: local.name, email: local.email, licenceNumber: local.licenceNumber,
            address: local.address, apartment: local.apartment, municipality: local.municipality, postalCode: local.postalCode } : null,
          after: fields }),
      } })
      await save(fields)
    }, { timeout: 15000 })
    return { ok: true }
  })
}
