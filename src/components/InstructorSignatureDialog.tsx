'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CheckCircle2, Loader2, RotateCcw } from 'lucide-react'
import { SignaturePad as SignatureCanvas, type SignaturePadHandle } from '@/components/SignaturePad'

interface InstructorOption {
  id: string
  legalName: string
  bookletName: string | null
  displayName: string
  saaqInstructorNo: string | null
  teamupSubcalendarId: number | null
}

export function instructorFullName(instructor: Pick<InstructorOption, 'bookletName' | 'legalName' | 'displayName'>): string {
  return instructor.bookletName?.trim() || instructor.legalName.trim() || instructor.displayName
}

export function InstructorSignatureDialog({
  open,
  onClose,
  onSaved,
  eventId,
  studentPhones,
  suggestSubcalendarId,
  defaultInstructorId,
  addedLater,
  title,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  eventId: string
  studentPhones: string[]
  suggestSubcalendarId?: number | null
  defaultInstructorId?: string | null
  addedLater?: boolean
  title?: string
}) {
  const queryClient = useQueryClient()
  const signatureRef = useRef<SignaturePadHandle>(null)
  const [instructorId, setInstructorId] = useState('')
  const [hasInk, setHasInk] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery<{ instructors: InstructorOption[]; suggestedInstructorId: string | null }>({
    queryKey: ['instructor-signoff-choices', eventId, suggestSubcalendarId || ''],
    queryFn: async () => {
      const params = new URLSearchParams({ eventId })
      if (suggestSubcalendarId) params.set('suggestSubcalendarId', String(suggestSubcalendarId))
      const res = await fetch(`/api/scheduling/instructor-signature?${params}`)
      if (!res.ok) throw new Error('Failed to load instructors')
      return res.json()
    },
    enabled: open && !!eventId,
  })

  useEffect(() => {
    if (!open) return
    const suggested = defaultInstructorId || data?.suggestedInstructorId || data?.instructors[0]?.id || ''
    setInstructorId(suggested)
    setHasInk(false)
    setError(null)
    signatureRef.current?.clear()
  }, [open, defaultInstructorId, data?.suggestedInstructorId, data?.instructors])

  const selected = data?.instructors.find(row => row.id === instructorId)
  const selectedName = selected ? instructorFullName(selected) : 'instructor'

  const save = async () => {
    if (!hasInk) {
      setError('Please sign in the box before saving.')
      return
    }
    if (!instructorId) {
      setError('Choose the instructor who taught this lesson.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const dataUrl = signatureRef.current?.toDataUrl()
      if (!dataUrl) throw new Error('Please sign in the box before saving.')
      const res = await fetch('/api/scheduling/instructor-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          studentPhones,
          signatureDataUrl: dataUrl,
          instructorId,
          addedLater: addedLater === true,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setError('already signed')
        return
      }
      if (!res.ok) throw new Error(payload.error || `Save failed (${res.status})`)
      await queryClient.invalidateQueries({ queryKey: ['instructor-signatures'] })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title || `Instructor signature — ${selectedName}`}</DialogTitle>
          <DialogDescription>
            {addedLater
              ? 'This lesson was already signed by the student. The date this instructor signature was added is kept on the record.'
              : studentPhones.length > 1
                ? `One drawing is saved for ${studentPhones.length} students who signed this lesson.`
                : 'Draw the instructor signature for this lesson.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (data?.instructors.length || 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Add an instructor in Settings → Instructors first.</p>
          ) : (
            <>
              <label className="block text-sm">
                <span className="text-muted-foreground">Instructor</span>
                <select
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={instructorId}
                  onChange={event => setInstructorId(event.target.value)}
                >
                  {data?.instructors.map(row => (
                    <option key={row.id} value={row.id}>
                      {instructorFullName(row)}{row.saaqInstructorNo ? ` · No. ${row.saaqInstructorNo}` : ' · Pending'}
                      {row.displayName ? ` (${row.displayName})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <SignatureCanvas
                ref={signatureRef}
                height={220}
                strokeColor="#0f172a"
                strokeWidth={2.4}
                placeholder="Instructor signs inside this box"
                className="border-dashed bg-muted/20"
                onChange={(dataUrl) => {
                  setHasInk(!!dataUrl)
                  if (dataUrl) setError(null)
                }}
              />
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => { signatureRef.current?.clear(); setHasInk(false) }} disabled={!hasInk || saving}>
              <RotateCcw className="h-4 w-4 mr-1" /> Clear
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={!hasInk || saving || !instructorId}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Save</>}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
