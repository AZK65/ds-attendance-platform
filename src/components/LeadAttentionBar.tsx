'use client'

import Link from 'next/link'

export function LeadAttentionBar({ count, unavailable }: { count: number; unavailable: boolean }) {
  if (count === 0 && !unavailable) return null
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100" aria-label="Submissions awaiting contact">
      <Link href="/leads?status=new" className="mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 transition-colors duration-200 hover:bg-amber-100/50 dark:hover:bg-amber-900/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px]">
        <div>
          <p className="text-sm font-medium" role="status" aria-live="polite" aria-atomic="true">
            {count > 0 ? `${count} ${count === 1 ? 'submission' : 'submissions'} not yet contacted` : 'Submission notifications are temporarily unavailable'}
          </p>
          {unavailable && <p className="text-xs">Connection interrupted. The count may be out of date.</p>}
        </div>
        <span className="shrink-0 text-sm font-semibold">Review submissions →</span>
      </Link>
    </div>
  )
}
