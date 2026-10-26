import { prisma } from '@/lib/db'
import { invoiceBelongsToStudent, type StudentIdentity } from '@/lib/invoice-match'

// Phones are stored with spaces, dashes, and country codes. A SQL `contains`
// on the raw last-10 digits misses those rows and also matches a different
// student whose name merely contains this one. Load the rows and compare
// the normalized identity in memory.

export async function findInvoicesForStudent(student: StudentIdentity) {
  const invoices = await prisma.invoice.findMany()
  return invoices
    .filter((invoice) => invoiceBelongsToStudent(invoice, student))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export async function findExamAttemptsForStudent(student: StudentIdentity) {
  const attempts = await prisma.examAttempt.findMany({
    include: { exam: { select: { code: true, groupName: true } } },
    orderBy: { startedAt: 'desc' },
  })
  // Exam attempts have no MySQL student id. The id on the student is ignored
  // unless the attempt itself carries one, so this falls through to phone,
  // then exact name only when there is no phone.
  return attempts.filter((attempt) => invoiceBelongsToStudent({
    studentPhone: attempt.studentPhone,
    studentName: attempt.studentName,
  }, student))
}
