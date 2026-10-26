import { prisma } from '@/lib/db'
import { invoiceBelongsToStudent } from '@/lib/invoice-match'
import { paperExamResultIsVerified } from '@/lib/paper-exam-result'

export async function findStudentPaperExams(input: {
  phone?: string | null
  name?: string | null
  contactId?: string | null
  externalStudentId?: number | null
}) {
  // Phones are stored formatted, so last-10 equality is applied in memory.
  // A contact id is an exact WhatsApp identity. Name matches only when no
  // phone is present, and never as a substring.
  const submissions = await prisma.paperExamSubmission.findMany({
    include: {
      session: { select: { title: true, groupId: true, groupName: true, passingScore: true } },
      pages: { orderBy: { pageNumber: 'asc' } },
    },
    orderBy: { receivedAt: 'desc' },
  })
  const matched = submissions.filter((submission) => {
    if (input.contactId && submission.contactId === input.contactId) return true
    return invoiceBelongsToStudent(
      { studentPhone: submission.phone, studentName: submission.studentName },
      input,
    )
  })

  return matched.map(submission => ({
    id: submission.id,
    title: submission.session.title,
    groupId: submission.session.groupId,
    groupName: submission.session.groupName,
    status: submission.status,
    score: submission.score,
    totalQuestions: submission.totalQuestions,
    passingScore: submission.session.passingScore,
    passed: submission.passed,
    confidence: submission.confidence,
    error: submission.error,
    verified: paperExamResultIsVerified(submission.extractedAnswers),
    receivedAt: submission.receivedAt,
    originalDownloadUrl: `/api/paper-exams/submissions/${encodeURIComponent(submission.id)}?variant=original`,
    markedDownloadUrl: `/api/paper-exams/submissions/${encodeURIComponent(submission.id)}?variant=marked`,
    pages: submission.pages.map(page => ({
      id: page.id,
      pageNumber: page.pageNumber,
      mimetype: page.mimetype,
      filename: page.filename,
      url: `/api/paper-exams/pages/${encodeURIComponent(page.id)}`,
      markedUrl: `/api/paper-exams/pages/${encodeURIComponent(page.id)}?annotated=1`,
    })),
  }))
}
