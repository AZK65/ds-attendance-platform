import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { prisma } from '@/lib/db'
import {
  buildGradesCsv,
  buildRecheckSummary,
  buildStudentExamPdf,
  formatExamPhone,
  formatExamTimestamp,
  paperExamGradeText,
  type PaperExamSummaryRow,
} from '@/lib/paper-exam-download'
import { paperExamResultIsVerified, parseStoredPaperExamResult } from '@/lib/paper-exam-result'
import { matchPaperExamRoster, paperExamRecheckReason } from '@/lib/paper-exam-roster'

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

function uniquePath(used: Set<string>, filename: string) {
  if (!used.has(filename)) {
    used.add(filename)
    return filename
  }
  const dot = filename.lastIndexOf('.')
  const base = dot > 0 ? filename.slice(0, dot) : filename
  const ext = dot > 0 ? filename.slice(dot) : ''
  let index = 2
  let next = `${base}-${index}${ext}`
  while (used.has(next)) {
    index += 1
    next = `${base}-${index}${ext}`
  }
  used.add(next)
  return next
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
          orderBy: { receivedAt: 'desc' },
        },
      },
    })
    if (!session) return NextResponse.json({ error: 'Exam session not found' }, { status: 404 })

    const members = await prisma.groupMember.findMany({
      where: { groupId: decodedGroupId },
      include: { contact: { select: { name: true, pushName: true } } },
      orderBy: { createdAt: 'asc' },
    })
    const matched = matchPaperExamRoster(members, session.submissions)
    const zip = new JSZip()
    const used = new Set<string>(['grades.csv', 'recheck.txt'])
    const rows: PaperExamSummaryRow[] = []
    const missing: Array<{ name: string; phone: string }> = []
    const recheck: Array<{ name: string; phone: string; reason: string; grade: string }> = []
    const unverified: Array<{ name: string; phone: string; grade: string }> = []

    for (const student of matched.students) {
      const submission = student.submission
      if (!submission) {
        missing.push({ name: student.name, phone: student.phone })
        rows.push({
          name: student.name,
          phone: formatExamPhone(student.phone),
          roster: 'Student',
          status: 'Missing',
          grade: 'No exam',
          result: 'Missing',
          verified: 'No',
          recheck: 'Yes',
          recheckReason: 'No exam photo matched this student',
          pages: 0,
          received: '',
          file: '',
        })
        continue
      }

      const verified = paperExamResultIsVerified(submission.extractedAnswers)
      const stored = parseStoredPaperExamResult(submission.extractedAnswers)
      const uncertain = Array.isArray(stored.uncertain) ? stored.uncertain.filter(value => Number.isInteger(value)) : []
      const variant = verified ? 'marked' : 'original'
      let filename = ''
      let recheckReason = paperExamRecheckReason({
        status: submission.status,
        verified,
        uncertain,
        error: submission.error,
      })
      try {
        const pdf = await buildStudentExamPdf({ ...submission, session }, variant)
        recheckReason = pdf.recheckReason
        filename = uniquePath(used, pdf.filename)
        zip.file(filename, pdf.bytes)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not build this exam PDF'
        filename = uniquePath(used, `${safePart(student.name, 'student')}-FAILED.txt`)
        zip.file(filename, `${student.name}\n${message}\n`)
        recheckReason = recheckReason || message
      }

      const grade = paperExamGradeText(submission)
      if (recheckReason) recheck.push({ name: student.name, phone: student.phone, reason: recheckReason, grade })
      else if (!verified && submission.score !== null) unverified.push({ name: student.name, phone: student.phone, grade })

      rows.push({
        name: student.name,
        phone: formatExamPhone(student.phone),
        roster: 'Student',
        status: submission.status,
        grade,
        result: submission.passed === true ? 'Passed' : submission.passed === false ? 'Not passed' : 'Not confirmed',
        verified: verified ? 'Yes' : 'No',
        recheck: recheckReason ? 'Yes' : 'No',
        recheckReason: recheckReason || '',
        pages: submission.pages.length,
        received: formatExamTimestamp(submission.receivedAt),
        file: filename,
      })
    }

    const unmatchedSummary: Array<{ name: string; phone: string; pages: number }> = []
    for (const submission of matched.unmatched) {
      const verified = paperExamResultIsVerified(submission.extractedAnswers)
      let filename = ''
      try {
        const pdf = await buildStudentExamPdf({ ...submission, session }, verified ? 'marked' : 'original')
        filename = uniquePath(used, `unmatched/${pdf.filename}`)
        zip.file(filename, pdf.bytes)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not build this exam PDF'
        filename = uniquePath(used, `unmatched/${safePart(submission.studentName, 'student')}-FAILED.txt`)
        zip.file(filename, `${submission.studentName}\n${message}\n`)
      }
      unmatchedSummary.push({
        name: submission.studentName,
        phone: submission.phone,
        pages: submission.pages.length,
      })
      rows.push({
        name: submission.studentName,
        phone: formatExamPhone(submission.phone),
        roster: 'Unmatched photo',
        status: submission.status,
        grade: paperExamGradeText(submission),
        result: 'Unmatched',
        verified: verified ? 'Yes' : 'No',
        recheck: 'Yes',
        recheckReason: 'Saved exam did not match a current roster student',
        pages: submission.pages.length,
        received: formatExamTimestamp(submission.receivedAt),
        file: filename,
      })
    }

    const generatedAt = new Date()
    zip.file('grades.csv', buildGradesCsv(rows))
    zip.file('recheck.txt', buildRecheckSummary({
      groupName: session.groupName,
      examTitle: session.title,
      generatedAt,
      missing,
      recheck,
      unverified,
      unmatched: unmatchedSummary,
    }))

    const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    const filename = `${safePart(session.groupName, 'group')}-${safePart(session.title, 'exam')}-exams.zip`
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/zip',
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('[PaperExam download] Failed:', error)
    const message = error instanceof Error ? error.message : 'Could not download exams'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
