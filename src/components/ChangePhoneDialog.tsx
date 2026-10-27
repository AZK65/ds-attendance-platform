'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Loader2, Phone, WifiOff, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface ChangePhoneSubject {
  oldPhone?: string | null
  name?: string | null
  externalStudentId?: number | null
  localStudentId?: string | null
  contactId?: string | null
}

interface WhatsAppCheck {
  status: 'registered' | 'not_registered' | 'unavailable'
  jid?: string | null
  detail: string
}

interface PhoneDuplicate {
  kind: 'roster' | 'student' | 'contact'
  id: string
  name: string | null
  phone: string
}

interface PersonGroup {
  id: string
  name: string
}

interface Preview {
  sameNumber: boolean
  normalized: { digits: string; display: string }
  duplicates: PhoneDuplicate[]
  groups: PersonGroup[]
  rosterChecked: boolean
  whatsapp: WhatsAppCheck | null
}

interface ApplyResult {
  logId: string
  display: string
  newPhone: string
  groups: PersonGroup[]
  duplicates: PhoneDuplicate[]
  whatsapp: WhatsAppCheck | null
}

interface GroupResult {
  groupId: string
  groupName: string
  success: boolean
  error?: string
  disconnected?: boolean
  inviteSent?: boolean
}

const duplicateLabel: Record<PhoneDuplicate['kind'], string> = {
  roster: 'Roster student',
  student: 'Student record',
  contact: 'WhatsApp contact',
}

