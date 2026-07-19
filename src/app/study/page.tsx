'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { StudyShell } from '@/components/StudyShell'
import { CheckCircle2, PlayCircle, FileText, Presentation, ClipboardList, BookOpen, Loader2, ChevronRight, Car, Truck } from 'lucide-react'

const LESSON_TYPE_ICON: Record<string, React.ElementType> = {
  video: PlayCircle,
  pdf: FileText,
  powerpoint: Presentation,
  exam: ClipboardList,
  text: BookOpen,
}
const LESSON_TYPE_LABEL: Record<string, string> = {
  video: 'Video',
  pdf: 'PDF',
  powerpoint: 'PowerPoint',
  exam: 'Practice exam',
  text: 'Notes',
}

interface Lesson { id: string; title: string; type: string; hasVideo: boolean; attachmentCount: number; completed: boolean; viewed: boolean }
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

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-ink/40" /></div>
  if (!data) return <p className="text-ink/60">Could not load your course.</p>

  const allLessons = data.sections.flatMap(s => s.lessons)
  const done = allLessons.filter(l => l.completed).length
  const pct = allLessons.length ? Math.round((done / allLessons.length) * 100) : 0
  const best = data.recentAttempts.filter(a => a.total).reduce((m, a) => Math.max(m, a.score ?? 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-ink/50 mb-1">
          {data.vehicleType === 'truck' ? <Truck className="h-4 w-4" /> : <Car className="h-4 w-4" />}
          {data.vehicleType === 'truck' ? 'Class 1 — Truck' : 'Class 5 — Car'}
        </div>
        <h1 className="text-[32px] leading-tight tracking-tight">
          <span className="font-sans">Welcome, </span>
          <span className="font-serif italic text-[#E11D2E]">{data.name.split(/[ ,]/)[0]}</span>
        </h1>
        <div className="mt-4 rounded-2xl border border-black/[0.07] bg-white shadow-sm p-4">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-ink/60">Course progress</span>
            <span className="font-medium">{done}/{allLessons.length} lessons · {pct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-black/[0.06] overflow-hidden">
            <div className="h-full bg-[#E11D2E] transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {data.examAvailable && (
        <Link href="/study/exam" className="block rounded-2xl border border-[#E11D2E]/30 bg-[#E11D2E]/5 p-4 hover:border-[#E11D2E]/60 shadow-sm transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 rounded-xl bg-[#E11D2E] text-white flex items-center justify-center flex-shrink-0">
                <ClipboardList className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold">Take a mock exam</p>
                <p className="text-sm text-ink/60">
                  Practice test with your results {best > 0 ? `· best so far: ${best}` : ''}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-ink/40" />
          </div>
        </Link>
      )}

      {data.sections.length === 0 ? (
        <p className="text-ink/60 text-center py-10">Your course content is being prepared. Check back soon.</p>
      ) : (
        data.sections.map(section => (
          <div key={section.id}>
            <h2 className="font-semibold text-lg mb-2">{section.title}</h2>
            <div className="space-y-2">
              {section.lessons.map(lesson => {
                const TypeIcon = LESSON_TYPE_ICON[lesson.type] || BookOpen
                return (
                  <Link
                    key={lesson.id}
                    href={`/study/lesson/${lesson.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-black/[0.07] bg-white shadow-sm p-3.5 hover:border-[#E11D2E]/40 transition-colors"
                  >
                    <span className="h-9 w-9 rounded-xl bg-[#F7F7F5] text-ink/70 flex items-center justify-center flex-shrink-0">
                      <TypeIcon className="h-5 w-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{lesson.title}</p>
                      <div className="flex items-center gap-2 text-xs text-ink/50">
                        <span>{LESSON_TYPE_LABEL[lesson.type] || 'Notes'}</span>
                        {lesson.viewed && !lesson.completed && <span className="text-amber-600">· In progress</span>}
                      </div>
                    </div>
                    {lesson.completed
                      ? <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-ink/40 flex-shrink-0" />}
                  </Link>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
