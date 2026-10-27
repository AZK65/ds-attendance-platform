'use client'

import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PhoneChangeEntry {
  id: string
  oldDisplay: string
  newDisplay: string
  actorLabel: string | null
  studentName: string | null
  recordsUpdated: string
  whatsappDetail: string | null
  whatsappRegistered: boolean | null
  duplicateWarning: string | null
  groupAction: string
  groupActionDetail: string | null
  createdAt: string
}

function summarizeRecords(raw: string): string {
  try {
    const records = JSON.parse(raw) as {
      updated?: Array<{ store: string }>
      created?: Array<{ store: string }>
      kept?: Array<{ store: string }>
      rosterNote?: string | null
    }
    const bits: string[] = []
    const updated = records.updated || []
    const created = records.created || []
    const kept = records.kept || []
    if (updated.some(row => row.store === 'roster')) bits.push('master roster')
    const students = updated.filter(row => row.store === 'student').length
    if (students === 1) bits.push('student record')
    if (students > 1) bits.push(`${students} student records`)
    if (created.some(row => row.store === 'contact')) bits.push('new WhatsApp contact')
    const reminders = updated.filter(row => row.store === 'scheduledMessage').length
    if (reminders === 1) bits.push('pending reminder')
    if (reminders > 1) bits.push(`${reminders} pending reminders`)
    if (kept.some(row => row.store === 'contact')) bits.push('old contact kept')
    if (records.rosterNote) bits.push(records.rosterNote)
    return bits.join(' · ') || 'Saved'
  } catch {
    return 'Saved'
  }
}

function groupActionLabel(entry: PhoneChangeEntry): string {
  if (entry.groupAction === 'invite') return 'Invite link sent'
  if (entry.groupAction === 'direct_add') {
    try {
      const detail = JSON.parse(entry.groupActionDetail || '{}') as { disconnected?: boolean }
      if (detail.disconnected) return 'Direct add disconnected WhatsApp — scan the QR code'
    } catch {
      // The label still names the action.
    }
    return 'Direct add attempted'
  }
  return 'No group message or add'
}

export function PhoneChangeHistory({
  externalStudentId,
  localStudentId,
  contactId,
  phone,
}: {
  externalStudentId?: number | null
  localStudentId?: string | null
  contactId?: string | null
  phone?: string | null
}) {
  const enabled = Boolean(externalStudentId || localStudentId || contactId || phone)
  const { data, isLoading } = useQuery<{ logs: PhoneChangeEntry[] }>({
    queryKey: ['phone-changes', externalStudentId ?? null, localStudentId ?? null, contactId ?? null, phone ?? null],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams()
      if (externalStudentId) params.set('externalStudentId', String(externalStudentId))
      if (localStudentId) params.set('localStudentId', localStudentId)
      if (contactId) params.set('contactId', contactId)
      if (phone) params.set('phone', phone)
      const res = await fetch(`/api/phone-change?${params}`)
      if (!res.ok) throw new Error('Could not load phone history')
      return res.json()
    },
  })

  if (!enabled) return null

  return (
    <Card data-testid="phone-change-history">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <History className="h-5 w-5" />
          Phone number history
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : !data?.logs.length ? (
          <p className="text-sm text-muted-foreground">No phone number changes yet.</p>
        ) : (
          <ol className="space-y-3">
            {data.logs.map(entry => (
              <li key={entry.id} className="rounded-lg border px-3 py-2">
                <p className="text-sm font-medium">
                  {entry.oldDisplay} → {entry.newDisplay}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                  {entry.actorLabel ? ` · ${entry.actorLabel}` : ''}
                </p>
                <p className="mt-1 text-sm">{summarizeRecords(entry.recordsUpdated)}</p>
                {entry.whatsappDetail && (
                  <p className="text-xs text-muted-foreground">{entry.whatsappDetail}</p>
                )}
                <p className="text-xs text-muted-foreground">{groupActionLabel(entry)}</p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
