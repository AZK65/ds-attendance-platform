'use client'

import { useQuery } from '@tanstack/react-query'

interface TheorySessionRow {
  id: string
  label: string
  date: string
  startTime: string
  endTime: string
  netLabel: string
  teamupEventId: string | null
}

interface TheorySessionList {
  sessions: TheorySessionRow[]
  scheduledNetLabel: string
  requiredSessions: number
  instructorLineEn: string
}

export function TruckTheorySummary({ groupId }: { groupId: string }) {
  const { data } = useQuery<TheorySessionList | null>({
    queryKey: ['group-theory-sessions', groupId],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/theory-sessions`)
      if (!res.ok) return null
      return res.json()
    },
    enabled: !!groupId,
    staleTime: 30_000,
  })

  if (!data?.sessions?.length) return null

  return (
    <section className="rounded-lg border p-4" aria-label="Class 1 theory schedule">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-semibold">Theory schedule</h2>
        <p className="text-sm tabular-nums text-muted-foreground">
          {data.sessions.length} / {data.requiredSessions} classes · {data.scheduledNetLabel} net
        </p>
      </div>
      {data.instructorLineEn && (
        <p className="mt-2 text-sm text-muted-foreground">{data.instructorLineEn}</p>
      )}
      <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
        {data.sessions.map(session => (
          <li key={session.id} className="min-w-0">
            <span className="font-medium">{session.label}</span>
            <span className="text-muted-foreground"> · {session.date} · {session.startTime}–{session.endTime} · {session.netLabel}</span>
            {!session.teamupEventId && (
              <span className="text-amber-700"> · not on calendar</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
