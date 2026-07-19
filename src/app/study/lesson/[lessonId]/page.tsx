'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { StudyShell } from '@/components/StudyShell'
import { ArrowLeft, FileText, Loader2, CheckCircle2, Download, Presentation, ClipboardList } from 'lucide-react'

interface Attachment { id: string; filename: string; mimetype: string; size: number }
interface Lesson {
  id: string
  title: string
  type: string
  sectionTitle: string
  contentHtml: string
  videoUrl: string | null
  attachments: Attachment[]
  completed: boolean
}

// Shared prose styling for the notes/content HTML body.
const PROSE = 'text-[15px] leading-7 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-5 [&_h1]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-1 [&_a]:text-[#E11D2E] [&_a]:underline [&_strong]:font-semibold [&_img]:rounded-lg [&_img]:my-3 [&_img]:max-w-full [&_blockquote]:border-l-4 [&_blockquote]:border-[#E11D2E] [&_blockquote]:pl-4 [&_blockquote]:text-ink/60 [&_blockquote]:my-3'

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

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-ink/40" /></div>
  if (!lesson) return <p className="text-ink/60">Lesson not found.</p>

  const embed = lesson.videoUrl ? embedUrl(lesson.videoUrl) : null
  const type = lesson.type || 'text'
  const notes = lesson.contentHtml
    ? <div className={PROSE} dangerouslySetInnerHTML={{ __html: lesson.contentHtml }} />
    : null

  // A single download row for an attachment.
  const attachmentRow = (att: Attachment) => (
    <a
      key={att.id}
      href={`/api/lms/attachment/${att.id}`}
      target="_blank"
      rel="noopener"
      className="flex items-center gap-3 rounded-xl border border-black/[0.07] bg-white shadow-sm p-3 hover:border-[#E11D2E]/40 transition-colors"
    >
      <FileText className="h-5 w-5 text-[#E11D2E] flex-shrink-0" />
      <span className="flex-1 min-w-0 truncate text-sm font-medium">{att.filename}</span>
      <Download className="h-4 w-4 text-ink/40 flex-shrink-0" />
    </a>
  )

  const firstAtt = lesson.attachments[0]
  const restAtts = lesson.attachments.slice(1)

  return (
    <div className="space-y-5">
      <button onClick={() => router.push('/study')} className="text-sm text-ink/60 hover:text-ink flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to course
      </button>

      <div>
        <p className="text-sm text-ink/50">{lesson.sectionTitle}</p>
        <h1 className="text-[28px] leading-tight tracking-tight font-semibold">{lesson.title}</h1>
      </div>

      <div className="rounded-2xl border border-black/[0.07] bg-white shadow-sm p-5 space-y-5">
        {/* video */}
        {type === 'video' && (
          <>
            {lesson.videoUrl ? (
              embed ? (
                <div className="aspect-video rounded-xl overflow-hidden bg-black">
                  <iframe src={embed} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                </div>
              ) : (
                <video src={lesson.videoUrl} controls className="w-full rounded-xl bg-black" />
              )
            ) : (
              <p className="text-sm text-ink/50">No video has been added yet.</p>
            )}
            {notes}
          </>
        )}

        {/* pdf */}
        {type === 'pdf' && (
          <>
            {firstAtt ? (
              <>
                <iframe src={`/api/lms/attachment/${firstAtt.id}`} className="w-full h-[70vh] rounded-xl border border-black/[0.07]" />
                {notes}
                {attachmentRow(firstAtt)}
                {restAtts.length > 0 && <div className="space-y-2">{restAtts.map(attachmentRow)}</div>}
              </>
            ) : (
              <>
                <p className="text-sm text-ink/50">No PDF has been uploaded yet.</p>
                {notes}
              </>
            )}
          </>
        )}

        {/* powerpoint */}
        {type === 'powerpoint' && (
          <>
            {firstAtt ? (
              <a
                href={`/api/lms/attachment/${firstAtt.id}`}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-4 rounded-2xl border border-[#E11D2E]/30 bg-[#E11D2E]/5 p-5 hover:border-[#E11D2E]/60 transition-colors"
              >
                <span className="h-12 w-12 rounded-xl bg-[#E11D2E] text-white flex items-center justify-center flex-shrink-0">
                  <Presentation className="h-6 w-6" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">Download the slides</p>
                  <p className="text-sm text-ink/60 truncate">{firstAtt.filename}</p>
                </div>
                <Download className="h-5 w-5 text-[#E11D2E] flex-shrink-0" />
              </a>
            ) : (
              <p className="text-sm text-ink/50">No slides have been uploaded yet.</p>
            )}
            {notes}
            {restAtts.length > 0 && <div className="space-y-2">{restAtts.map(attachmentRow)}</div>}
          </>
        )}

        {/* exam */}
        {type === 'exam' && (
          <>
            {notes}
            <button
              onClick={() => router.push('/study/exam')}
              className="w-full rounded-xl bg-[#E11D2E] text-white py-3.5 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#C5121F] transition-colors"
            >
              <ClipboardList className="h-4 w-4" /> Start practice exam
            </button>
          </>
        )}

        {/* text */}
        {type === 'text' && (notes || <p className="text-sm text-ink/50">No content has been added yet.</p>)}
      </div>

      <button
        onClick={toggleComplete}
        disabled={saving}
        className={`w-full rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
          completed ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-[#0B0B0F] text-white hover:bg-black'
        }`}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {completed ? 'Completed — tap to undo' : 'Mark as complete'}
      </button>
    </div>
  )
}