export function ChangePhoneDialog({
  open,
  onOpenChange,
  subject,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subject: ChangePhoneSubject | null
  onChanged?: (newPhone: string) => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [checking, setChecking] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [done, setDone] = useState<ApplyResult | null>(null)
  const [choice, setChoice] = useState<'none' | 'invite' | 'direct_add'>('none')
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [directAck, setDirectAck] = useState(false)
  const [groupWorking, setGroupWorking] = useState(false)
  const [groupMessage, setGroupMessage] = useState<string | null>(null)
  const [groupDisconnected, setGroupDisconnected] = useState(false)
  const [groupResults, setGroupResults] = useState<GroupResult[] | null>(null)

  useEffect(() => {
    if (!open) return
    setDraft('')
    setPreview(null)
    setChecking(false)
    setPreviewError(null)
    setSaving(false)
    setSaveError(null)
    setDone(null)
    setChoice('none')
    setSelectedGroups([])
    setDirectAck(false)
    setGroupWorking(false)
    setGroupMessage(null)
    setGroupDisconnected(false)
    setGroupResults(null)
  }, [open, subject?.contactId, subject?.externalStudentId, subject?.oldPhone])

  useEffect(() => {
    if (!open || !subject || done) return
    const digits = draft.replace(/\D/g, '')
    if (digits.length < 10) {
      setPreview(null)
      setPreviewError(null)
      setChecking(false)
      return
    }
    const controller = new AbortController()
    setChecking(true)
    setPreviewError(null)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/phone-change/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            oldPhone: subject.oldPhone,
            newPhone: draft,
            externalStudentId: subject.externalStudentId ?? null,
            localStudentId: subject.localStudentId ?? null,
            contactId: subject.contactId ?? null,
            name: subject.name ?? null,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not check that number')
        setPreview(data)
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        setPreview(null)
        setPreviewError(error instanceof Error ? error.message : 'Could not check that number')
      } finally {
        setChecking(false)
      }
    }, 500)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [draft, open, subject, done])

  const confirm = async () => {
    if (!subject || !preview || preview.sameNumber) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/phone-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPhone: subject.oldPhone,
          newPhone: draft,
          externalStudentId: subject.externalStudentId ?? null,
          localStudentId: subject.localStudentId ?? null,
          contactId: subject.contactId ?? null,
          name: subject.name ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not change that phone number')
      setDone(data)
      setSelectedGroups((data.groups || []).map((group: PersonGroup) => group.id))
      setChoice('none')
      onChanged?.(data.newPhone)
      queryClient.invalidateQueries({ queryKey: ['phone-changes'] })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not change that phone number')
    } finally {
      setSaving(false)
    }
  }

  const runGroupAction = async () => {
    if (!done || choice === 'none') {
      onOpenChange(false)
      return
    }
    setGroupWorking(true)
    setGroupMessage(null)
    setGroupDisconnected(false)
    try {
      const res = await fetch(`/api/phone-change/${done.logId}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: choice, groupIds: selectedGroups }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not update the groups')
      setGroupResults(data.results || [])
      setGroupDisconnected(Boolean(data.disconnected))
      setGroupMessage(data.message || null)
      queryClient.invalidateQueries({ queryKey: ['phone-changes'] })
      queryClient.invalidateQueries({ queryKey: ['group'] })
    } catch (error) {
      setGroupMessage(error instanceof Error ? error.message : 'Could not update the groups')
    } finally {
      setGroupWorking(false)
    }
  }

  const whatsapp = preview?.whatsapp
  const groups = done?.groups || []
  const canConfirm = Boolean(preview && !preview.sameNumber && !checking && !saving)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="change-phone-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Change phone number
          </DialogTitle>
          <DialogDescription>
            {subject?.name ? `Update the number for ${subject.name}.` : 'Update the number saved for this person.'}
            {' '}Invoices, attendance, signed contracts, class signatures, and issued certificates stay as they are.
          </DialogDescription>
        </DialogHeader>

        {!done ? (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">Current number</p>
              <p className="text-sm font-medium">{subject?.oldPhone || 'Saved on the contact'}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-phone">New number</Label>
              <Input
                id="new-phone"
                data-testid="new-phone-input"
                value={draft}
                onChange={event => setDraft(event.target.value)}
                placeholder="514-546-0150"
                inputMode="tel"
                autoFocus
              />
            </div>

            {checking && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking WhatsApp and other records…
              </p>
            )}

            {previewError && (
              <p className="text-sm text-destructive">{previewError}</p>
            )}

            {preview?.sameNumber && (
              <p className="text-sm text-amber-700">That is already the number on file.</p>
            )}

            {whatsapp && (
              <div
                data-testid="whatsapp-check-result"
                className={`rounded-lg border px-3 py-2 text-sm ${
                  whatsapp.status === 'registered'
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : whatsapp.status === 'not_registered'
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                <p className="flex items-center gap-2 font-medium">
                  {whatsapp.status === 'registered' && <CheckCircle2 className="h-4 w-4" />}
                  {whatsapp.status === 'not_registered' && <XCircle className="h-4 w-4" />}
                  {whatsapp.status === 'unavailable' && <WifiOff className="h-4 w-4" />}
                  {whatsapp.status === 'registered' && 'On WhatsApp'}
                  {whatsapp.status === 'not_registered' && 'Not on WhatsApp'}
                  {whatsapp.status === 'unavailable' && 'WhatsApp check unavailable'}
                </p>
                <p className="mt-1">{whatsapp.detail}</p>
                {preview && <p className="mt-1 text-xs opacity-80">Will be saved as {preview.normalized.display}</p>}
              </div>
            )}

            {preview && !preview.rosterChecked && (
              <p className="text-sm text-amber-800">The master roster could not be checked for duplicates.</p>
            )}

            {preview && preview.duplicates.length > 0 && (
              <div data-testid="duplicate-warning" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  Another record already has this number
                </p>
                <ul className="mt-2 space-y-1">
                  {preview.duplicates.map(duplicate => (
                    <li key={`${duplicate.kind}-${duplicate.id}`}>
                      {duplicateLabel[duplicate.kind]}
                      {duplicate.name ? `: ${duplicate.name}` : ''}
                      {' '}({duplicate.phone})
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">You can still change it. The other record is left as it is.</p>
              </div>
            )}

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
              <Button data-testid="confirm-phone-change" onClick={confirm} disabled={!canConfirm}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {preview && preview.duplicates.length > 0 ? 'Change number anyway' : 'Change number'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4" data-testid="group-add-options">
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
              <p className="font-medium">Number saved as {done.display}</p>
              <p className="mt-1">Nothing has been sent to the student.</p>
            </div>

            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This person is not in a WhatsApp group in the app.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Add {done.display} to their class group{groups.length > 1 ? 's' : ''}?</p>
                  <Choice
                    pressed={choice === 'none'}
                    title="Leave the groups alone"
                    body="Default. No message is sent and nobody is added."
                    onClick={() => setChoice('none')}
                  />
                  <Choice
                    pressed={choice === 'invite'}
                    title="Send the invite link"
                    body="Sends the usual private WhatsApp message with the group link. The student has to tap it to join."
                    onClick={() => setChoice('invite')}
                  />
                  <Choice
                    pressed={choice === 'direct_add'}
                    title="Add them directly"
                    body="Tries to put the new number in the group without sending a message."
                    onClick={() => setChoice('direct_add')}
                  />
                </div>

                {choice === 'direct_add' && (
                  <div data-testid="direct-add-warning" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950">
                    <p className="flex items-center gap-2 font-medium">
                      <AlertTriangle className="h-4 w-4" />
                      This can log the school WhatsApp out
                    </p>
                    <p className="mt-1">
                      If the student&apos;s privacy settings reject the add (WhatsApp error 403), the linked phone is signed out.
                      Someone then has to open Connect and scan the QR code before WhatsApp works again.
                      This makes one attempt and does not fall back to an invite message.
                    </p>
                    <label className="mt-3 flex items-start gap-2">
                      <Checkbox
                        checked={directAck}
                        onCheckedChange={value => setDirectAck(value === true)}
                        data-testid="direct-add-ack"
                      />
                      <span>I understand the school WhatsApp may need a new QR scan.</span>
                    </label>
                  </div>
                )}

                {choice !== 'none' && (
                  <div className="space-y-1">
                    {groups.map(group => (
                      <label key={group.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={selectedGroups.includes(group.id)}
                          onCheckedChange={value => {
                            setSelectedGroups(current => value === true
                              ? [...current, group.id]
                              : current.filter(id => id !== group.id))
                          }}
                        />
                        <span>{group.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}

            {groupDisconnected && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950" data-testid="whatsapp-disconnected">
                <p className="font-medium">WhatsApp disconnected</p>
                <p className="mt-1">{groupMessage}</p>
              </div>
            )}
            {groupMessage && !groupDisconnected && (
              <p className="text-sm text-muted-foreground">{groupMessage}</p>
            )}
            {groupResults && groupResults.length > 0 && (
              <ul className="space-y-1 text-sm">
                {groupResults.map(result => (
                  <li key={result.groupId}>
                    {result.groupName}: {result.success ? (result.inviteSent ? 'invite sent' : 'added') : (result.error || 'failed')}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={groupWorking}>
                {groupResults ? 'Close' : 'Done'}
              </Button>
              {!groupResults && groups.length > 0 && choice !== 'none' && (
                <Button
                  data-testid="confirm-group-action"
                  onClick={runGroupAction}
                  disabled={groupWorking || selectedGroups.length === 0 || (choice === 'direct_add' && !directAck)}
                  variant={choice === 'direct_add' ? 'destructive' : 'default'}
                >
                  {groupWorking && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {choice === 'invite' ? 'Send invite link' : 'Add directly'}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Choice({
  pressed,
  title,
  body,
  onClick,
}: {
  pressed: boolean
  title: string
  body: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-2 text-left ${
        pressed ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/50'
      }`}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{body}</p>
    </button>
  )
}
