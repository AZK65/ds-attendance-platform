'use client'

import { useMemo } from 'react'
import {
  DAY_SHORT, DEFAULT_TRUCK_DAYS, TRUCK_PRACTICAL_HOURS, TRUCK_THEORY_TARGET_HOURS,
  formatTime12h, weeklyNetLabel, type TruckDay,
} from '@/lib/truck-schedule'
import {
  CLASS1_THEORY_REQUIRED_NET_MINUTES,
  CLASS1_THEORY_REQUIRED_SESSIONS,
  buildTheorySessions,
  formatNet,
  netMinutes,
  standardBreaksFor,
} from '@/lib/theory-hours'

/**
 * Class 1 weekly timetable editor for the 75 h net theory block.
 * The hour requirement is fixed. Staff can still change which days run
 * and the clock times. The preview uses the same net-hour builder as setup.
 */
export function TruckDaysEditor({
  value,
  onChange,
  startDate,
}: {
  value: TruckDay[]
  onChange: (days: TruckDay[]) => void
  startDate: string
}) {
  const enabled = useMemo(() => new Map(value.map(day => [day.day, day])), [value])
  const theoryDays = useMemo(() => value.map(day => ({
    day: day.day,
    start: day.start,
    end: day.end,
    breaks: day.breaks && day.breaks.length > 0 ? day.breaks : standardBreaksFor(day.day, day.start, day.end),
  })), [value])
  const preview = useMemo(
    () => buildTheorySessions(startDate, theoryDays, CLASS1_THEORY_REQUIRED_NET_MINUTES),
    [startDate, theoryDays],
  )

  const toggleDay = (day: number) => {
    if (enabled.has(day)) {
      onChange(value.filter(entry => entry.day !== day))
      return
    }
    const preset = DEFAULT_TRUCK_DAYS.find(entry => entry.day === day) ?? {
      day,
      start: '17:30',
      end: '21:30',
      breaks: standardBreaksFor(day, '17:30', '21:30'),
    }
    onChange([...value, preset].sort((a, b) => a.day - b.day))
  }

  const patchDay = (day: number, patch: Partial<TruckDay>) => {
    onChange(value.map(entry => {
      if (entry.day !== day) return entry
      const next = { ...entry, ...patch }
      if (patch.start || patch.end) {
        next.breaks = standardBreaksFor(day, next.start, next.end)
      }
      return next
    }))
  }

  const fmtDate = (iso: string) => {
    const [year, month, day] = iso.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
      <div className="flex items-end justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Theory requirement is fixed at {TRUCK_THEORY_TARGET_HOURS} net hours ({CLASS1_THEORY_REQUIRED_SESSIONS} classes). Breaks and lunch are not counted.
        </p>
        <p className="text-xs text-muted-foreground pb-0.5 shrink-0">
          {weeklyNetLabel(value)} net/week
        </p>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Class days</p>
        <div className="flex gap-1.5 flex-wrap">
          {DAY_SHORT.map((label, day) => {
            const on = enabled.has(day)
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`h-8 w-9 rounded-md text-xs font-medium border transition-colors ${
                  on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {value.length > 0 && (
        <div className="space-y-1.5">
          {[...value].sort((a, b) => a.day - b.day).map(day => {
            const breaks = day.breaks && day.breaks.length > 0 ? day.breaks : standardBreaksFor(day.day, day.start, day.end)
            const net = netMinutes(day.start, day.end, breaks)
            return (
              <div key={day.day} className="flex items-center gap-2 text-xs">
                <span className="w-9 font-medium">{DAY_SHORT[day.day]}</span>
                <input
                  type="time"
                  value={day.start}
                  onChange={event => patchDay(day.day, { start: event.target.value })}
                  className="h-8 rounded-md border border-input bg-background px-2"
                />
                <span className="text-muted-foreground">to</span>
                <input
                  type="time"
                  value={day.end}
                  onChange={event => patchDay(day.day, { end: event.target.value })}
                  className="h-8 rounded-md border border-input bg-background px-2"
                />
                <span className={net > 0 ? 'text-muted-foreground' : 'text-destructive'}>
                  {net > 0 ? `${formatNet(net)} net` : 'end must be after start'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {preview.sessions.length > 0 ? (
        <div className="text-xs space-y-1 border-t pt-2">
          <p>
            <span className="font-medium">{preview.sessions.length} classes</span>
            {' · '}
            <span className="text-green-700 font-medium">{formatNet(preview.totalNetMinutes)}</span>
            <span className="text-muted-foreground"> net of {formatNet(CLASS1_THEORY_REQUIRED_NET_MINUTES)} theory</span>
          </p>
          {preview.warning && <p className="text-amber-700">{preview.warning}</p>}
          {preview.sessions[0] && preview.sessions[preview.sessions.length - 1] && (
            <p className="text-muted-foreground">
              {fmtDate(preview.sessions[0].date)} → {fmtDate(preview.sessions[preview.sessions.length - 1].date)}
            </p>
          )}
          <p className="text-muted-foreground">
            First class {formatTime12h(preview.sessions[0].start)} · all in person at the school · a reminder is sent on each class day
          </p>
          <p className="text-muted-foreground border-t pt-1.5 mt-1.5">
            The {TRUCK_PRACTICAL_HOURS} h of in-cab driving is booked per student afterwards, in the
            Truck Class scheduler.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground border-t pt-2">
          Pick a first class date and at least one class day.
        </p>
      )}
    </div>
  )
}
