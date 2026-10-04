'use client'

import { Suspense, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { answerLabels, screeningLabels, type LeadScreening } from '@/lib/lead-screening'
import { LeadQualification } from '@/components/LeadQualification'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Target, Loader2, Search, Phone, Mail, MessageCircle, Trash2,
  CheckCircle, Archive, Inbox, Clock, Plus, Upload, UserX,
} from 'lucide-react'

interface Lead {
  id: string
  createdAt: string
  name: string | null
  email: string | null
  phone: string | null
  notes: string | null
  source: string
  status: string
  isRead: boolean
  isTest: boolean
  screening?: LeadScreening
}

type Tab = 'new' | 'active' | 'abandoned' | 'archived' | 'all'

function relativeTime(iso: string): string {
  const d = new Date(iso)
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.round(diffH / 24)
  if (diffD < 7) return `${diffD}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function digits(phone: string): string {
  return phone.replace(/\D/g, '')
}

export default function LeadsPage() {
  return <Suspense fallback={<p className="p-6">Loading leads…</p>}><LeadsContent /></Suspense>
}

function LeadsContent() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedTab = searchParams.get('status')
  const tab: Tab = (['new', 'active', 'abandoned', 'archived', 'all'] as const).find(t => t === requestedTab) || 'active'
  const setTab = (value: Tab) => {
    router.replace(`/leads?status=${value}`, { scroll: false })
  }
  const [includeTests, setIncludeTests] = useState(false)
  const screeningFilter = searchParams.get('screening') || 'all'
  const search = searchParams.get('search') || ''
  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.replace(`/leads?${params}`, { scroll: false })
  }
  const setSearch = (value: string) => setFilter('search', value)
  const setScreeningFilter = (value: string) => setFilter('screening', value)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', phone: '', email: '', notes: '' })
  const [importMsg, setImportMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isAbandoned = tab === 'abandoned'

  const { data, isLoading, isError, refetch } = useQuery<{ leads: Lead[]; newCount?: number }>({
    queryKey: ['leads', tab, search, includeTests],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      // Abandoned registrations live in StudentRegistration, not Lead, so they
      // come from their own endpoint (already shaped like a Lead).
      if (isAbandoned) {
        const res = await fetch(`/api/leads/abandoned?${params}`)
        if (!res.ok) throw new Error('Failed to fetch abandoned registrations')
        return res.json()
      }
      params.set('status', tab)
      if (includeTests) params.set('includeTests', '1')
      const res = await fetch(`/api/leads?${params}`)
      if (!res.ok) throw new Error('Failed to fetch leads')
      return res.json()
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  })

  // Count for the tab badge — kept independent of the selected tab so the
  // number is visible while you're looking at another tab.
  const { data: abandonedCount } = useQuery<{ count: number }>({
    queryKey: ['leads', 'abandoned-count'],
    queryFn: async () => {
      const res = await fetch('/api/leads/abandoned')
      if (!res.ok) throw new Error('failed')
      const json = await res.json()
      return { count: json.count ?? 0 }
    },
    refetchInterval: 60000,
  })

  const leads = (data?.leads || []).filter(lead => isAbandoned || screeningFilter === 'all' || (lead.screening?.result || 'review') === screeningFilter)

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, isRead: true }),
      })
      if (!res.ok) throw new Error('Failed to update')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })

  // Abandoned drafts live in StudentRegistration — discarding one hits its own
  // endpoint, which is guarded to status "draft" so it can never remove a real
  // registration.
  const discardMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/leads/abandoned?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to discard')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })

  const addMutation = useMutation({
    mutationFn: async (form: typeof addForm) => {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to add lead')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      setShowAdd(false)
      setAddForm({ name: '', phone: '', email: '', notes: '' })
    },
  })

  const importMutation = useMutation({
    mutationFn: async (csv: string) => {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      return data as { imported: number; updated: number; skipped: number; total: number }
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      setImportMsg(`Imported ${r.imported} new · ${r.updated} already present · ${r.skipped} skipped (of ${r.total}).`)
    },
    onError: (e) => setImportMsg(e instanceof Error ? e.message : 'Import failed'),
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportMsg('')
    const reader = new FileReader()
    reader.onload = () => importMutation.mutate(String(reader.result || ''))
    reader.readAsText(file)
    e.target.value = '' // allow re-importing the same file
  }

  const TABS: { key: Tab; label: string; icon: typeof Inbox; count?: number }[] = [
    { key: 'new', label: 'Not contacted', icon: Phone, count: data?.newCount },
    { key: 'active', label: 'Active', icon: Inbox },
    { key: 'abandoned', label: "Didn't finish", icon: UserX, count: abandonedCount?.count },
    { key: 'archived', label: 'Archived', icon: Archive },
    { key: 'all', label: 'All', icon: Target },
  ]

  return (
    <main className="max-w-[1400px] mx-auto p-4 sm:p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-start justify-between gap-4 flex-wrap"
      >
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6" /> Leads
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Website and ad enquiries. Review their answers, call, then mark contacted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFile}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending}
          >
            {importMutation.isPending
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Upload className="h-4 w-4 mr-2" />}
            Import CSV
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Lead
          </Button>
        </div>
      </motion.div>

      {importMsg && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {importMsg}
          <button onClick={() => setImportMsg('')} className="ml-auto text-blue-600">✕</button>
        </div>
      )}

      {updateMutation.isError && <p role="alert" className="rounded-lg border border-destructive p-4 text-destructive">Could not update the lead. Please try again; it has not been marked contacted.</p>}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-lg">
              Inbound Leads
              <Badge variant="secondary">{leads.length}</Badge>
              {(data?.newCount ?? 0) > 0 && (
                <Badge className="bg-red-100 text-red-700">{data!.newCount} new</Badge>
              )}
            </CardTitle>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, phone, email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1 mt-3 border-b">
            {TABS.map(({ key, label, icon: Icon, count }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === key
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {count !== undefined && count > 0 && (
                  <Badge variant="secondary" className="ml-0.5">{count}</Badge>
                )}
              </button>
            ))}
          </div>
          {!isAbandoned && <div className="mt-4 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">Truck qualification
              <select value={screeningFilter} onChange={e => setScreeningFilter(e.target.value)} className="min-h-10 rounded-md border bg-background px-3 text-foreground">
                <option value="all">All answers</option>
                {Object.entries(screeningLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={includeTests} onChange={e => setIncludeTests(e.target.checked)} />Show test leads</label>
            <p className="w-full text-sm text-muted-foreground">Green: both initial criteria met. Red: a criterion is not met. Amber: needs review. This is truck pre-qualification from self-reported answers, not verified SAAQ eligibility. Mark contacted after following up to clear the notification.</p>
          </div>}
        </CardHeader>
        <CardContent>
          {isError ? (
            <div role="alert" className="space-y-3 py-8 text-center"><p>Could not load leads. Please try again.</p><Button variant="outline" onClick={() => refetch()}>Retry</Button></div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-muted-foreground">Loading leads…</span>
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-12">
              <Target className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">
                {search.trim() || screeningFilter !== 'all' ? 'No leads match these filters.' : tab === 'new' ? 'No new leads waiting for a call.' : 'No leads yet.'}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Truck qualification</TableHead>
                    <TableHead>Québec licence</TableHead>
                    <TableHead>2+ years driving</TableHead>
                    <TableHead>Program</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead>Preferred call time</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[150px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map(lead => (
                    <TableRow key={lead.id} className={lead.status === 'new' ? 'bg-blue-50/40 dark:bg-blue-950/10' : ''}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {lead.status === 'new' && (
                            <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" title="New" />
                          )}
                          <span>{lead.name || '—'}</span>
                          {lead.isTest && (
                            <Badge variant="outline" className="text-[10px]">test</Badge>
                          )}
                        </div>
                        {lead.notes && <details className="mt-2 text-sm font-normal"><summary className="cursor-pointer py-2 text-muted-foreground">Additional information</summary><p className="max-w-64 whitespace-pre-line break-words text-muted-foreground">{lead.notes}</p></details>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm">
                          {lead.phone && (
                            <div className="flex items-center gap-2">
                              <Button asChild size="sm" variant="outline"><a href={`tel:${lead.phone.replace(/[^+\d]/g, '')}`} aria-label={`Call ${lead.name || lead.phone}`}><Phone className="h-4 w-4" /> Call</a></Button>
                              <span>{lead.phone}</span>
                              <a
                                href={`https://wa.me/${digits(lead.phone)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 hover:text-green-700"
                                title="WhatsApp"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          )}
                          {lead.email && (
                            <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-muted-foreground hover:text-primary">
                              <Mail className="h-3.5 w-3.5" /> {lead.email}
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-52">
                        <LeadQualification screening={lead.screening} />
                        {lead.screening && lead.screening.quebecLicence === 'unknown' && lead.screening.drivingExperience === 'unknown' && lead.screening.combinedAnswer !== 'unknown' && <p className="mt-2 text-xs text-muted-foreground">Older combined answer: {answerLabels[lead.screening.combinedAnswer]}</p>}
                      </TableCell>
                      <TableCell>{answerLabels[lead.screening?.quebecLicence || 'unknown']}</TableCell>
                      <TableCell>{answerLabels[lead.screening?.drivingExperience || 'unknown']}</TableCell>
                      <TableCell className="min-w-40 text-sm">{lead.screening?.program || 'Not provided'}</TableCell>
                      <TableCell>{lead.screening?.language || 'Not provided'}</TableCell>
                      <TableCell className="whitespace-nowrap">{lead.screening?.callbackTime ? ({ any: 'No preference', morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' }[lead.screening.callbackTime] || lead.screening.callbackTime) : 'Not provided'}</TableCell>
                      <TableCell className="whitespace-nowrap">{lead.screening?.website ? 'Website · Truck promotion' : lead.source === 'google_ads' ? 'Google Ads' : lead.source === 'manual' ? 'Manually added' : lead.source}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {relativeTime(lead.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {isAbandoned ? (
                          <Badge className="bg-amber-100 text-amber-800">Didn&apos;t finish</Badge>
                        ) : (
                          <>
                            {lead.status === 'new' && <Badge className="bg-blue-100 text-blue-700">Not contacted</Badge>}
                            {lead.status === 'contacted' && <Badge className="bg-green-100 text-green-700">Contacted</Badge>}
                            {lead.status === 'archived' && <Badge variant="secondary">Archived</Badge>}
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {/* Abandoned drafts aren't Lead rows, so the
                              contacted/archive mutations don't apply to them —
                              you either call them or discard the draft. */}
                          {!isAbandoned && lead.status !== 'contacted' && (
                            <Button
                              variant="outline" size="sm"
                              title="Mark contacted"
                              disabled={updateMutation.isPending}
                              onClick={() => updateMutation.mutate({ id: lead.id, status: 'contacted' })}
                            >
                              <CheckCircle className="h-4 w-4" /> Mark contacted
                            </Button>
                          )}
                          {!isAbandoned && lead.status !== 'archived' && (
                            <Button
                              variant="ghost" size="sm" className="h-8 px-2"
                              title="Archive"
                              aria-label={`Archive ${lead.name || 'lead'}`}
                              disabled={updateMutation.isPending}
                              onClick={() => updateMutation.mutate({ id: lead.id, status: 'archived' })}
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost" size="sm" className="h-8 px-2"
                            title={isAbandoned ? 'Discard this unfinished registration' : 'Delete'}
                            onClick={() => {
                              if (isAbandoned) {
                                if (confirm('Discard this unfinished registration?')) discardMutation.mutate(lead.id)
                              } else if (confirm('Delete this lead permanently?')) {
                                deleteMutation.mutate(lead.id)
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Lead</DialogTitle>
            <DialogDescription>
              For phone-in inquiries or older leads from your email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 514 555 1234" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="name@email.com" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} placeholder="What they're interested in, message, etc." rows={3} />
            </div>
            {addMutation.error && (
              <p className="text-sm text-red-600">{(addMutation.error as Error).message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              onClick={() => addMutation.mutate(addForm)}
              disabled={addMutation.isPending || (!addForm.name && !addForm.phone && !addForm.email)}
            >
              {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
