/** Last 10 digits. Same rule as Exam Mode (`paperExamLast10`). */
export function phoneLast10(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '').slice(-10)
}

export function submissionNeedsReview(status: string, verified: boolean): boolean {
  if (status === 'review' || status === 'failed') return true
  if (status === 'graded' && !verified) return true
  return false
}

export type RosterMember = {
  contactId: string
  phone: string
  name: string
}

export type RosterSubmission = {
  id: string
  contactId: string | null
  phone: string
  passed: boolean | null
  status: string
  verified: boolean
}

export type SessionSummary = {
  roster: number
  submitted: number
  passed: number
  failed: number
  needsReview: number
  processing: number
  missing: number
  missingNames: string[]
}

/**
 * Roster matching used by Exam Mode: a member is submitted when their
 * contact id or last-10 phone matches a submission. Passed/failed count
 * every submission, including ones that did not match the roster.
 */
export function summarizeSession(members: RosterMember[], submissions: RosterSubmission[]): SessionSummary {
  const byContact = new Map<string, RosterSubmission>()
  const byPhone = new Map<string, RosterSubmission>()
  for (const submission of submissions) {
    if (submission.contactId) byContact.set(submission.contactId, submission)
    const phone = phoneLast10(submission.phone)
    if (phone.length === 10) byPhone.set(phone, submission)
  }

  const missingNames: string[] = []
  let submitted = 0
  for (const member of members) {
    const match = byContact.get(member.contactId) || byPhone.get(phoneLast10(member.phone)) || null
    if (match) submitted += 1
    else missingNames.push(member.name)
  }

  return {
    roster: members.length,
    submitted,
    passed: submissions.filter(item => item.passed === true).length,
    failed: submissions.filter(item => item.passed === false).length,
    needsReview: submissions.filter(item => submissionNeedsReview(item.status, item.verified)).length,
    processing: submissions.filter(item => item.status === 'received' || item.status === 'processing').length,
    missing: Math.max(0, members.length - submitted),
    missingNames,
  }
}
