'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, Loader2, Plus } from 'lucide-react'

interface InstructorRow {
  id: string
  legalName: string
  bookletName: string | null
  displayName: string
  saaqInstructorNo: string | null
  teamupSubcalendarId: number | null
}

interface Draft {
  bookletName: string
  displayName: string
  saaqInstructorNo: string
  teamupSubcalendarId: string
}

function toDraft(row: InstructorRow): Draft {
  return {
    bookletName: row.bookletName || row.legalName,
    displayName: row.displayName,
    saaqInstructorNo: row.saaqInstructorNo || '',
    teamupSubcalendarId: row.teamupSubcalendarId == null ? '' : String(row.teamupSubcalendarId),
  }
}

const emptyDraft: Draft = { bookletName: '', displayName: '', saaqInstructorNo: '', teamupSubcalendarId: '' }

export default function InstructorsSettingsPage() {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [creating, setCreating] = useState(false)
  const [createDraft, setCreateDraft] = useState<Draft>(emptyDraft)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery<{ instructors: InstructorRow[] }>({
    queryKey: ['settings-instructors'],
    queryFn: async () => {
      const res = await fetch('/api/settings/instructors')
      if (!res.ok) throw new Error('Failed to load instructors')
      return res.json()
    },
  })

  const save = useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: Draft }) => {
      const res = await fetch('/api/settings/instructors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          bookletName: draft.bookletName,
          displayName: draft.displayName,
          saaqInstructorNo: draft.saaqInstructorNo,
          teamupSubcalendarId: draft.teamupSubcalendarId,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Save failed')
      return payload
    },
    onSuccess: () => {
      setMessage('Saved. Name and number changes are kept in the correction log.')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['settings-instructors'] })
    },
    onError: (err: Error) => {
      setError(err.message)
      setMessage(null)
    },
  })

  const create = useMutation({
    mutationFn: async (draft: Draft) => {
      const res = await fetch('/api/settings/instructors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookletName: draft.bookletName,
          displayName: draft.displayName,
          saaqInstructorNo: draft.saaqInstructorNo,
          teamupSubcalendarId: draft.teamupSubcalendarId,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Could not add instructor')
      return payload
    },
    onSuccess: () => {
      setCreating(false)
      setCreateDraft(emptyDraft)
      setMessage('Instructor added.')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['settings-instructors'] })
    },
    onError: (err: Error) => {
      setError(err.message)
      setMessage(null)
    },
  })

  const instructors = data?.instructors || []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Instructors</CardTitle>
          <CardDescription>
            The full name is printed on the Class 1 attendance booklet. Leave the SAAQ instructor number empty until it is issued — the booklet shows Pending, and a number is never filled in automatically. Practical lessons use the Teamup sub-calendar to find the instructor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {message && <p className="text-sm text-green-700 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> {message}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {isLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : instructors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No instructors yet.</p>
          ) : instructors.map(row => {
            const draft = drafts[row.id] || toDraft(row)
            const set = (patch: Partial<Draft>) => setDrafts(current => ({ ...current, [row.id]: { ...draft, ...patch } }))
            return (
              <form
                key={row.id}
                className="grid gap-3 border rounded-lg p-4 sm:grid-cols-2"
                onSubmit={event => {
                  event.preventDefault()
                  save.mutate({ id: row.id, draft })
                }}
              >
                <div className="sm:col-span-2">
                  <Label htmlFor={`${row.id}-name`}>Full name</Label>
                  <Input id={`${row.id}-name`} value={draft.bookletName} onChange={event => set({ bookletName: event.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor={`${row.id}-display`}>Display name</Label>
                  <Input id={`${row.id}-display`} value={draft.displayName} onChange={event => set({ displayName: event.target.value })} className="mt-1" />
                  <p className="text-xs text-muted-foreground mt-1">Short name used on the schedule, for example Ahmed.</p>
                </div>
                <div>
                  <Label htmlFor={`${row.id}-number`}>SAAQ instructor number</Label>
                  <Input id={`${row.id}-number`} value={draft.saaqInstructorNo} onChange={event => set({ saaqInstructorNo: event.target.value })} placeholder="Pending" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor={`${row.id}-cal`}>Teamup sub-calendar</Label>
                  <Input id={`${row.id}-cal`} value={draft.teamupSubcalendarId} onChange={event => set({ teamupSubcalendarId: event.target.value })} inputMode="numeric" className="mt-1" />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={save.isPending}>
                    {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                  </Button>
                </div>
              </form>
            )
          })}

          {creating ? (
            <form
              className="grid gap-3 border border-dashed rounded-lg p-4 sm:grid-cols-2"
              onSubmit={event => {
                event.preventDefault()
                create.mutate(createDraft)
              }}
            >
              <div className="sm:col-span-2">
                <Label htmlFor="new-name">Full name</Label>
                <Input id="new-name" value={createDraft.bookletName} onChange={event => setCreateDraft({ ...createDraft, bookletName: event.target.value })} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="new-display">Display name</Label>
                <Input id="new-display" value={createDraft.displayName} onChange={event => setCreateDraft({ ...createDraft, displayName: event.target.value })} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="new-number">SAAQ instructor number</Label>
                <Input id="new-number" value={createDraft.saaqInstructorNo} onChange={event => setCreateDraft({ ...createDraft, saaqInstructorNo: event.target.value })} placeholder="Pending" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="new-cal">Teamup sub-calendar</Label>
                <Input id="new-cal" value={createDraft.teamupSubcalendarId} onChange={event => setCreateDraft({ ...createDraft, teamupSubcalendarId: event.target.value })} inputMode="numeric" className="mt-1" />
              </div>
              <div className="flex items-end gap-2">
                <Button type="submit" disabled={create.isPending}>{create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add instructor'}</Button>
                <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
              </div>
            </form>
          ) : (
            <Button type="button" variant="outline" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add instructor
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
