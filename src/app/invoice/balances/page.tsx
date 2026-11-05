'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MorphText } from '@/components/ui/morph-text'
import type { BillingReviewAccount } from '@/lib/billing-review-types'

const money = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value)
const balance = (value: number) => value < 0 ? `${money(-value)} credit` : money(value)

function Review({ account, onSaved, onReload }: { account: BillingReviewAccount; onSaved: () => Promise<void>; onReload: () => void }) {
  // Never prefill an inferred snapshot total. Staff must independently verify it.
  const [amount, setAmount] = useState('')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const validAmount = /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) <= 21474836.47
  const charges = validAmount ? Math.round(Number(amount) * 100) : null
  const proposed = charges == null ? null : (charges - Math.round(account.totalPaid * 100)) / 100
  const ready = account.canApprove && charges != null && name.trim().length >= 2 && note.trim().length >= 10 && confirmed && !saving && !saved
  async function approve(event: React.FormEvent) {
    event.preventDefault()
    if (!ready) return
    setSaving(true); setError('')
    try {
      const response = await fetch('/api/invoice/balance-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        identityKey: account.identityKey, fingerprint: account.fingerprint, openingChargesCents: charges,
        reviewNote: note, reviewedBy: name, approved: confirmed,
      }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Approval failed. Reload before retrying.')
      setSaved(true)
      await onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'Approval failed. Reload before retrying.') }
    finally { setSaving(false) }
  }
  return <section className="min-w-0 space-y-6 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="review-title">
    <header className="space-y-2">
      <p className="text-sm text-muted-foreground">{account.reviewed ? 'Reviewed account' : 'Review one account'}</p>
      <h2 id="review-title" className="break-words text-2xl font-semibold">{account.studentName}</h2>
      <p className="text-sm text-muted-foreground">{account.phone || 'No phone recorded'} · {account.invoices.length} invoices</p>
      {account.studentId && <Link className="text-sm underline underline-offset-4" href={`/students/${account.studentId}`} target="_blank" rel="noopener noreferrer">Open student profile and contract</Link>}
    </header>
    <dl className="grid gap-4 rounded-lg bg-muted/50 p-4 sm:grid-cols-2">
      <div><dt className="text-sm text-muted-foreground">{account.reviewed ? 'Current account balance' : 'Previously displayed balance'}</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{balance(account.currentBalance)}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Recorded paid receipts</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{money(account.totalPaid)}</dd></div>
    </dl>
    {account.issues.length > 0 && <div className="space-y-2 rounded-lg border p-4 text-sm">
      <p className="font-semibold">Check before approval</p>
      <ul className="list-disc space-y-2 pl-4">{account.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
    </div>}
    <div className="space-y-2">
      <h3 className="font-semibold">Receipt history</h3>
      <p className="text-sm text-muted-foreground">Only invoices marked paid reduce the balance. Fix incorrect payment statuses on the invoice first, then reload this review. Approving here does not change or refund any payment.</p>
      <div className="max-h-80 overflow-auto rounded-lg border" tabIndex={0} aria-label="Receipt history">
        <table className="w-full text-left text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="p-3">Invoice</th><th className="p-3">Status</th><th className="p-3 text-right">Amount</th></tr></thead>
          <tbody>{account.invoices.map(row => <tr key={row.id} className="border-t">
            <td className="p-3"><Link href={`/invoice/${row.id}`} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-4">{row.number}</Link><p className="mt-1 text-xs text-muted-foreground">{row.date}</p></td>
            <td className="p-3 capitalize">{row.status}</td><td className="p-3 text-right tabular-nums">{money(row.total)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
    {account.audit ? <div role="status" className="space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
      <h3 className="font-semibold">Saved review</h3>
      <p>{account.audit.by || 'Recorded account'} · {new Date(account.audit.at).toLocaleDateString('en-CA')}</p>
      <p>Verified opening charges: {money(account.audit.openingCharges)}</p>
      {account.audit.paidAtReview != null && <p>Paid at review: {money(account.audit.paidAtReview)}</p>}
      {account.audit.previousBalance != null && <p>Previously displayed: {balance(account.audit.previousBalance)}</p>}
      <p className="whitespace-pre-wrap break-words">{account.audit.note}</p>
      <p className="text-muted-foreground">Review is saved. Future invoices and confirmed payments update this account. This screen cannot overwrite an approved opening total.</p>
      <Button asChild variant="outline"><Link href={`/invoice?${new URLSearchParams({ studentName: account.studentName, studentPhone: account.phone || '', ...(account.studentId ? { studentId: String(account.studentId) } : {}) })}`}>Create invoice for this student</Link></Button>
    </div> : !account.canApprove ? <p role="alert" className="rounded-lg border p-4 text-sm">This account cannot be approved here. Resolve the student identity or mixed account links before continuing. Nothing has changed.</p> : <form onSubmit={approve} className="space-y-4 border-t pt-6">
      <h3 className="text-lg font-semibold">Verify the agreed total</h3>
      <p className="max-w-prose text-sm text-muted-foreground">Enter the full agreed course price plus any additional services already included in this history, taxes included. This is the total owed before payments, not the remaining balance. Use the signed contract and receipts as evidence.</p>
      {account.suggestedChargesCents != null && <p className="text-sm text-muted-foreground">Old snapshots suggest {money(account.suggestedChargesCents / 100)}. This is a reference only, not a verified contract price.</p>}
      <div className="space-y-2"><Label htmlFor="review-total">Verified total charges, tax included ($)</Label><Input id="review-total" inputMode="decimal" placeholder="Enter the verified total" value={amount} disabled={saving} onChange={e => { setAmount(e.target.value); setConfirmed(false) }} /></div>
      <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Balance after approval</p><p className="mt-2 text-2xl font-semibold"><MorphText>{proposed == null ? 'Enter a verified total' : balance(proposed)}</MorphText></p><p className="mt-2 text-sm text-muted-foreground">Verified charges minus {money(account.totalPaid)} in recorded paid receipts. Unpaid invoices do not count as payment.</p></div>
      <div className="space-y-2"><Label htmlFor="review-name">Reviewed by</Label><Input id="review-name" autoComplete="name" maxLength={100} value={name} disabled={saving} onChange={e => setName(e.target.value)} placeholder="Your name" /></div>
      <div className="space-y-2"><Label htmlFor="review-note">Evidence and review note</Label><Textarea id="review-note" maxLength={2000} value={note} disabled={saving} onChange={e => setNote(e.target.value)} placeholder="Contract reference, agreed price, extra services, and any payment discrepancies you checked" /><p className="text-xs text-muted-foreground">At least 10 characters. Saved with your name, device session and review time.</p></div>
      <label className="flex items-start gap-3 rounded-lg bg-muted/50 p-4 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={confirmed} disabled={saving} onChange={e => setConfirmed(e.target.checked)} /><span>I checked this student’s identity, agreed charges and paid receipts. I approve the balance shown above.</span></label>
      {error && <div role="alert" className="space-y-2 rounded-lg border border-destructive p-4 text-sm"><p>{error}</p><Button type="button" variant="outline" onClick={onReload}>Reload latest records</Button></div>}
      <Button type="submit" disabled={!ready} className="w-full sm:w-auto"><MorphText reserve="Approve opening balance">{saved ? 'Review saved' : saving ? 'Saving review…' : 'Approve opening balance'}</MorphText></Button>
      <p className="text-xs text-muted-foreground">One account only. No bulk approval, payment, refund or message is sent.</p>
    </form>}
  </section>
}

function BalanceReviewPage() {
  const params = useSearchParams()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState(params.get('q') || '')
  const [filter, setFilter] = useState('pending')
  const [selected, setSelected] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const { data, isPending, error, refetch, isFetching } = useQuery({
    queryKey: ['billing-review'], refetchOnWindowFocus: false,
    queryFn: async (): Promise<{ accounts: BillingReviewAccount[] }> => {
      const response = await fetch('/api/invoice/balance-review', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not load balances.')
      return result
    },
  })
  const accounts = data?.accounts || []
  const active = accounts.find(row => row.identityKey === selected)
  const searchText = search.toLowerCase().trim()
  const searchPhone = search.replace(/\D/g, '').slice(-10)
  const rows = accounts.filter(row => (filter === 'all' || (filter === 'reviewed') === row.reviewed) &&
    (`${row.studentName} ${row.phone || ''} ${row.studentId || ''} ${row.invoices.map(i => i.number).join(' ')}`.toLowerCase().includes(searchText)
      || (searchPhone.length >= 7 && (row.phone || '').replace(/\D/g, '').slice(-10).includes(searchPhone))))
  async function saved() {
    setNotice('Opening balance approved. The receipt history was preserved.')
    await queryClient.invalidateQueries({ predicate: query => query.queryKey[0] !== 'billing-review' })
    await refetch()
  }
  return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><Link href="/invoice" className="text-sm text-muted-foreground underline underline-offset-4">Back to invoices</Link><h1 className="mt-4 text-3xl font-semibold">Balance review</h1><p className="mt-2 max-w-prose text-muted-foreground">Check historical accounts against the contract and receipts. Nothing changes until a staff member approves an individual account.</p></div>
      <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>Refresh records</Button>
    </header>
    {notice && <p role="status" className="rounded-lg border bg-muted/50 p-4">{notice}</p>}
    {error && <p role="alert" className="rounded-lg border border-destructive p-4">{error.message} Use Refresh records to try again.</p>}
    {isPending ? <div role="status" className="space-y-4"><p>Loading balances…</p><div className="h-24 rounded-lg bg-muted motion-safe:animate-pulse" /><div className="h-24 rounded-lg bg-muted motion-safe:animate-pulse" /></div> : data && <div className="grid items-start gap-6 lg:grid-cols-3">
      <aside className="min-w-0 space-y-4 lg:col-span-1" aria-label="Accounts to review">
        <div className="space-y-2"><Label htmlFor="balance-search">Find a student or invoice</Label><Input id="balance-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, phone or invoice number" /></div>
        <div className="space-y-2"><Label htmlFor="balance-filter">Show accounts</Label><select id="balance-filter" className="w-full rounded-md border bg-background p-2 text-sm" value={filter} onChange={e => setFilter(e.target.value)}><option value="pending">Needs review</option><option value="reviewed">Reviewed</option><option value="all">All accounts</option></select></div>
        <p className="text-sm text-muted-foreground"><MorphText>{`${rows.length} accounts · ${accounts.filter(a => !a.reviewed).length} need review`}</MorphText></p>
        <div className="max-h-96 space-y-2 overflow-auto lg:max-h-[70dvh]">
          {rows.map(row => <button key={row.identityKey} type="button" aria-pressed={selected === row.identityKey} onClick={() => { setSelected(row.identityKey); setNotice('') }} className={`w-full rounded-lg border p-4 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-ring ${selected === row.identityKey ? 'border-foreground bg-muted' : 'bg-card hover:bg-muted/50'}`}>
            <span className="block break-words font-semibold">{row.studentName}</span><span className="mt-1 block text-sm text-muted-foreground">{row.phone || 'No phone'} · {row.invoices.length} invoices</span><span className="mt-2 block text-sm">{row.reviewed ? 'Reviewed' : row.canApprove ? 'Needs review' : 'Identity review required'} · {balance(row.currentBalance)}</span>
          </button>)}
          {!rows.length && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No accounts match this view. Try another search or show all accounts.</p>}
        </div>
      </aside>
      <div className="min-w-0 lg:col-span-2">{active ? <Review key={`${active.identityKey}:${active.fingerprint}`} account={active} onSaved={saved} onReload={() => void refetch()} /> : <section className="rounded-xl border p-8"><h2 className="text-xl font-semibold">Choose an account to review</h2><p className="mt-2 text-muted-foreground">You’ll see the recorded receipts, the existing balance and the effect of your verified total before approving.</p></section>}</div>
    </div>}
  </main>
}

export default function Page() { return <Suspense fallback={<p className="p-8">Loading balance review…</p>}><BalanceReviewPage /></Suspense> }
