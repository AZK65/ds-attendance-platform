'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, AlertCircle, Clock, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Attempt = { id: string; recipient: string; source: string; status: string; attemptedAt: string; sentAt: string | null; error: string | null }

export function InvoiceEmailHistory({ invoiceId }: { invoiceId: string }) {
  const [expanded, setExpanded] = useState(false)
  const query = useQuery<{ attempts: Attempt[] }>({
    queryKey: ['invoice-email-history', invoiceId],
    queryFn: async () => {
      const response = await fetch(`/api/invoice/${encodeURIComponent(invoiceId)}/emails`)
      if (!response.ok) throw new Error('Email history could not be loaded.')
      return response.json()
    },
    refetchInterval: 10000,
  })
  const attempts = query.data?.attempts ?? []
  return <section className="min-w-0 border-t pt-4" aria-label="Invoice email history">
    <h3 className="flex items-center gap-2 text-sm font-medium"><Mail className="h-4 w-4" />Email history</h3>
    {query.isPending && <p className="mt-2 text-xs text-muted-foreground">Loading email history…</p>}
    {query.isError ? <div className="mt-2 text-xs text-destructive">Couldn’t load email history. <Button variant="link" size="sm" onClick={() => query.refetch()}>Retry</Button></div> : !query.isPending && !attempts.length && <p className="mt-2 text-xs text-muted-foreground">No recorded email attempts.</p>}
    <ul className="mt-2 space-y-3">
      {(expanded ? attempts : attempts.slice(0, 3)).map((attempt) => {
        const sent = attempt.status === 'sent'
        const pending = attempt.status === 'pending'
        const Icon = sent ? CheckCircle2 : pending ? Clock : AlertCircle
        const label = sent ? 'Sent' : pending ? 'Sending…' : attempt.status === 'failed' ? 'Failed' : 'Status unknown'
        const timestamp = attempt.sentAt || attempt.attemptedAt
        return <li key={attempt.id} className="flex min-w-0 gap-2 text-xs">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${sent ? 'text-emerald-600' : pending ? 'text-muted-foreground' : 'text-amber-600'}`} />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{label}{attempt.source === 'online-payment' && <span className="font-normal text-muted-foreground"> · Automatic receipt</span>}</div>
            <p className="break-all text-muted-foreground">{attempt.recipient || 'Recipient not recorded'}</p>
            <time dateTime={timestamp} className="text-muted-foreground">{new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>
            {attempt.error && <p className="mt-1 break-words text-destructive">{attempt.error}</p>}
            {attempt.status === 'unknown' && !attempt.error && <p className="mt-1 text-muted-foreground">Check before sending again.</p>}
          </div>
        </li>
      })}
    </ul>
    {attempts.length > 3 && <Button variant="link" size="sm" className="h-auto px-0 pt-2" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : `Show recent history (${attempts.length})`}</Button>}
    {attempts.length > 0 && <p className="mt-3 text-[11px] text-muted-foreground">Sent means accepted by the email service, not confirmed delivery.</p>}
  </section>
}
