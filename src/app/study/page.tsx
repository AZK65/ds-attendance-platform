'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { StudyShell } from '@/components/StudyShell'
import { CheckCircle2, Circle, PlayCircle, FileText, ClipboardList, Loader2, ChevronRight, Car, Truck } from 'lucide-react'

interface Lesson { id: string; title: string; hasVideo: boolean; attachmentCount: number; completed: boolean; viewed: boolean }
interface Section { id: string; title: string; lessons: Lesson[] }
interface Content {
  name: string
  vehicleType: string
  sections: Section[]
  examAvailable: boolean
  recentAttempts: { id: string; score: number | null; total: number | null; submittedAt: string }[]
}

export default function StudyDashboard() {
  return <StudyShell>{() => <Dashboard />}</StudyShell>
}

function Dashboard() {
  const [data, setData] = useState<Content | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/lms/content').then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!data) return <p className="text-muted-foreground">Could not load your course.</p>

  const allLessons = data.sections.flatMap(s => s.lessons)
  const done = allLessons.filter(l => l.completed).length
  const pct = allLessons.length ? Math.round((done / allLessons.length) * 100) : 0
  const best = data.recentAttempts.filter(a => a.total).reduce((m, a) => Math.max(m, a.score ?? 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          {data.vehicleType === 'truck' ? <Truck className="h-4 w-4" /> : <Car className="h-4 w-4" />}
          {data.vehicleType === 'truck' ? 'Class 1 — Truck' : 'Class 5 — Car'}
        </div>
        <h1 className="text-2xl font-bold">Welcome, {data.name.split(/[ ,]/)[0]}</h1>
        <div className="mt-3">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Course progress</span>
            <span className="font-medium">{done}/{allLessons.length} lessons · {pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-[#E11D2E] transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {data.examAvailable && (
        <Link href="/study/exam" className="block rounded-xl border-2 border-[#E11D2E]/30 bg-[#E11D2E]/5 p-4 hover:border-[#E11D2E]/60 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-6 w-6 text-[#E11D2E]" />
              <div>
                <p className="font-semibold">Take a mock exam</p>
                <p className="text-sm text-muted-foreground">
                  Practice test with your results {best > 0 ? `· best so far: ${best}` : ''}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </Link>
      )}

      {data.sections.length === 0 ? (
        <p className="text-muted-foreground text-center py-10">Your course content is being prepared. Check back soon.</p>
      ) : (
        data.sections.map(section => (
          <div key={section.id}>
            <h2 className="font-semibold text-lg mb-2">{section.title}</h2>
            <div className="space-y-2">
              {section.lessons.map(lesson => (
                <Link
                  key={lesson.id}
                  href={`/study/lesson/${lesson.id}`}
                  className="flex items-center gap-3 rounded-lg border bg-white dark:bg-slate-900 p-3 hover:border-primary transition-colors"
                >
                  {lesson.completed
                    ? <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                    : lesson.viewed
                      ? <PlayCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                      : <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{lesson.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {lesson.hasVideo && <span className="flex items-center gap-1"><PlayCircle className="h-3 w-3" /> Video</span>}
                      {lesson.attachmentCount > 0 && <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {lesson.attachmentCount} file{lesson.attachmentCount === 1 ? '' : 's'}</span>}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
