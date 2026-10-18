import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/lib/db'

export const PAPER_EXAM_DIR = path.join(process.cwd(), 'data', 'paper-exams')

const ALLOWED_MEDIA = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/heic', 'heic'],
  ['image/heif', 'heif'],
  ['application/pdf', 'pdf'],
])

const MAX_EXAM_PAGE_BYTES = 25 * 1024 * 1024

export type PaperExamCaptureResult =
  | { captured: true; sessionId: string; submissionId: string; pageId: string }
  | { captured: false; reason: 'no-active-session' | 'unsupported-media' | 'admin-sender' | 'duplicate' }

interface CaptureInput {
  groupId: string
  senderJid: string
  senderPhone: string
  senderName?: string | null
  messageId: string
  media: {
    data: string
    mimetype: string
    filename?: string
    filesize?: number
  }
}

export async function hasActivePaperExamSession(groupId: string): Promise<boolean> {
  const session = await prisma.paperExamSession.findFirst({
    where: { groupId, status: 'active' },
    select: { id: true },
  })
  return Boolean(session)
}

/** Find the newest active exam belonging to a private WhatsApp sender. */
export async function findActivePaperExamGroupForSender(
  senderPhone: string,
  senderJid: string
): Promise<string | null> {
  const sessions = await prisma.paperExamSession.findMany({
    where: { status: 'active' },
    select: { groupId: true, startedAt: true },
    orderBy: { startedAt: 'desc' },
  })
  if (sessions.length === 0) return null

  const groupIds = [...new Set(sessions.map(session => session.groupId))]
  const members = await prisma.groupMember.findMany({
    where: {
      groupId: { in: groupIds },
      isAdmin: false,
      isSuperAdmin: false,
    },
    select: { groupId: true, contactId: true, phone: true },
  })
  const phoneKey = paperExamLast10(senderPhone)
  const matchingGroups = new Set(
    members
      .filter(member =>
        member.contactId === senderJid ||
        (phoneKey.length === 10 && paperExamLast10(member.phone) === phoneKey)
      )
      .map(member => member.groupId)
  )

  // sessions is newest-first, so a student who happens to belong to two
  // groups with Exam Mode open is assigned to the most recently opened one.
  return sessions.find(session => matchingGroups.has(session.groupId))?.groupId || null
}

export function paperExamLast10(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '').slice(-10)
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
}

/**
 * Persist one exam page received in a WhatsApp group.
 *
 * The WhatsApp message handler calls this only for inbound group media. If no
 * paper-exam collection is active for the group, it is a cheap indexed lookup
 * and returns without downloading/storing anything else.
 */
export async function capturePaperExamMedia(input: CaptureInput): Promise<PaperExamCaptureResult> {
  const session = await prisma.paperExamSession.findFirst({
    where: { groupId: input.groupId, status: 'active' },
    orderBy: { startedAt: 'desc' },
  })
  if (!session) return { captured: false, reason: 'no-active-session' }

  const mimetype = String(input.media.mimetype || '').toLowerCase().split(';')[0].trim()
  const extension = ALLOWED_MEDIA.get(mimetype)
  if (!extension) return { captured: false, reason: 'unsupported-media' }

  const existingPage = await prisma.paperExamPage.findUnique({
    where: { messageId: input.messageId },
    select: { id: true, submissionId: true, submission: { select: { sessionId: true } } },
  })
  if (existingPage) return { captured: false, reason: 'duplicate' }

  const phoneKey = paperExamLast10(input.senderPhone)
  const members = await prisma.groupMember.findMany({
    where: { groupId: input.groupId },
    include: { contact: { select: { name: true, pushName: true } } },
  })
  const member = members.find(candidate =>
    candidate.contactId === input.senderJid ||
    (phoneKey.length === 10 && paperExamLast10(candidate.phone) === phoneKey)
  )

  // Teachers sometimes post the answer sheet or instructions in the same
  // group. Never count an admin's attachment as a student submission.
  if (member?.isAdmin || member?.isSuperAdmin) {
    return { captured: false, reason: 'admin-sender' }
  }

  const normalizedPhone = phoneKey || input.senderPhone.replace(/\D/g, '')
  const studentKey = normalizedPhone || input.senderJid
  const studentName = member?.contact.name || member?.contact.pushName || input.senderName || normalizedPhone || 'Unmatched sender'

  const bytes = Buffer.from(input.media.data, 'base64')
  if (bytes.length === 0 || bytes.length > MAX_EXAM_PAGE_BYTES) {
    throw new Error(bytes.length === 0 ? 'Exam image was empty' : 'Exam image exceeded 25 MB')
  }

  const submission = await prisma.paperExamSubmission.upsert({
    where: { sessionId_studentKey: { sessionId: session.id, studentKey } },
    update: {
      contactId: member?.contactId || undefined,
      senderJid: input.senderJid,
      phone: normalizedPhone,
      studentName,
      status: 'received',
      error: null,
      receivedAt: new Date(),
    },
    create: {
      sessionId: session.id,
      studentKey,
      contactId: member?.contactId || null,
      senderJid: input.senderJid,
      phone: normalizedPhone,
      studentName,
    },
  })

  const pageNumber = await prisma.paperExamPage.count({ where: { submissionId: submission.id } }) + 1
  const directory = path.join(PAPER_EXAM_DIR, safeSegment(session.id), safeSegment(submission.id))
  await fs.mkdir(directory, { recursive: true })
  const storedName = `${String(pageNumber).padStart(2, '0')}-${safeSegment(input.messageId)}.${extension}`
  const absolutePath = path.join(directory, storedName)
  await fs.writeFile(absolutePath, bytes)

  try {
    const page = await prisma.paperExamPage.create({
      data: {
        submissionId: submission.id,
        messageId: input.messageId,
        filePath: absolutePath,
        mimetype,
        filename: input.media.filename || null,
        pageNumber,
      },
    })
    console.log(`[PaperExam] Captured page ${pageNumber} from ${studentName} for ${session.groupName}`)
    return { captured: true, sessionId: session.id, submissionId: submission.id, pageId: page.id }
  } catch (error) {
    await fs.unlink(absolutePath).catch(() => {})
    throw error
  }
}
