import { prisma } from './db'
import { namesEqual } from './student-match'
import {
  normalizeNorthAmericanPhone,
  phoneContactIds,
  phoneJid,
  samePhone,
  type NormalizedPhone,
} from './phone-normalize'

export class PhoneChangeError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export interface RosterStudent {
  student_id: number
  full_name: string
  phone_number: string
}

export interface RosterGateway {
  updatePhone(studentId: number, phoneNumber: string): Promise<void>
  findByPhone(phone: string): Promise<RosterStudent[]>
  getById(studentId: number): Promise<RosterStudent | null>
}

export interface PhoneChangeSubject {
  oldPhone?: string | null
  newPhone: string
  externalStudentId?: number | null
  localStudentId?: string | null
  contactId?: string | null
  name?: string | null
  whatsappJid?: string | null
}

export interface PhoneChangeActor {
  sessionId: string | null
  label: string | null
}

export interface WhatsAppCheckSnapshot {
  status: 'registered' | 'not_registered' | 'unavailable'
  jid?: string | null
  detail: string
}

export interface PhoneDuplicate {
  kind: 'roster' | 'student' | 'contact'
  id: string
  name: string | null
  phone: string
}

export interface PersonGroup {
  id: string
  name: string
}

export interface RecordTouch {
  store: string
  id: string
  detail?: string
}

export interface PhoneChangeRecords {
  updated: RecordTouch[]
  created: RecordTouch[]
  kept: RecordTouch[]
  skipped: RecordTouch[]
  leftUntouched: string[]
  rosterNote: string | null
}

const LEFT_UNTOUCHED = [
  'GroupMember',
  'AttendanceRecord',
  'Invoice',
  'Certificate',
  'ClassSignature',
  'StudentRegistration',
  'Rsep1ResultSheet',
  'ExamAttempt',
  'PaperExamSubmission',
  'TheoryAttendance',
  'MessageLog',
]

export interface PhoneChangePreview {
  sameNumber: boolean
  normalized: NormalizedPhone
  oldPhone: NormalizedPhone
  duplicates: PhoneDuplicate[]
  groups: PersonGroup[]
  rosterChecked: boolean
}

export interface PhoneChangeResult {
  logId: string
  oldPhone: string
  newPhone: string
  display: string
  records: PhoneChangeRecords
  duplicates: PhoneDuplicate[]
  groups: PersonGroup[]
  whatsapp: WhatsAppCheckSnapshot | null
}

function whatsappRegisteredFlag(check: WhatsAppCheckSnapshot | null | undefined): boolean | null {
  if (!check || check.status === 'unavailable') return null
  return check.status === 'registered'
}

async function resolveOldPhone(input: PhoneChangeSubject): Promise<NormalizedPhone> {
  const fromInput = normalizeNorthAmericanPhone(input.oldPhone)
  if (fromInput) return fromInput
  if (input.contactId) {
    const contact = await prisma.contact.findUnique({ where: { id: input.contactId } })
    const parsed = normalizeNorthAmericanPhone(contact?.phone) || normalizeNorthAmericanPhone(contact?.id)
    if (parsed) return parsed
  }
  if (input.oldPhone?.trim()) {
    throw new PhoneChangeError('The current number is not a North American phone number.')
  }
  throw new PhoneChangeError('This contact has no North American phone number saved.')
}

async function contactsMatching(phone: NormalizedPhone) {
  const ids = phoneContactIds(phone.digits)
  const rows = await prisma.contact.findMany({
    where: {
      OR: [
        { id: { in: ids } },
        { phone: { contains: phone.last10 } },
        { id: { contains: phone.last10 } },
      ],
    },
    select: { id: true, phone: true, name: true, pushName: true },
  })
  return rows.filter(row =>
    ids.includes(row.id) || samePhone(row.phone, phone.digits) || samePhone(row.id, phone.digits)
  )
}

