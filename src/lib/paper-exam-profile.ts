import { prisma } from '@/lib/db'

function phoneSuffix(value: string | null | undefined) {
  return (value || '').replace(/\D/g, '').slice(-10)
}

export async function findStudentPaperExams(input: {
  phone?: string | null
  name?: string | null
  contactId?: string | null
}) {
  const phone = phoneSuffix(input.phone)
  const cleanName = (input.name || '').replace(/\s*#\d+\s*/g, ' ').replace(/\s+/g, ' ').trim()
  const conditions = [
    ...(input.contactId ? [{ contactId: input.contactId }] : []),
    ...(phone.length >= 7 ? [{ phone: { contains: phone } }] : []),
    ...(!input.contactId && phone.length < 7 && cleanName.length >= 2
      ? [{ studentName: { contains: cleanName } }]
      : []),
  ]
  if (conditions.length === 0) return []

  const submissions = await prisma.paperExamSubmission.findMany({
    where: { OR: conditions },
    include: {
      session: { select: { title: true, groupId: true, groupName: true, passingScore: true } },
      pages: { orderBy: { pageNumber: 'asc' } },
    },
    orderBy: { receivedAt: 'desc' },
  })

  return submissions.map(submission => ({
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
    receivedAt: submission.receivedAt,
    pages: submission.pages.map(page => ({
      id: page.id,
      pageNumber: page.pageNumber,
      mimetype: page.mimetype,
      filename: page.filename,
      url: `/api/paper-exams/pages/${encodeURIComponent(page.id)}`,
    })),
  }))
}
