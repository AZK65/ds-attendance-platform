'use client'

import { useMemo } from 'react'
import {
  buildTruckSessions, summarizeTruckSessions, weeklyHours, hoursBetween,
  DAY_SHORT, DEFAULT_TRUCK_DAYS, TRUCK_THEORY_TARGET_HOURS, TRUCK_PRACTICAL_HOURS,
  formatTime12h, type TruckDay,
} from '@/lib/truck-schedule'

/**
 * Class 1 weekly timetable editor for the 75 h THEORY block.
 *
 * Each class day has its own hours (Tue/Thu evenings are 4 h, Saturday is a
 * 9 h day), so there's no single "class time" — hence a row per day. Classes
 * are generated until the hour target is met, and the preview comes from the
 * same buildTruckSessions() the API uses, so what's shown is what gets made.
 *
 * The 50 h of in-cab driving is booked per student elsewhere and is called out
 * here so nobody expects this to schedule it.
 *
 * Used by both the new-group wizard and the groups page Setup Class dialog.
 */
export function TruckDaysEditor({
  value,
  onChange,
  targetHours,
  onTargetHoursChange,
  startDate,
}: {
  value: TruckDay[]
  onChange: (days: TruckDay[]) => void
  targetHours: number
  onTargetHoursChange: (h: number) => void
  startDate: string
}) {
  const enabled = useMemo(() => new Map(value.map(d => [d.day, d])), [value])

  const preview = useMemo(
    () => buildTruckSessions(startDate, value, targetHours),
    [startDate, value, targetHours],
  )
  const summary = useMemo(() => summarizeTruckSessions(preview), [preview])
  const perWeek = useMemo(() => weeklyHours(value), [value])

  const toggleDay = (day: number) => {
    if (enabled.has(day)) {
      onChange(value.filter(d => d.day !== day))
      return
    }
    const preset = DEFAULT_TRUCK_DAYS.find(d => d.day === day) ?? { day, start: '17:30', end: '21:30' }
    onChange([...value, preset].sort((a, b) => a.day - b.day))
  }

  const patchDay = (day: number, patch: Partial<TruckDay>) => {
    onChange(value.map(d => (d.day === day ? { ...d, ...patch } : d)))
  }

  const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mb-1.5">Theory hours to schedule</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={200}
              value={targetHours}
              onChange={e => onTargetHoursChange(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
              className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm"
            />
            <span className="text-xs text-muted-foreground">
              hours {targetHours === TRUCK_THEORY_TARGET_HOURS && '(program requirement)'}
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground pb-1.5">
          {perWeek} h/week
        </p>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Class days — each has its own hours</p>
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
          {[...value].sort((a, b) => a.day - b.day).map(d => {
            const h = hoursBetween(d.start, d.end)
            return (
              <div key={d.day} className="flex items-center gap-2 text-xs">
                <span className="w-9 font-medium">{DAY_SHORT[d.day]}</span>
                <input
                  type="time"
                  value={d.start}
                  onChange={e => patchDay(d.day, { start: e.target.value })}
                  className="h-8 rounded-md border border-input bg-background px-2"
                />
                <span className="text-muted-foreground">to</span>
                <input
                  type="time"
                  value={d.end}
                  onChange={e => patchDay(d.day, { end: e.target.value })}
                  className="h-8 rounded-md border border-input bg-background px-2"
                />
                <span className={h > 0 ? 'text-muted-foreground' : 'text-destructive'}>
                  {h > 0 ? `${Math.round(h * 10) / 10} h` : 'end must be after start'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {preview.length > 0 ? (
        <div className="text-xs space-y-1 border-t pt-2">
          <p>
            <span className="font-medium">{summary.sessions} classes</span>
            {' · '}
            <span className="text-green-700 font-medium">{summary.totalHours} h</span>
            <span className="text-muted-foreground"> of {targetHours} h theory</span>
          </p>
          {summary.firstDate && summary.lastDate && (
            <p className="text-muted-foreground">
              {fmtDate(summary.firstDate)} → {fmtDate(summary.lastDate)} · about {summary.weeks} weeks
            </p>
          )}
          <p className="text-muted-foreground">
            First class {formatTime12h(preview[0].start)} · all in person at the school · a reminder is
            sent on each class day
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