async function studentsMatching(phone: NormalizedPhone) {
  const rows = await prisma.student.findMany({
    select: { id: true, name: true, phone: true, phoneAlt: true },
  })
  return rows.filter(row => samePhone(row.phone, phone.digits) || samePhone(row.phoneAlt, phone.digits))
}

export async function listGroupsForPhone(oldPhone: string, contactId?: string | null): Promise<PersonGroup[]> {
  const old = normalizeNorthAmericanPhone(oldPhone)
  if (!old) return []
  const members = await prisma.groupMember.findMany({
    where: {
      OR: [
        { phone: { contains: old.last10 } },
        { contactId: { contains: old.last10 } },
        ...(contactId ? [{ contactId }] : []),
      ],
    },
    include: { group: { select: { id: true, name: true } } },
  })
  const groups = new Map<string, PersonGroup>()
  for (const member of members) {
    const hit = member.contactId === contactId
      || samePhone(member.phone, old.digits)
      || samePhone(member.contactId, old.digits)
    if (!hit) continue
    groups.set(member.group.id, { id: member.group.id, name: member.group.name })
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}

async function safeRosterByPhone(roster: RosterGateway, phone: string): Promise<{ students: RosterStudent[]; unavailable: boolean }> {
  try {
    return { students: await roster.findByPhone(phone), unavailable: false }
  } catch (error) {
    console.error('[phone-change] roster lookup failed:', error)
    return { students: [], unavailable: true }
  }
}

export async function previewPhoneChange(
  input: PhoneChangeSubject,
  roster: RosterGateway,
): Promise<PhoneChangePreview> {
  const next = normalizeNorthAmericanPhone(input.newPhone)
  if (!next) {
    throw new PhoneChangeError('Enter a North American number, such as 514-546-0150 or 15145460150.')
  }
  const old = await resolveOldPhone(input)
  const groups = await listGroupsForPhone(old.digits, input.contactId)
  if (old.last10 === next.last10) {
    return { sameNumber: true, normalized: next, oldPhone: old, duplicates: [], groups, rosterChecked: true }
  }

  const [rosterResult, ownStudents, ownContacts, otherStudents, otherContacts] = await Promise.all([
    safeRosterByPhone(roster, next.digits),
    studentsMatching(old),
    contactsMatching(old),
    studentsMatching(next),
    contactsMatching(next),
  ])

  const ownStudentIds = new Set(ownStudents.map(student => student.id))
  if (input.localStudentId) ownStudentIds.add(input.localStudentId)
  const ownContactIds = new Set(ownContacts.map(contact => contact.id))
  if (input.contactId) ownContactIds.add(input.contactId)

  let ownRosterIds = new Set<number>()
  if (input.externalStudentId) ownRosterIds.add(input.externalStudentId)
  if (!rosterResult.unavailable) {
    const oldRoster = await safeRosterByPhone(roster, old.digits)
    for (const student of oldRoster.students) ownRosterIds.add(student.student_id)
  }

  const duplicates: PhoneDuplicate[] = []
  for (const student of rosterResult.students) {
    if (ownRosterIds.has(student.student_id)) continue
    duplicates.push({
      kind: 'roster',
      id: String(student.student_id),
      name: student.full_name || null,
      phone: student.phone_number,
    })
  }
  for (const student of otherStudents) {
    if (ownStudentIds.has(student.id)) continue
    if (input.name && student.name && namesEqual(input.name, student.name)) continue
    duplicates.push({
      kind: 'student',
      id: student.id,
      name: student.name || null,
      phone: student.phone || student.phoneAlt || next.digits,
    })
  }
  for (const contact of otherContacts) {
    if (ownContactIds.has(contact.id)) continue
    duplicates.push({
      kind: 'contact',
      id: contact.id,
      name: contact.name || contact.pushName || null,
      phone: contact.phone || contact.id,
    })
  }

  return {
    sameNumber: false,
    normalized: next,
    oldPhone: old,
    duplicates,
    groups,
    rosterChecked: !rosterResult.unavailable,
  }
}

function replacePhoneList(json: string, old: NormalizedPhone, nextDigits: string): { changed: boolean; value: string } {
  let phones: unknown
  try {
    phones = JSON.parse(json)
  } catch {
    return { changed: false, value: json }
  }
  if (!Array.isArray(phones)) return { changed: false, value: json }
  let changed = false
  const nextList = phones.map(item => {
    if (typeof item === 'string' && samePhone(item, old.digits)) {
      changed = true
      return nextDigits
    }
    return item
  })
  return { changed, value: JSON.stringify(nextList) }
}

function isExtraJid(jid: string | null | undefined, canonicalJid: string): jid is string {
  if (!jid || jid === canonicalJid) return false
  return /@(c\.us|s\.whatsapp\.net|lid)$/.test(jid)
}

export async function applyPhoneChange(
  input: PhoneChangeSubject,
  actor: PhoneChangeActor,
  roster: RosterGateway,
  whatsapp?: WhatsAppCheckSnapshot | null,
): Promise<PhoneChangeResult> {
  const preview = await previewPhoneChange(input, roster)
  if (preview.sameNumber) {
    throw new PhoneChangeError('That is already the number on file.')
  }
  const old = preview.oldPhone
  const next = preview.normalized

  let rosterStudent: RosterStudent | null = null
  let rosterNote: string | null = null
  if (input.externalStudentId) {
    try {
      rosterStudent = await roster.getById(input.externalStudentId)
    } catch (error) {
      console.error('[phone-change] roster read failed:', error)
      throw new PhoneChangeError('The master roster could not be reached, so the number was not changed.', 502)
    }
    if (!rosterStudent) {
      throw new PhoneChangeError('That student is not on the master roster.', 404)
    }
  } else {
    try {
      const matches = await roster.findByPhone(old.digits)
      if (matches.length === 1) rosterStudent = matches[0]
      else if (matches.length > 1) {
        rosterNote = 'Several roster students share the old number, so the roster was left unchanged.'
      }
    } catch (error) {
      console.error('[phone-change] roster lookup failed:', error)
      rosterNote = 'The master roster could not be reached. The app records were still updated.'
    }
  }

  const previousRosterPhone = rosterStudent?.phone_number ?? null
  if (rosterStudent) {
    try {
      await roster.updatePhone(rosterStudent.student_id, next.digits)
    } catch (error) {
      console.error('[phone-change] roster update failed:', error)
      throw new PhoneChangeError('The master roster could not be updated, so nothing else was changed.', 502)
    }
  }

  const displayName = (input.name || rosterStudent?.full_name || '').trim() || null
  const extraJid = isExtraJid(input.whatsappJid || whatsapp?.jid, phoneJid(next.digits))
    ? (input.whatsappJid || whatsapp?.jid || null)
    : null

  try {
    const written = await prisma.$transaction(async (tx) => {
      const records: PhoneChangeRecords = {
        updated: [],
        created: [],
        kept: [],
        skipped: [],
        leftUntouched: LEFT_UNTOUCHED,
        rosterNote,
      }
      if (rosterStudent) {
        records.updated.push({
          store: 'roster',
          id: String(rosterStudent.student_id),
          detail: rosterStudent.full_name || undefined,
        })
      }

      const oldContacts = await tx.contact.findMany({
        where: {
          OR: [
            { id: { in: phoneContactIds(old.digits) } },
            { phone: { contains: old.last10 } },
            { id: { contains: old.last10 } },
            ...(input.contactId ? [{ id: input.contactId }] : []),
          ],
        },
      })
      const keptContacts = oldContacts.filter(contact =>
        contact.id === input.contactId
        || samePhone(contact.phone, old.digits)
        || samePhone(contact.id, old.digits)
        || phoneContactIds(old.digits).includes(contact.id)
      )
      for (const contact of keptContacts) {
        records.kept.push({ store: 'contact', id: contact.id, detail: 'Old WhatsApp contact kept' })
      }

      const nameFromContact = keptContacts.find(contact => contact.id === input.contactId)?.name
        || keptContacts.find(contact => contact.name)?.name
        || keptContacts.find(contact => contact.pushName)?.pushName
        || null
      const contactName = displayName || nameFromContact
      const pushName = keptContacts.find(contact => contact.pushName)?.pushName ?? null

      const newId = phoneJid(next.digits)
      const existingNew = await tx.contact.findUnique({ where: { id: newId } })
      if (!existingNew) {
        await tx.contact.create({
          data: { id: newId, phone: next.digits, name: contactName, pushName },
        })
        records.created.push({ store: 'contact', id: newId, detail: 'New WhatsApp contact' })
      } else {
        const data: { phone?: string; name?: string } = {}
        if (!samePhone(existingNew.phone, next.digits)) data.phone = next.digits
        if (!existingNew.name && contactName) data.name = contactName
        if (Object.keys(data).length > 0) {
          await tx.contact.update({ where: { id: newId }, data })
          records.updated.push({ store: 'contact', id: newId, detail: 'Existing contact already had this number' })
        } else {
          records.kept.push({ store: 'contact', id: newId, detail: 'Existing contact already had this number' })
        }
      }

      if (extraJid) {
        const extra = await tx.contact.findUnique({ where: { id: extraJid } })
        if (!extra) {
          await tx.contact.create({
            data: { id: extraJid, phone: next.digits, name: contactName, pushName },
          })
          records.created.push({ store: 'contact', id: extraJid, detail: 'WhatsApp id from the registration check' })
        } else {
          records.kept.push({ store: 'contact', id: extraJid, detail: 'WhatsApp id already on file' })
        }
      }

      const localRows = await tx.student.findMany({
        select: { id: true, name: true, phone: true, phoneAlt: true },
      })
      const updatedStudentIds: string[] = []
      for (const student of localRows) {
        const phoneHit = samePhone(student.phone, old.digits)
        const altHit = samePhone(student.phoneAlt, old.digits)
        const linked = input.localStudentId != null && student.id === input.localStudentId
        if (!phoneHit && !altHit && !linked) continue
        const differentPerson = !linked
          && (phoneHit || altHit)
          && !!displayName
          && !!student.name
          && !namesEqual(displayName, student.name)
        if (differentPerson) {
          records.skipped.push({
            store: 'student',
            id: student.id,
            detail: `Left ${student.name} alone — same old number, different name`,
          })
          continue
        }
        const data: { phone?: string; phoneAlt?: string | null } = {}
        if (phoneHit || (linked && (!student.phone || samePhone(student.phone, old.digits)))) {
          data.phone = next.digits
        }
        if (altHit) data.phoneAlt = next.digits
        if (Object.keys(data).length === 0) {
          records.skipped.push({ store: 'student', id: student.id, detail: 'Linked record uses a different number' })
          continue
        }
        await tx.student.update({ where: { id: student.id }, data })
        updatedStudentIds.push(student.id)
        records.updated.push({ store: 'student', id: student.id, detail: student.name })
      }

      if (updatedStudentIds.length > 0) {
        const verifications = await tx.bookingVerification.findMany({
          where: { studentId: { in: updatedStudentIds } },
          select: { id: true, phone: true },
        })
        for (const verification of verifications) {
          if (!samePhone(verification.phone, old.digits)) continue
          await tx.bookingVerification.update({
            where: { id: verification.id },
            data: { phone: next.digits },
          })
          records.updated.push({ store: 'bookingVerification', id: verification.id })
        }
      }

      const pending = await tx.scheduledMessage.findMany({
        where: { status: 'pending' },
        select: { id: true, memberPhones: true },
      })
      for (const message of pending) {
        if (!message.memberPhones.includes(old.last10)) continue
        const replaced = replacePhoneList(message.memberPhones, old, next.digits)
        if (!replaced.changed) continue
        await tx.scheduledMessage.update({
          where: { id: message.id },
          data: { memberPhones: replaced.value },
        })
        records.updated.push({ store: 'scheduledMessage', id: message.id, detail: 'Pending reminder' })
      }

      const members = await tx.groupMember.findMany({
        where: {
          OR: [
            { phone: { contains: old.last10 } },
            ...(input.contactId ? [{ contactId: input.contactId }] : []),
          ],
        },
        select: { id: true, phone: true, contactId: true, groupId: true },
      })
      for (const member of members) {
        if (member.contactId !== input.contactId && !samePhone(member.phone, old.digits) && !samePhone(member.contactId, old.digits)) {
          continue
        }
        records.kept.push({
          store: 'groupMember',
          id: member.id,
          detail: member.groupId,
        })
      }

      const primaryLocalId = input.localStudentId && updatedStudentIds.includes(input.localStudentId)
        ? input.localStudentId
        : updatedStudentIds[0] ?? input.localStudentId ?? null

      const log = await tx.phoneChangeLog.create({
        data: {
          oldPhone: old.digits,
          newPhone: next.digits,
          actorSessionId: actor.sessionId,
          actorLabel: actor.label || 'Staff',
          externalStudentId: rosterStudent?.student_id ?? input.externalStudentId ?? null,
          localStudentId: primaryLocalId,
          contactId: input.contactId ?? keptContacts[0]?.id ?? null,
          studentName: contactName,
          recordsUpdated: JSON.stringify(records),
          whatsappRegistered: whatsappRegisteredFlag(whatsapp),
          whatsappDetail: whatsapp?.detail ?? null,
          duplicateWarning: preview.duplicates.length > 0 ? JSON.stringify(preview.duplicates) : null,
          groupAction: 'none',
        },
      })

      return { records, logId: log.id, primaryLocalId }
    })

    return {
      logId: written.logId,
      oldPhone: old.digits,
      newPhone: next.digits,
      display: next.display,
      records: written.records,
      duplicates: preview.duplicates,
      groups: preview.groups,
      whatsapp: whatsapp ?? null,
    }
  } catch (error) {
    if (rosterStudent && previousRosterPhone != null) {
      await roster.updatePhone(rosterStudent.student_id, previousRosterPhone).catch(revertError => {
        console.error('[phone-change] roster revert failed:', revertError)
      })
    }
    throw error
  }
}

export async function listPhoneChanges(query: {
  externalStudentId?: number | null
  localStudentId?: string | null
  contactId?: string | null
  phone?: string | null
}) {
  const ors: Array<Record<string, unknown>> = []
  if (query.externalStudentId) ors.push({ externalStudentId: query.externalStudentId })
  if (query.localStudentId) ors.push({ localStudentId: query.localStudentId })
  if (query.contactId) ors.push({ contactId: query.contactId })
  const phone = normalizeNorthAmericanPhone(query.phone)
  if (phone) {
    ors.push({ oldPhone: { contains: phone.last10 } })
    ors.push({ newPhone: { contains: phone.last10 } })
  }
  if (ors.length === 0) return []
  const rows = await prisma.phoneChangeLog.findMany({
    where: { OR: ors },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  if (!phone) return rows
  return rows.filter(row =>
    row.externalStudentId === query.externalStudentId
    || (query.localStudentId != null && row.localStudentId === query.localStudentId)
    || (query.contactId != null && row.contactId === query.contactId)
    || samePhone(row.oldPhone, phone.digits)
    || samePhone(row.newPhone, phone.digits)
  )
}

export async function recordGroupAction(
  logId: string,
  action: 'invite' | 'direct_add',
  detail: unknown,
) {
  return prisma.phoneChangeLog.update({
    where: { id: logId },
    data: {
      groupAction: action,
      groupActionDetail: JSON.stringify(detail),
    },
  })
}
