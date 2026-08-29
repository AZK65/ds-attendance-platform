'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, Clock, Loader2, RefreshCw, Save } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ScheduleEvent {
  id: string
  title: string
  start_dt: string
  end_dt: string
  notes?: string
  subcalendar_ids?: number[]
  moduleNumber: number | null
  sessionNumber: number | null
  totalSessions: number | null
  isTruck: boolean
}

interface ReminderInfo {
  teamupEventId: string | null
  classDateISO: string | null
  classTime: string | null
  scheduledAt: string
}

interface ScheduleResponse {
  events: ScheduleEvent[]
  reminders: Record<string, ReminderInfo>
}

interface Teacher {
  id: number
  name: string
  active: boolean
}

function timeValue(iso: string): string {
  return iso.slice(11, 16)
}

function dateValue(iso: string): string {
  return iso.slice(0, 10)
}

function ScheduleRow({
  event,
  reminder,
  teachers,
  groupId,
}: {
  event: ScheduleEvent
  reminder?: ReminderInfo
  teachers: Teacher[]
  groupId: string
}) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(dateValue(event.start_dt))
  const [startTime, setStartTime] = useState(timeValue(event.start_dt))
  const [endTime, setEndTime] = useState(timeValue(event.end_dt))
  const [subcalendarId, setSubcalendarId] = useState(String(event.subcalendar_ids?.[0] || ''))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const changed = date !== dateValue(event.start_dt)
    || startTime !== timeValue(event.start_dt)
    || endTime !== timeValue(event.end_dt)
    || subcalendarId !== String(event.subcalendar_ids?.[0] || '')

  const label = event.isTruck
    ? event.sessionNumber ? `Session ${event.sessionNumber}${event.totalSessions ? ` of ${event.totalSessions}` : ''}` : 'Class 1 theory'
    : event.moduleNumber ? `Module ${event.moduleNumber}` : 'Theory class'

  const save = async () => {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: String(event.id),
          date,
          startTime,
          endTime,
          subcalendarId: subcalendarId ? Number(subcalendarId) : undefined,
          notifyGroup: true,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Schedule update failed')
      setSaved(true)
      await queryClient.invalidateQueries({ queryKey: ['group-schedule', groupId] })
      await queryClient.invalidateQueries({ queryKey: ['group-next-theory'] })
      setTimeout(() => setSaved(false), 3500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Schedule update failed')
    } finally {
      setSaving(false)
    }
  }

  const reminderLabel = reminder
    ? new Date(reminder.scheduledAt).toLocaleString('en-US', {
        timeZone: 'America/Toronto',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold">{label}</p>
            <Badge variant="outline" className="font-normal">Teamup</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{event.title}</p>
        </div>
        {reminderLabel ? (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" /> Reminder {reminderLabel}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">No pending reminder</Badge>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="col-span-2 md:col-span-1 space-y-1.5">
          <Label htmlFor={`date-${event.id}`}>Day</Label>
          <Input id={`date-${event.id}`} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`start-${event.id}`}>Starts</Label>
          <Input id={`start-${event.id}`} type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`end-${event.id}`}>Ends</Label>
          <Input id={`end-${event.id}`} type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
        </div>
        <div className="col-span-2 md:col-span-1 space-y-1.5">
          <Label htmlFor={`teacher-${event.id}`}>Teacher calendar</Label>
          <select
            id={`teacher-${event.id}`}
            value={subcalendarId}
            onChange={e => setSubcalendarId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Keep current</option>
            {teachers.filter(teacher => teacher.active).map(teacher => (
              <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Saving updates Teamup, replaces the WhatsApp reminder, and tells the group about the new schedule.
        </p>
        <Button onClick={save} disabled={!changed || saving} className="shrink-0">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          {saved ? 'Updated' : 'Save changes'}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}

export function GroupScheduleDialog({
  groupId,
  groupName,
  open,
  onOpenChange,
}: {
  groupId: string
  groupName: string
  vehicleType: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const scheduleQuery = useQuery<ScheduleResponse>({
    queryKey: ['group-schedule', groupId],
    queryFn: async () => {
      const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/schedule`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not load schedule')
      return data
    },
    enabled: open,
    staleTime: 0,
  })
  const teachersQuery = useQuery<Teacher[]>({
    queryKey: ['scheduling-subcalendars'],
    queryFn: async () => {
      const response = await fetch('/api/scheduling/subcalendars')
      return response.ok ? response.json() : []
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" /> Group schedule
              </DialogTitle>
              <DialogDescription className="mt-1">
                Change the day, time, or teacher for {groupName}. Upcoming classes stay synchronized with Teamup and WhatsApp.
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => scheduleQuery.refetch()} disabled={scheduleQuery.isFetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${scheduleQuery.isFetching ? 'animate-spin' : ''}`} /> Sync
            </Button>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto pr-1 space-y-3">
          {scheduleQuery.isLoading ? (
            <div className="py-16 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3" /> Loading Teamup schedule…
            </div>
          ) : scheduleQuery.error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {scheduleQuery.error instanceof Error ? scheduleQuery.error.message : 'Could not load schedule'}
            </div>
          ) : !scheduleQuery.data?.events.length ? (
            <div className="py-16 text-center text-muted-foreground">
              <CalendarDays className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p className="font-medium text-foreground">No upcoming group classes</p>
              <p className="text-sm mt-1">No matching future events were found in Teamup.</p>
            </div>
          ) : (
            scheduleQuery.data.events.map(event => (
              <ScheduleRow
                key={`${event.id}-${event.start_dt}-${event.end_dt}`}
                event={event}
                reminder={scheduleQuery.data?.reminders[String(event.id)] || scheduleQuery.data?.reminders[`date:${dateValue(event.start_dt)}`]}
                teachers={teachersQuery.data || []}
                groupId={groupId}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
