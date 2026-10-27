'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  masteryFromGrade,
  theorySummary,
  theorySummaryLine,
  type Mastery,
} from '@/lib/rsep1/competencies'
import { todayToronto } from '@/lib/rsep1/values'

interface InstructorOption {
  id: string
  legalName: string
  displayName: string
}

interface TheoryRow {
  competency: string
  name: string
  gradePercent: number | null
  evaluatedOn: string | null
  evaluatorId: string | null
  mastery: Mastery
  updatedAt: string | null
  updatedByLabel: string | null
}

interface TheoryPayload {
  competencies: TheoryRow[]
  summaryLine: string
  locked: boolean
  finalizedAt: string | null
  revisionNo: number
  instructors: InstructorOption[]
  updatedAt: string | null
  updatedByLabel: string | null
}

interface DraftRow {
  competency: string
  name: string
  grade: string
  date: string
  evaluatorId: string
  updatedAt: string | null
}

function draftsFrom(rows: TheoryRow[]): DraftRow[] {
  return rows.map(row => ({
    competency: row.competency,
    name: row.name,
    grade: row.gradePercent == null ? '' : String(row.gradePercent),
    date: row.evaluatedOn || '',
    evaluatorId: row.evaluatorId || '',
    updatedAt: row.updatedAt,
  }))
}

function parsedGrade(value: string): number | null {
  if (value.trim() === '') return null
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= 100 ? numeric : null
}

