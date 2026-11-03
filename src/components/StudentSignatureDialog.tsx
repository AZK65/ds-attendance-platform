'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SignaturePad as SignatureCanvas, type SignaturePadHandle } from '@/components/SignaturePad'
import { ALREADY_SIGNED_MESSAGE } from '@/lib/student-sign-now'
import { CheckCircle2, Download, Loader2, RotateCcw } from 'lucide-react'

export interface StudentSignTarget {
  eventId: string
  studentName: string
  phone: string | null
  sessionLabel: string
  subtitle: string
  moduleNumber: number | null
  sortieNumber: number | null
}

/**
 * The Sign-In Mode pad. The canvas is created empty on every open, so a
 * signature from another lesson is never copied or pre-filled. The student
 * confirms the name, then draws this lesson's signature.
 */
export function StudentSignatureDialog({
  target,
  onCancel,
  onSaved,
  onAlreadySigned,
}: {
  target: StudentSignTarget
  onCancel: () => void
  onSaved: () => void
  onAlreadySigned?: () => void
}) {
  const signatureRef = useRef<SignaturePadHandle>(null)
  const [studentName, setStudentName] = useState(target.studentName)
  const [hasInk, setHasInk] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const phone = target.phone

  const clear = () => {
    signatureRef.current?.clear()
  }

  const save = async () => {
    const name = studentName.trim()
    if (!name) {
      setError('Enter the student name, then sign.')
      return
    }
    if (!hasInk) {
      setError('Please sign in the box before saving.')
      return
    }
    if (!phone) {
      setError('No phone number for this student — cannot save.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const dataUrl = signatureRef.current?.toDataUrl()
      if (!dataUrl) throw new Error('Please sign in the box before saving.')
      const res = await fetch('/api/scheduling/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: target.eventId,
          studentPhone: phone,
          studentName: name,
          signatureDataUrl: dataUrl,
          sessionLabel: target.sessionLabel,
          moduleNumber: target.moduleNumber,
          sortieNumber: target.sortieNumber,
        }),
      })
      if (res.status === 409) {
        setError(ALREADY_SIGNED_MESSAGE)
        onAlreadySigned?.()
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Save failed (${res.status})`)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent className="sm:max-w-2xl" data-testid="student-signature-pad">
        <DialogHeader>
          <DialogTitle>Sign In — {studentName.trim() || 'Student'}</DialogTitle>
          <DialogDescription>{target.subtitle}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="student-sign-name">Student name</Label>
            <Input
              id="student-sign-name"
              value={studentName}
              autoComplete="name"
              onChange={(event) => {
                setStudentName(event.target.value)
                if (error) setError(null)
              }}
            />
          </div>
          <SignatureCanvas
            ref={signatureRef}
            height={256}
            strokeColor="#0f172a"
            strokeWidth={2.4}
            placeholder="Sign inside this box"
            className="border-dashed bg-muted/20"
            onChange={(dataUrl) => {
              setHasInk(!!dataUrl)
              if (dataUrl) setError(null)
            }}
          />
          {error && <p className="text-sm text-destructive" data-testid="student-signature-error">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={clear} disabled={!hasInk || saving}>
              <RotateCcw className="h-4 w-4 mr-1" /> Clear
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={!hasInk || saving} className="min-w-[100px]">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Save</>}
              </Button>
            </div>
          </div>
          {phone && (
            <a
              href={`/api/scheduling/signature/pdf?phone=${encodeURIComponent(phone)}`}
              target="_blank"
              rel="noopener"
              className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
            >
              <Download className="h-3 w-3" /> Download this student&apos;s booklet PDF
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
