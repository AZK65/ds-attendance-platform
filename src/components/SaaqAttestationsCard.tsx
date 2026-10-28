'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Eye, FileBadge, Loader2, Pencil, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface FileItem {
  id: string
  version: number
  originalName: string
  mimeType: string
  sizeBytes: number
  sha256: string
  uploadedAt: string
  action: 'uploaded' | 'replaced' | 'removed'
  actionAt: string
  replaceReason: string | null
  deletedReason: string | null
  available: boolean
}

interface DateChange {
  at: string
  before: string | null
  after: string | null
  reason: string
}

interface Slot {
  kind: 'theory' | 'practical'
  status: 'not_received' | 'received'
  receivedOn: string | null
  current: FileItem | null
  history: FileItem[]
  dateChanges: DateChange[]
}

interface Overview {
  externalStudentId: number
  today: string
  slots: { theory: Slot; practical: Slot }
}

const ACTION_LABEL: Record<FileItem['action'], string> = {
  uploaded: 'Uploaded',
  replaced: 'Replaced',
  removed: 'Removed',
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Toronto' })
}

function formatDay(ymd: string | null) {
  if (!ymd) return '—'
  const [year, month, day] = ymd.split('-').map(Number)
  if (!year || !month || !day) return ymd
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileHref(studentId: string, fileId: string, download = false) {
  const base = `/api/students/${encodeURIComponent(studentId)}/saaq-attestations/files/${fileId}`
  return download ? `${base}?download=1` : base
}

async function errorMessage(response: Response) {
  const body = await response.json().catch(() => ({})) as { message?: string; error?: string }
  return body.message || body.error || 'Something went wrong'
}

export function SaaqAttestationsCard({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient()
  const query = useQuery<Overview>({
    queryKey: ['saaq-attestations', studentId],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}/saaq-attestations`)
      if (!res.ok) throw new Error(await errorMessage(res))
      return res.json()
    },
  })

  const save = (view: Overview) => {
    queryClient.setQueryData(['saaq-attestations', studentId], view)
  }

  return (
    <Card data-testid="saaq-attestations-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileBadge className="h-5 w-5" /> SAAQ Attestations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Stored copy of the SAAQ-issued document. Does not change exam eligibility.
        </p>
        {query.isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {query.isError && <p className="text-sm text-destructive">{(query.error as Error).message}</p>}
        {query.data && (
          <div className="grid gap-4 md:grid-cols-2">
            <SlotPanel studentId={studentId} slot={query.data.slots.theory} today={query.data.today} onSaved={save} />
            <SlotPanel studentId={studentId} slot={query.data.slots.practical} today={query.data.today} onSaved={save} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SlotPanel({
  studentId,
  slot,
  today,
  onSaved,
}: {
  studentId: string
  slot: Slot
  today: string
  onSaved: (view: Overview) => void
}) {
  const [uploadOpen, setUploadOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null)
  const title = slot.kind === 'theory' ? 'Theory Attestation' : 'Practical Attestation'
  const received = slot.status === 'received'
  const replacing = Boolean(slot.current)

  return (
    <section className="space-y-3 rounded-lg border p-4" data-testid={`saaq-slot-${slot.kind}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge
          variant={received ? 'default' : 'secondary'}
          className={received ? 'border-green-200 bg-green-100 text-green-800' : undefined}
          data-testid={`saaq-status-${slot.kind}`}
        >
          {received ? 'Received' : 'Not received'}
        </Badge>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Date received</span>
        <span data-testid={`saaq-date-value-${slot.kind}`}>{received ? formatDay(slot.receivedOn) : '—'}</span>
        {received && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => setDateOpen(true)}
            data-testid={`saaq-date-${slot.kind}`}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </div>

      {slot.current && (
        <>
          <p className="text-xs text-muted-foreground">Uploaded · {formatWhen(slot.current.uploadedAt)}</p>
          <FileFacts file={slot.current} />
        </>
      )}
      {slot.current && !slot.current.available && (
        <p className="text-xs text-destructive">The saved file is missing from disk. You can remove the record.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {!replacing && (
          <Button type="button" size="sm" onClick={() => setUploadOpen(true)} data-testid={`saaq-upload-${slot.kind}`}>
            <Upload className="h-4 w-4" /> Upload
          </Button>
        )}
        {slot.current?.available && (
          <>
            <Button size="sm" variant="outline" asChild>
              <a href={fileHref(studentId, slot.current.id)} target="_blank" rel="noopener" data-testid={`saaq-view-${slot.kind}`}>
                <Eye className="h-4 w-4" /> View
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={fileHref(studentId, slot.current.id, true)} data-testid={`saaq-download-${slot.kind}`}>
                <Download className="h-4 w-4" /> Download
              </a>
            </Button>
          </>
        )}
        {replacing && (
          <Button type="button" size="sm" variant="outline" onClick={() => setUploadOpen(true)} data-testid={`saaq-replace-${slot.kind}`}>
            Replace
          </Button>
        )}
        {slot.current && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={() => setDeleteTarget(slot.current)}
            data-testid={`saaq-delete-${slot.kind}`}
          >
            Delete
          </Button>
        )}
      </div>

      {slot.current?.mimeType === 'image/heic' && (
        <p className="text-xs text-muted-foreground">HEIC preview may not open in this browser. Download still works.</p>
      )}

      {slot.dateChanges.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground" data-testid={`saaq-date-log-${slot.kind}`}>
          {slot.dateChanges.map(change => (
            <li key={`${change.at}-${change.reason}`}>
              Date changed {formatWhen(change.at)}: {formatDay(change.before)} → {formatDay(change.after)}. {change.reason}
            </li>
          ))}
        </ul>
      )}

      <div data-testid={`saaq-history-${slot.kind}`}>
        <p className="text-xs font-medium">History ({slot.history.length})</p>
        {slot.history.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">No earlier versions.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {slot.history.map(file => (
              <li key={file.id} className="rounded-md border border-dashed p-2 text-xs">
                <p className="font-medium">
                  {ACTION_LABEL[file.action]} · {formatWhen(file.actionAt)}
                </p>
                {file.action !== 'uploaded' && (
                  <p className="text-muted-foreground">Uploaded · {formatWhen(file.uploadedAt)}</p>
                )}
                <FileFacts file={file} />
                {file.replaceReason && <p className="mt-1 text-muted-foreground">Replace reason: {file.replaceReason}</p>}
                {file.deletedReason && <p className="mt-1 text-muted-foreground">Delete reason: {file.deletedReason}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {file.available && (
                    <>
                      <Button size="sm" variant="outline" className="h-7" asChild>
                        <a href={fileHref(studentId, file.id)} target="_blank" rel="noopener">View</a>
                      </Button>
                      <Button size="sm" variant="outline" className="h-7" asChild>
                        <a href={fileHref(studentId, file.id, true)}>Download</a>
                      </Button>
                    </>
                  )}
                  {file.available && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-destructive"
                      onClick={() => setDeleteTarget(file)}
                    >
                      Remove file
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <UploadDialog
        open={uploadOpen}
        kind={slot.kind}
        title={title}
        replacing={replacing}
        today={today}
        studentId={studentId}
        onOpenChange={setUploadOpen}
        onSaved={onSaved}
      />
      <DateDialog
        open={dateOpen}
        kind={slot.kind}
        title={title}
        current={slot.receivedOn}
        today={today}
        studentId={studentId}
        onOpenChange={setDateOpen}
        onSaved={onSaved}
      />
      <DeleteDialog
        target={deleteTarget}
        currentId={slot.current?.id || null}
        studentId={studentId}
        onOpenChange={open => { if (!open) setDeleteTarget(null) }}
        onSaved={onSaved}
      />
    </section>
  )
}

function FileFacts({ file }: { file: FileItem }) {
  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      <p className="break-all text-foreground">{file.originalName}</p>
      <p>{formatSize(file.sizeBytes)} · version {file.version}</p>
      <p className="break-all font-mono" title={file.sha256}>{file.sha256}</p>
    </div>
  )
}

function UploadDialog({
  open,
  kind,
  title,
  replacing,
  today,
  studentId,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  kind: Slot['kind']
  title: string
  replacing: boolean
  today: string
  studentId: string
  onOpenChange: (open: boolean) => void
  onSaved: (view: Overview) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [receivedOn, setReceivedOn] = useState(today)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setFile(null)
    setReceivedOn(today)
    setReason('')
    setError('')
  }, [open, today])

  const submit = async () => {
    if (!file) {
      setError('Choose a file')
      return
    }
    if (replacing && !reason.trim()) {
      setError('A reason is required to replace the file')
      return
    }
    setBusy(true)
    setError('')
    const form = new FormData()
    form.set('kind', kind)
    form.set('file', file)
    form.set('receivedOn', receivedOn)
    if (reason.trim()) form.set('reason', reason.trim())
    try {
      const res = await fetch(`/api/students/${studentId}/saaq-attestations`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(await errorMessage(res))
      onSaved(await res.json())
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="saaq-upload-dialog">
        <DialogHeader>
          <DialogTitle>{replacing ? `Replace ${title}` : `Upload ${title}`}</DialogTitle>
          <DialogDescription>
            PDF, JPG, PNG, WebP, or HEIC. 10 MB maximum. The file is stored exactly as uploaded.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`saaq-file-${kind}`}>File</Label>
            <Input
              id={`saaq-file-${kind}`}
              key={open ? 'open' : 'closed'}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic"
              onChange={event => setFile(event.target.files?.[0] || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`saaq-received-${kind}`}>Date received</Label>
            <Input
              id={`saaq-received-${kind}`}
              type="date"
              max={today}
              value={receivedOn}
              onChange={event => setReceivedOn(event.target.value)}
            />
          </div>
          {replacing && (
            <div className="space-y-1.5">
              <Label htmlFor={`saaq-replace-reason-${kind}`}>Reason for replacing</Label>
              <Textarea
                id={`saaq-replace-reason-${kind}`}
                value={reason}
                onChange={event => setReason(event.target.value)}
                maxLength={500}
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={busy || !file || (replacing && !reason.trim())}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {replacing ? 'Replace' : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DateDialog({
  open,
  kind,
  title,
  current,
  today,
  studentId,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  kind: Slot['kind']
  title: string
  current: string | null
  today: string
  studentId: string
  onOpenChange: (open: boolean) => void
  onSaved: (view: Overview) => void
}) {
  const [receivedOn, setReceivedOn] = useState(current || today)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setReceivedOn(current || today)
    setReason('')
    setError('')
  }, [open, current, today])

  const submit = async () => {
    if (!reason.trim()) {
      setError('A reason is required')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/students/${studentId}/saaq-attestations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, receivedOn, reason: reason.trim() }),
      })
      if (!res.ok) throw new Error(await errorMessage(res))
      onSaved(await res.json())
      onOpenChange(false)
      setReason('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the date')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="saaq-date-dialog">
        <DialogHeader>
          <DialogTitle>Edit date received</DialogTitle>
          <DialogDescription>
            {title}. The previous date, the new date, the time, and your reason are kept.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`saaq-edit-date-${kind}`}>Date received</Label>
            <Input
              id={`saaq-edit-date-${kind}`}
              type="date"
              max={today}
              value={receivedOn}
              onChange={event => setReceivedOn(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`saaq-date-reason-${kind}`}>Reason</Label>
            <Textarea
              id={`saaq-date-reason-${kind}`}
              value={reason}
              onChange={event => setReason(event.target.value)}
              maxLength={500}
              data-testid="saaq-date-reason"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={busy || !reason.trim()} data-testid="saaq-date-save">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save date
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteDialog({
  target,
  currentId,
  studentId,
  onOpenChange,
  onSaved,
}: {
  target: FileItem | null
  currentId: string | null
  studentId: string
  onOpenChange: (open: boolean) => void
  onSaved: (view: Overview) => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isCurrent = Boolean(target && target.id === currentId)

  const submit = async () => {
    if (!target || !reason.trim()) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/students/${studentId}/saaq-attestations`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: target.id, reason: reason.trim() }),
      })
      if (!res.ok) throw new Error(await errorMessage(res))
      onSaved(await res.json())
      setReason('')
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the file')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={next => {
        if (!next) {
          setReason('')
          setError('')
        }
        onOpenChange(next)
      }}
    >
      <DialogContent data-testid="saaq-delete-dialog">
        <DialogHeader>
          <DialogTitle>Remove this file?</DialogTitle>
          <DialogDescription>
            {isCurrent
              ? 'The file is deleted from disk. This slot goes back to Not received. An older version is not brought back. The history keeps the file name, size, hash, time, and your reason.'
              : 'The file is deleted from disk. The history line stays, with the file name, size, hash, time, and your reason. The current attestation is left as it is.'}
          </DialogDescription>
        </DialogHeader>
        {target && (
          <p className="break-all text-sm">{target.originalName}</p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="saaq-delete-reason">Reason</Label>
          <Textarea
            id="saaq-delete-reason"
            value={reason}
            onChange={event => setReason(event.target.value)}
            maxLength={500}
            data-testid="saaq-delete-reason"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button
            type="button"
            variant="destructive"
            onClick={submit}
            disabled={busy || !reason.trim()}
            data-testid="saaq-delete-confirm"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Remove file
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
