'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Lock } from 'lucide-react'
import { TheoryEvaluationsCard } from '@/components/TheoryEvaluationsCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Mastery, Observation } from '@/lib/rsep1/competencies'
import { PRACTICAL_COMPETENCIES, THEORY_COMPETENCIES } from '@/lib/rsep1/competencies'
import { todayToronto } from '@/lib/rsep1/values'

interface Slot { date: string | null; mastery: Mastery }
interface SheetPayload {
  values: {
    date: string | null
    instructorName: string
    studentName: string
    competencies: Record<string, Slot>
    observation: Observation
    notes: string
  }
  theorySource: Record<string, { gradePercent: number | null; evaluatedOn: string | null }>
  prefill: { studentName: string; date: string | null }
  profileName: string
  nameDiffers: boolean
  autoDate: string
  dateCustom: boolean
  status: 'draft' | 'complete'
  locked: boolean
  finalizedAt: string | null
  revisionNo: number
  updatedAt: string
  updatedByLabel: string | null
  masteredCount: number
  instructorSuggestions: string[]
}

export default function ResultsSheetPage() {
  const params = useParams()
  const studentId = params.studentId as string
  const queryClient = useQueryClient()
  const [draftKey, setDraftKey] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [dateCustom, setDateCustom] = useState(false)
  const [instructorName, setInstructorName] = useState('')
  const [studentName, setStudentName] = useState('')
  const [c7, setC7] = useState<Slot>({ date: null, mastery: null })
  const [c8, setC8] = useState<Slot>({ date: null, mastery: null })
  const [observation, setObservation] = useState<Observation>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)

  const query = useQuery<SheetPayload>({
    queryKey: ['results-sheet', studentId],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}/results-sheet`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message || body.error || 'Could not load the results sheet')
      return body
    },
  })

  if (query.data && draftKey !== query.data.updatedAt) {
    const values = query.data.values
    setDraftKey(query.data.updatedAt)
    setDate(values.date || query.data.autoDate || query.data.prefill.date || todayToronto())
    setDateCustom(query.data.dateCustom)
    setInstructorName(values.instructorName || '')
    setStudentName(values.studentName || query.data.prefill.studentName || '')
    setC7(values.competencies.c7)
    setC8(values.competencies.c8)
    setObservation(values.observation)
    setNotes(values.notes || '')
  }

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/students/${studentId}/results-sheet`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedUpdatedAt: query.data?.updatedAt,
          values: {
            date: dateCustom ? (date || null) : null,
            dateCustom,
            instructorName,
            studentName,
            competencies: { c7, c8 },
            observation,
            notes,
          },
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message || body.error || 'Save failed')
      return body
    },
    onSuccess: () => {
      setError('')
      setPreviewKey(key => key + 1)
      queryClient.invalidateQueries({ queryKey: ['results-sheet', studentId] })
    },
    onError: (err: Error) => setError(err.message),
  })

  const finalize = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/students/${studentId}/results-sheet/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmIncomplete: query.data?.status !== 'complete' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message || body.error || 'Could not finalize')
      return body
    },
    onSuccess: () => {
      setError('')
      queryClient.invalidateQueries({ queryKey: ['results-sheet', studentId] })
      queryClient.invalidateQueries({ queryKey: ['theory-evaluations', studentId] })
    },
    onError: (err: Error) => setError(err.message),
  })

  const locked = !!query.data?.locked
  const practical = [
    { item: PRACTICAL_COMPETENCIES[0], slot: c7, set: setC7 },
    { item: PRACTICAL_COMPETENCIES[1], slot: c8, set: setC8 },
  ]

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6" data-testid="results-sheet-editor">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/students/${studentId}`}><ArrowLeft className="mr-1 h-4 w-4" /> Back to profile</Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">RSEP-1 Results Sheet</h1>
          <p className="text-sm text-muted-foreground">Class 1. C1–C6 come from theory grades. C7, C8, observation, and notes are entered here.</p>
        </div>
        {query.data && (
          <Badge variant={query.data.status === 'complete' ? 'default' : 'secondary'}>
            {locked ? 'Finalized' : query.data.status === 'complete' ? 'Complete' : 'Draft'} · {query.data.masteredCount}/8
          </Badge>
        )}
      </div>

      {query.isLoading && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>}
      {query.isError && <p className="text-sm text-destructive">{(query.error as Error).message}</p>}

      {query.data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sheet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="sheet-date">Date</Label>
                  <Input
                    id="sheet-date"
                    type="date"
                    value={date}
                    disabled={locked}
                    onChange={event => {
                      if (!event.target.value) {
                        setDateCustom(false)
                        setDate(query.data?.autoDate || todayToronto())
                        return
                      }
                      setDateCustom(true)
                      setDate(event.target.value)
                    }}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {dateCustom
                      ? 'Set by hand. Clear the field to follow the last save again.'
                      : 'The Montréal day of the last save. Before the first save, this is today. You can type a different date.'}
                  </p>
                </div>
                <div>
                  <Label htmlFor="student-name">Name</Label>
                  <Input id="student-name" value={studentName} disabled={locked} onChange={event => setStudentName(event.target.value)} />
                  {query.data.nameDiffers && !locked && (
                    <button
                      type="button"
                      className="mt-1 text-xs text-blue-700 underline"
                      onClick={() => setStudentName(query.data?.profileName || '')}
                    >
                      Profile name differs — update?
                    </button>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="instructor-name">Instructor&apos;s name</Label>
                  <Input
                    id="instructor-name"
                    list="instructor-suggestions"
                    value={instructorName}
                    disabled={locked}
                    onChange={event => setInstructorName(event.target.value)}
                  />
                  <datalist id="instructor-suggestions">
                    {query.data.instructorSuggestions.map(name => <option key={name} value={name} />)}
                  </datalist>
                  <p className="mt-1 text-xs text-muted-foreground">Printed on the form. This form has no formateur-number field.</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">C1–C6 from theory grades</p>
                {THEORY_COMPETENCIES.map(item => {
                  const source = query.data?.theorySource?.[item.key]
                  const slot = query.data?.values.competencies[item.key]
                  const tip = source?.gradePercent == null
                    ? 'From Theory Evaluations: not recorded'
                    : `From Theory Evaluations: ${source.gradePercent}%${source.evaluatedOn ? ` (${source.evaluatedOn})` : ''}`
                  return (
                    <div key={item.code} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm" title={tip}>
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="w-10 font-medium">{item.code}</span>
                      <span className="min-w-0 flex-1 text-muted-foreground">{item.name}</span>
                      <span className="w-28 text-center">{slot?.date || '—'}</span>
                      <span className="w-16">{slot?.mastery === 'Yes' ? 'Yes' : slot?.mastery === 'No' ? 'No' : 'Blank'}</span>
                      <span className="text-xs text-muted-foreground">{tip}</span>
                    </div>
                  )
                })}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Practical competencies</p>
                {practical.map(({ item, slot, set }) => (
                  <div key={item.code} className="grid items-center gap-2 sm:grid-cols-[8rem_1fr_11rem_auto]">
                    <span className="text-sm font-medium">{item.code}</span>
                    <span className="text-sm text-muted-foreground">{item.name}</span>
                    <Input
                      aria-label={`${item.code} date`}
                      type="date"
                      disabled={locked}
                      value={slot.date || ''}
                      onChange={event => set({ ...slot, date: event.target.value || null })}
                    />
                    <div className="flex gap-1">
                      {(['Yes', 'No'] as const).map(choice => (
                        <Button
                          key={choice}
                          type="button"
                          size="sm"
                          variant={slot.mastery === choice ? 'default' : 'outline'}
                          disabled={locked}
                          onClick={() => set({ ...slot, mastery: slot.mastery === choice ? null : choice })}
                        >
                          {choice}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Observation</p>
                <div className="flex gap-2">
                  {(['Mastery', 'Needs work'] as const).map(choice => (
                    <Button
                      key={choice}
                      type="button"
                      size="sm"
                      variant={observation === choice ? 'default' : 'outline'}
                      disabled={locked}
                      onClick={() => setObservation(observation === choice ? null : choice)}
                    >
                      {choice}
                    </Button>
                  ))}
                </div>
                {observation === 'Mastery' && query.data.masteredCount < 8 && (
                  <p className="mt-2 text-xs text-amber-700">Mastery is selected, and a competency is still No or blank.</p>
                )}
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={locked}
                  value={notes}
                  onChange={event => setNotes(event.target.value)}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={locked || save.isPending} onClick={() => save.mutate()}>
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setShowPreview(true); setPreviewKey(key => key + 1) }}>
                  Preview filled PDF
                </Button>
                <Button type="button" variant="outline" asChild>
                  <a href={`/api/students/${studentId}/results-sheet/pdf`}>Download</a>
                </Button>
                <Button type="button" variant="outline" asChild>
                  <a href={`/api/students/${studentId}/results-sheet/pdf?final=1`}>Download final</a>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={locked || finalize.isPending}
                  onClick={() => {
                    if (query.data?.status !== 'complete' && !window.confirm('This sheet is not complete. Finalize anyway?')) return
                    finalize.mutate()
                  }}
                >
                  Finalize
                </Button>
              </div>
            </CardContent>
          </Card>

          {showPreview && (
            <Card data-testid="rsep1-preview">
              <CardHeader>
                <CardTitle className="text-lg">Filled PDF preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <img
                  alt="Filled RSEP-1 results sheet, page 1"
                  className="w-full rounded border bg-white"
                  src={`/api/students/${studentId}/results-sheet/preview?page=1&k=${previewKey}`}
                />
                <img
                  alt="Filled RSEP-1 results sheet, page 2"
                  className="w-full rounded border bg-white"
                  src={`/api/students/${studentId}/results-sheet/preview?page=2&k=${previewKey}`}
                />
              </CardContent>
            </Card>
          )}

          <TheoryEvaluationsCard studentId={studentId} />
        </>
      )}
    </main>
  )
}
