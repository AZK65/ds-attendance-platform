'use client'

import Link from 'next/link'

export function LeadAttentionBar({ count, unavailable }: { count: number; unavailable: boolean }) {
  if (count === 0 && !unavailable) return null
  return (
    <div className="bg-red-700 text-white" aria-label="Submissions awaiting contact">
      <Link href="/leads?status=new" className="container mx-auto flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors duration-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px]">
        <div>
          <p className="text-base font-semibold" role="status" aria-live="polite" aria-atomic="true">
            {count > 0 ? `${count} ${count === 1 ? 'submission' : 'submissions'} not yet contacted` : 'Submission notifications are temporarily unavailable'}
          </p>
          <p className="text-sm opacity-90">{unavailable ? 'Connection interrupted. The count may be out of date.' : 'Review the submissions, call, then mark contacted.'}</p>
        </div>
        <span className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-red-800">View submissions →</span>
      </Link>
    </div>
  )
}
