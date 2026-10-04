import { screeningLabels, type LeadScreening } from '@/lib/lead-screening'

// Semantic status colours are requested for fast scanning; text carries the same meaning.
const colours = {
  meets: 'border-green-300 bg-green-100 text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-200',
  not_met: 'border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-200',
  review: 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200',
}

export function LeadQualification({ screening }: { screening?: LeadScreening }) {
  const result = screening?.result || 'review'
  return <div className="space-y-2">
    <span className={`inline-flex whitespace-nowrap rounded-md border px-3 py-2 text-sm font-semibold ${colours[result]}`}>
      {screeningLabels[result]}
    </span>
    <p className="max-w-48 text-xs leading-relaxed text-muted-foreground">
      {result === 'meets' ? 'Both initial criteria reported as met.' : result === 'not_met' ? 'At least one initial criterion is not met.' : 'Answers missing or uncertain. Confirm by phone.'}
    </p>
  </div>
}
