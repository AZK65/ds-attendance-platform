import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import JSZip from 'jszip'
import { prisma } from '@/lib/db'
import { PAPER_EXAM_DIR, paperExamLast10 } from '@/lib/paper-exam'
import { buildMarkedPaperExamPage } from '@/lib/paper-exam-marking'
import { paperExamResultIsVerified } from '@/lib/paper-exam-result'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safePart(value: string | null | undefined, fallback: string) {
  return (value || fallback)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback
}

function safeStoredPath(filePath: string) {
  const root = path.resolve(PAPER_EXAM_DIR)
  const resolved = path.resolve(filePath)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error('Invalid exam page path')
  return resolved
}

function csvCell(value: unknown) {
  const content = value === null || value === undefined ? '' : String(value)
  return `"${content.replaceAll('"', '""')}"`
}

function originalExtension(filename: string | null, mimetype: string) {
  const extension = path.extname(filename || '')
  if (extension) return extension.toLowerCase()
  if (mimetype === 'application/pdf') return '.pdf'
  if (mimetype.includes('png')) return '.png'
  if (mimetype.includes('webp')) return '.webp'
  return '.jpg'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params
    const decodedGroupId = decodeURIComponent(groupId)
    const sessionId = request.nextUrl.searchParams.get('sessionId')
    if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })

    const session = await prisma.paperExamSession.findFirst({
      where: { id: sessionId, groupId: decodedGroupId },
      include: {
        submissions: {
          include: { pages: { orderBy: { pageNumber: 'asc' } } },
          orderBy: { studentName: 'asc' },
        },
      },
    })
    if (!session) return NextResponse.json({ error: 'Exam session not found' }, { status: 404 })

    const members = await prisma.groupMember.findMany({
      where: { groupId: decodedGroupId, isAdmin: false, isSuperAdmin: false },
      include: { contact: { select: { name: true, pushName: true } } },
      orderBy: { createdAt: 'asc' },
    })
    const submittedPhones = new Set(session.submissions.map(item => paperExamLast10(item.phone)))
    const missing = members.filter(member => !submittedPhones.has(paperExamLast10(member.phone)))
    const passed = session.submissions.filter(item => item.passed === true).length
    const failed = session.submissions.filter(item => item.passed === false).length
    const zip = new JSZip()

    for (const submission of session.submissions) {
      const studentFolder = zip.folder(safePart(submission.studentName, 'student'))!
      const verified = paperExamResultIsVerified(submission.extractedAnswers)
      for (const page of submission.pages) {
        if (page.mimetype.startsWith('image/') && submission.score !== null && submission.totalQuestions !== null) {
          const marked = await buildMarkedPaperExamPage(page.id)
          studentFolder.file(marked.filename, marked.bytes)
        } else {
          const extension = originalExtension(page.filename, page.mimetype)
          studentFolder.file(`page-${page.pageNumber}${extension}`, await fs.readFile(safeStoredPath(page.filePath)))
        }
      }
      studentFolder.file('grade.txt', [
        `Student: ${submission.studentName}`,
        `Phone: ${submission.phone}`,
        `Exam: ${session.title}`,
        `Grade: ${submission.score === null || submission.totalQuestions === null ? 'Not graded' : `${submission.score}/${submission.totalQuestions}`}`,
        `Result: ${submission.passed === null ? 'Pending' : submission.passed ? 'PASS' : 'NOT PASSED'}`,
        `Staff verified: ${verified ? 'Yes' : 'No'}`,
      ].join('\n'))
    }

    const summaryRows = [
      ['Student', 'Phone', 'Score', 'Total', 'Percentage', 'Result', 'Staff verified', 'Received'],
      ...session.submissions.map(submission => [
        submission.studentName,
        submission.phone,
        submission.score,
        submission.totalQuestions,
        submission.score !== null && submission.totalQuestions ? Math.round((submission.score / submission.totalQuestions) * 100) : '',
        submission.passed === null ? 'Pending' : submission.passed ? 'Passed' : 'Not passed',
        paperExamResultIsVerified(submission.extractedAnswers) ? 'Yes' : 'No',
        submission.receivedAt.toISOString(),
      ]),
    ]
    zip.file('grade-overview.csv', `\uFEFF${summaryRows.map(row => row.map(csvCell).join(',')).join('\n')}`)
    zip.file('missing-students.csv', `\uFEFF${[
      ['Student', 'Phone'],
      ...missing.map(member => [member.contact.name || member.contact.pushName || member.phone, member.phone]),
    ].map(row => row.map(csvCell).join(',')).join('\n')}`)
    zip.file('overview.txt', [
      `Group: ${session.groupName}`,
      `Exam: ${session.title}`,
      `Date: ${session.startedAt.toLocaleDateString('en-CA')}`,
      '',
      `Students: ${members.length}`,
      `Submitted: ${session.submissions.length}`,
      `Missing: ${missing.length}`,
      `Passed: ${passed}`,
      `Failed: ${failed}`,
      `Awaiting review: ${session.submissions.length - passed - failed}`,
    ].join('\n'))

    const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    const filename = `${safePart(session.groupName, 'group')}-${safePart(session.title, 'exam')}-all-exams.zip`
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/zip',
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('[PaperExam download all] Failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not download all exams' }, { status: 500 })
  }
}
