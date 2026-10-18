import { prisma } from '@/lib/db'
import { paperExamResultIsVerified } from '@/lib/paper-exam-result'
import { sendBotReply } from '@/lib/whatsapp/client'

export interface PaperExamResultNotification {
  sent: boolean
  alreadySent: boolean
  notifiedAt: Date | null
}

function percentage(score: number, total: number) {
  if (total <= 0) return 0
  return Math.round((score / total) * 100)
}

export function formatPaperExamStudentName(value: string) {
  const name = value.trim()
  if (!name) return 'there'
  const letters = name.replace(/[^\p{L}]/gu, '')
  if (!letters || letters !== letters.toLocaleUpperCase('en-CA')) return name
  return name
    .toLocaleLowerCase('en-CA')
    .replace(/(^|[\s,'’.-])\p{L}/gu, match => match.toLocaleUpperCase('en-CA'))
}

export function buildPaperExamResultMessage(input: {
  studentName: string
  examTitle: string
  score: number
  totalQuestions: number
  passed: boolean
}) {
  const name = formatPaperExamStudentName(input.studentName)
  const grade = `${input.score}/${input.totalQuestions} (${percentage(input.score, input.totalQuestions)}%)`

  if (input.passed) {
    return [
      `Hi ${name}!`,
      '',
      `🎉 You passed your ${input.examTitle}!`,
      `Grade: ${grade}`,
      '',
      'Your certificate will be ready for pickup on Wednesday or any day after.',
      '',
      'Congratulations! 🎊',
    ].join('\n')
  }

  return [
    `Hi ${name}!`,
    '',
    `❌ You did not pass your ${input.examTitle} this time.`,
    `Grade: ${grade}`,
    '',
    'Our team will call you to arrange a time to redo the exam.',
  ].join('\n')
}

export async function notifyPaperExamResult(submissionId: string): Promise<PaperExamResultNotification> {
  const submission = await prisma.paperExamSubmission.findUnique({
    where: { id: submissionId },
    include: { session: { select: { title: true } } },
  })
  if (!submission) throw new Error('Exam submission not found')
  if (!paperExamResultIsVerified(submission.extractedAnswers)) {
    throw new Error('The exam grade must be verified before sending the result')
  }
  if (submission.score === null || submission.totalQuestions === null || submission.passed === null) {
    throw new Error('The verified exam does not have a complete grade')
  }
  if (submission.resultNotifiedAt) {
    return { sent: false, alreadySent: true, notifiedAt: submission.resultNotifiedAt }
  }

  // Claim the notification before sending so two verification requests cannot
  // deliver the same result twice. A failed send releases the claim for retry.
  const claimedAt = new Date()
  const claim = await prisma.paperExamSubmission.updateMany({
    where: { id: submission.id, resultNotifiedAt: null },
    data: { resultNotifiedAt: claimedAt, resultNotifyError: null },
  })
  if (claim.count === 0) {
    const current = await prisma.paperExamSubmission.findUnique({
      where: { id: submission.id },
      select: { resultNotifiedAt: true },
    })
    return { sent: false, alreadySent: true, notifiedAt: current?.resultNotifiedAt || null }
  }

  const message = buildPaperExamResultMessage({
    studentName: submission.studentName,
    examTitle: submission.session.title,
    score: submission.score,
    totalQuestions: submission.totalQuestions,
    passed: submission.passed,
  })

  try {
    await sendBotReply(submission.senderJid, message, submission.phone)
    await prisma.messageLog.create({
      data: {
        type: 'paper-exam-result',
        to: submission.senderJid,
        toName: submission.studentName,
        message: message.slice(0, 500),
        status: 'sent',
      },
    }).catch(() => {})
    return { sent: true, alreadySent: false, notifiedAt: claimedAt }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'WhatsApp result could not be sent'
    await prisma.paperExamSubmission.update({
      where: { id: submission.id },
      data: { resultNotifiedAt: null, resultNotifyError: errorMessage.slice(0, 1000) },
    })
    await prisma.messageLog.create({
      data: {
        type: 'paper-exam-result',
        to: submission.senderJid,
        toName: submission.studentName,
        message: message.slice(0, 500),
        status: 'failed',
        error: errorMessage.slice(0, 1000),
      },
    }).catch(() => {})
    throw new Error(`Grade saved, but the private WhatsApp result could not be sent: ${errorMessage}`)
  }
}