export function TheoryEvaluationsCard({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<DraftRow[] | null>(null)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')

  const query = useQuery<TheoryPayload>({
    queryKey: ['theory-evaluations', studentId],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}/theory-evaluations`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message || body.error || 'Could not load theory evaluations')
      return body
    },
  })

  const serverStamp = query.data ? `${query.data.updatedAt ?? ''}:${query.data.revisionNo}:${query.data.locked}` : null
  if (query.data && serverStamp !== syncedAt) {
    setSyncedAt(serverStamp)
    setRows(draftsFrom(query.data.competencies))
  }

  const liveGrades = (rows || []).map(row => parsedGrade(row.grade))
  const liveLine = theorySummaryLine(theorySummary(liveGrades))
  const locked = !!query.data?.locked

  const dirty = useMemo(() => {
    if (!query.data || !rows) return false
    return rows.some((row, index) => {
      const saved = query.data!.competencies[index]
      const savedGrade = saved.gradePercent == null ? '' : String(saved.gradePercent)
      return row.grade !== savedGrade || row.date !== (saved.evaluatedOn || '') || row.evaluatorId !== (saved.evaluatorId || '')
    })
  }, [query.data, rows])

  const save = useMutation({
    mutationFn: async () => {
      if (!rows) return
      for (const row of rows) {
        const grade = parsedGrade(row.grade)
        if (row.grade.trim() !== '' && grade === null) {
          throw new Error(`${row.competency} needs a whole percent from 0 to 100`)
        }
        if (grade === null && row.date) {
          throw new Error(`${row.competency}: a date without a grade is not saved`)
        }
        if (row.date && row.date > todayToronto()) {
          throw new Error(`${row.competency}: the evaluation date cannot be in the future`)
        }
      }
      const res = await fetch(`/api/students/${studentId}/theory-evaluations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: rows.map(row => ({
            competency: row.competency,
            gradePercent: parsedGrade(row.grade),
            evaluatedOn: parsedGrade(row.grade) == null ? null : (row.date || null),
            evaluatorId: row.evaluatorId || null,
            expectedUpdatedAt: row.updatedAt,
          })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message || body.error || 'Save failed')
      return body
    },
    onSuccess: () => {
      setError('')
      queryClient.invalidateQueries({ queryKey: ['theory-evaluations', studentId] })
      queryClient.invalidateQueries({ queryKey: ['results-sheet', studentId] })
    },
    onError: (err: Error) => setError(err.message),
  })

  const reopen = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/students/${studentId}/results-sheet/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message || body.error || 'Could not reopen')
      return body
    },
    onSuccess: () => {
      setReason('')
      setError('')
      queryClient.invalidateQueries({ queryKey: ['theory-evaluations', studentId] })
      queryClient.invalidateQueries({ queryKey: ['results-sheet', studentId] })
    },
    onError: (err: Error) => setError(err.message),
  })

  const update = (competency: string, patch: Partial<DraftRow>) => {
    setRows(current => current?.map(row => row.competency === competency ? { ...row, ...patch } : row) || current)
  }

  return (
    <Card data-testid="theory-evaluations">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          Theory Evaluations (C1–C6)
          {locked && <Badge variant="secondary"><Lock className="mr-1 h-3 w-3" /> Finalized</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/40 px-3 py-2" data-testid="theory-summary">
          <p className="text-sm font-medium">{rows ? liveLine : (query.data?.summaryLine || 'Theory Evaluations')}</p>
          <p className="text-xs text-muted-foreground">Separate from attendance hours and from RSEP-1 completion.</p>
        </div>

        {query.isLoading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {query.isError && <p className="text-sm text-destructive">{(query.error as Error).message}</p>}

        {rows && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">Competency</th>
                  <th className="py-2 pr-2 font-medium">Grade</th>
                  <th className="py-2 pr-2 font-medium">Date</th>
                  <th className="py-2 pr-2 font-medium">Instructor</th>
                  <th className="py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const grade = parsedGrade(row.grade)
                  const mastery = row.grade.trim() !== '' && grade === null ? null : masteryFromGrade(grade)
                  return (
                    <tr key={row.competency} className="border-t" data-testid={`theory-row-${row.competency}`}>
                      <td className="py-2 pr-3">
                        <span className="font-medium">{row.competency}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{row.name}</span>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1">
                          <Input
                            aria-label={`${row.competency} grade`}
                            inputMode="numeric"
                            className="h-8 w-20"
                            disabled={locked}
                            value={row.grade}
                            onChange={event => {
                              const grade = event.target.value
                              update(row.competency, grade.trim() === '' ? { grade, date: '' } : { grade })
                            }}
                          />
                          <span className="text-muted-foreground">%</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <Input
                          aria-label={`${row.competency} date`}
                          type="date"
                          max={todayToronto()}
                          className="h-8 w-40"
                          disabled={locked || grade === null}
                          value={row.date}
                          onChange={event => update(row.competency, { date: event.target.value })}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          aria-label={`${row.competency} instructor`}
                          className="h-8 max-w-44 rounded-md border bg-background px-2 text-sm"
                          disabled={locked}
                          value={row.evaluatorId}
                          onChange={event => update(row.competency, { evaluatorId: event.target.value })}
                        >
                          <option value="">Optional</option>
                          {(query.data?.instructors || []).map(instructor => (
                            <option key={instructor.id} value={instructor.id}>
                              {instructor.legalName || instructor.displayName}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2">
                        {mastery === 'Yes' && <Badge className="bg-green-600">Mastery</Badge>}
                        {mastery === 'No' && <Badge variant="destructive">Needs work</Badge>}
                        {mastery === null && <span className="text-xs text-muted-foreground">Not recorded</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {locked && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <p>Finalized{query.data?.finalizedAt ? ` on ${new Date(query.data.finalizedAt).toLocaleString('en-CA', { timeZone: 'America/Toronto' })}` : ''} (revision {query.data?.revisionNo}). Reopen for correction.</p>
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label="Reopen reason"
                placeholder="Reason for reopening"
                value={reason}
                onChange={event => setReason(event.target.value)}
                className="h-8 max-w-md"
              />
              <Button type="button" variant="outline" size="sm" disabled={reopen.isPending || !reason.trim()} onClick={() => reopen.mutate()}>
                Reopen for correction
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" disabled={locked || save.isPending || !dirty} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
          {query.data?.updatedAt && (
            <p className="text-xs text-muted-foreground">
              Last saved {new Date(query.data.updatedAt).toLocaleString('en-CA', { timeZone: 'America/Toronto' })}
              {query.data.updatedByLabel ? ` by ${query.data.updatedByLabel}` : ''}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
