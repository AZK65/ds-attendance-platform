'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { StudyShell } from '@/components/StudyShell'
import { ArrowLeft, FileText, Loader2, CheckCircle2, Download } from 'lucide-react'

interface Attachment { id: string; filename: string; mimetype: string; size: number }
interface Lesson {
  id: string
  title: string
  sectionTitle: string
  contentHtml: string
  videoUrl: string | null
  attachments: Attachment[]
  completed: boolean
}

// Turn a YouTube/Vimeo URL into an embeddable src; otherwise return null so we
// fall back to a plain link.
function embedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vimeo = url.match(/vimeo\.com\/(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
  return null
}

export default function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = use(params)
  return <StudyShell>{() => <LessonView lessonId={lessonId} />}</StudyShell>
}

function LessonView({ lessonId }: { lessonId: string }) {
  const router = useRouter()
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [loading, setLoading] = useState(true)
  const [completed, setCompleted] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/lms/lesson/${lessonId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setLesson(d); setCompleted(!!d?.completed); setLoading(false) })
      .catch(() => setLoading(false))
  }, [lessonId])

  const toggleComplete = async () => {
    setSaving(true)
    const next = !completed
    await fetch(`/api/lms/lesson/${lessonId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: next }),
    })
    setCompleted(next); setSaving(false)
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!lesson) return <p className="text-muted-foreground">Lesson not found.</p>

  const embed = lesson.videoUrl ? embedUrl(lesson.videoUrl) : null

  return (
    <div className="space-y-5">
      <button onClick={() => router.push('/study')} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to course
      </button>

      <div>
        <p className="text-sm text-muted-foreground">{lesson.sectionTitle}</p>
        <h1 className="text-2xl font-bold">{lesson.title}</h1>
      </div>

      {lesson.videoUrl && (
        embed ? (
          <div className="aspect-video rounded-xl overflow-hidden bg-black">
            <iframe src={embed} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          </div>
        ) : (
          <video src={lesson.videoUrl} controls className="w-full rounded-xl bg-black" />
        )
      )}

      {lesson.contentHtml && (
        <div
          className="lms-content"
          dangerouslySetInnerHTML={{ __html: lesson.contentHtml }}
        />
      )}

      {lesson.attachments.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">Materials</h2>
          {lesson.attachments.map(att => (
            <a
              key={att.id}
              href={`/api/lms/attachment/${att.id}`}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-3 rounded-lg border bg-white dark:bg-slate-900 p-3 hover:border-primary transition-colors"
            >
              <FileText className="h-5 w-5 text-[#E11D2E] flex-shrink-0" />
              <span className="flex-1 min-w-0 truncate text-sm font-medium">{att.filename}</span>
              <Download className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </a>
          ))}
        </div>
      )}

      <button
        onClick={toggleComplete}
        disabled={saving}
        className={`w-full rounded-lg py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
          completed ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-[#0B0B0F] text-white hover:bg-black'
        }`}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {completed ? 'Completed — tap to undo' : 'Mark as complete'}
      </button>
    </div>
  )
}
