'use client'

import { useCallback, useEffect, useRef, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { StudyShell } from '@/components/StudyShell'
import {
  ArrowLeft, FileText, Loader2, CheckCircle2, Download, ClipboardList,
  NotebookPen, ChevronLeft, ChevronRight,
} from 'lucide-react'

interface Attachment { id: string; filename: string; mimetype: string; size: number }
interface Lesson {
  id: string
  title: string
  type: string
  sectionTitle: string
  contentHtml: string
  videoUrl: string | null
  attachments: Attachment[]
  slides: string[]
  completed: boolean
  notes: string
}

const PROSE = 'text-[15px] leading-7 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-5 [&_h1]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-1 [&_a]:text-[#E11D2E] [&_a]:underline [&_strong]:font-semibold [&_img]:rounded-lg [&_img]:my-3 [&_img]:max-w-full [&_blockquote]:border-l-4 [&_blockquote]:border-[#E11D2E] [&_blockquote]:pl-4 [&_blockquote]:text-ink/60 [&_blockquote]:my-3'

function embedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vimeo = url.match(/vimeo\.com\/(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
  return null
}

const isPdf = (a: Attachment) => a.mimetype === 'application/pdf' || /\.pdf$/i.test(a.filename)
const isPpt = (a: Attachment) => /presentation|powerpoint|ms-powerpoint/.test(a.mimetype) || /\.pptx?$/i.test(a.filename)

export default function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = use(params)
  return <StudyShell wide>{() => <LessonView lessonId={lessonId} />}</StudyShell>
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
  const adminContent = lesson.contentHtml
    ? <div className={PROSE} dangerouslySetInnerHTML={{ __html: lesson.contentHtml }} />
    : null

  const attachmentRow = (att: Attachment) => (
    <a key={att.id} href={`/api/lms/attachment/${att.id}`} target="_blank" rel="noopener"
      className="flex items-center gap-3 rounded-xl border border-black/[0.07] bg-white shadow-sm p-3 hover:border-[#E11D2E]/40 transition-colors">
      <FileText className="h-5 w-5 text-[#E11D2E] flex-shrink-0" />
      <span className="flex-1 min-w-0 truncate text-sm font-medium">{att.filename}</span>
      <Download className="h-4 w-4 text-ink/40 flex-shrink-0" />
    </a>
  )

  const isDoc = type === 'pdf' || type === 'powerpoint'
  const docAtt = type === 'pdf'
    ? lesson.attachments.find(isPdf)
    : lesson.attachments.find(isPpt) || lesson.attachments.find(isPdf)
  const hasSlides = lesson.slides && lesson.slides.length > 0

  return (
    <div className="space-y-5">
      <button onClick={() => router.push('/study')} className="text-sm text-ink/60 hover:text-ink flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to course
      </button>

      <div>
        <p className="text-sm text-ink/50">{lesson.sectionTitle}</p>
        <h1 className="text-[28px] leading-tight tracking-tight font-semibold">{lesson.title}</h1>
      </div>

      {adminContent && (
        <div className="rounded-xl border border-black/[0.07] bg-white/70 px-4 py-3 text-[14px] text-ink/70">{adminContent}</div>
      )}

      {isDoc && hasSlides ? (
        // Real slide-deck viewer: big slide + notes underneath + slide rail.
        <SlideDeck slides={lesson.slides} lessonId={lessonId} notes={lesson.notes} />
      ) : isDoc ? (
        // Fallback (no rendered slides yet): Office embed / inline PDF beside notes.
        docAtt ? (
          <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr] lg:items-stretch">
            <DocumentViewer type={type} att={docAtt} />
            <NotesPanel lessonId={lessonId} initial={lesson.notes} className="h-full" />
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-black/[0.07] bg-white shadow-sm p-5 text-sm text-ink/50">
              No {type === 'pdf' ? 'PDF' : 'slides'} uploaded yet.
            </div>
            <NotesPanel lessonId={lessonId} initial={lesson.notes} />
          </>
        )
      ) : (
        <div className="rounded-2xl border border-black/[0.07] bg-white shadow-sm p-5 space-y-5">
          {type === 'video' && (
            lesson.videoUrl
              ? (embed
                  ? <div className="aspect-video rounded-xl overflow-hidden bg-black">
                      <iframe src={embed} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                    </div>
                  : <video src={lesson.videoUrl} controls className="w-full rounded-xl bg-black" />)
              : <p className="text-sm text-ink/50">No video has been added yet.</p>
          )}
          {type === 'exam' && (
            <button onClick={() => router.push('/study/exam')}
              className="w-full rounded-xl bg-[#E11D2E] text-white py-3.5 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#C5121F] transition-colors">
              <ClipboardList className="h-4 w-4" /> Start practice exam
            </button>
          )}
          {type === 'text' && !adminContent && <p className="text-sm text-ink/50">No content has been added yet.</p>}
        </div>
      )}

      {/* Notes — full width for non-document lessons (video/text). Slide decks
          render notes inside the deck (under the slide); the no-slides fallback
          shows notes beside the viewer. */}
      {!isDoc && type !== 'exam' && (
        <NotesPanel lessonId={lessonId} initial={lesson.notes} />
      )}

      {/* Extra attachments (not the deck source). */}
      {lesson.attachments.filter(a => a.id !== docAtt?.id).length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink/70">Materials</p>
          {lesson.attachments.filter(a => a.id !== docAtt?.id).map(attachmentRow)}
        </div>
      )}

      <button onClick={toggleComplete} disabled={saving}
        className={`w-full rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
          completed ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-[#0B0B0F] text-white hover:bg-black'
        }`}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {completed ? 'Completed — tap to undo' : 'Mark as complete'}
      </button>
    </div>
  )
}

// ── Slide-deck viewer ───────────────────────────────────────────
function SlideDeck({ slides, lessonId, notes }: { slides: string[]; lessonId: string; notes: string }) {
  const [i, setI] = useState(0)
  const railRef = useRef<HTMLDivElement>(null)
  const n = slides.length
  const go = useCallback((next: number) => setI(prev => Math.min(n - 1, Math.max(0, next))), [n])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); setI(p => Math.min(n - 1, p + 1)) }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); setI(p => Math.max(0, p - 1)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [n])

  // Keep the active thumbnail visible — scroll ONLY the rail, never the page.
  // (scrollIntoView bubbles up and scrolls the window, which made the whole
  // page jump on every slide change.)
  useEffect(() => {
    const rail = railRef.current
    const active = rail?.querySelector<HTMLElement>(`[data-idx="${i}"]`)
    if (!rail || !active) return
    const railRect = rail.getBoundingClientRect()
    const aRect = active.getBoundingClientRect()
    const delta = (aRect.top - railRect.top) - (railRect.height / 2 - aRect.height / 2)
    if (Math.abs(delta) > 4) rail.scrollBy({ top: delta, behavior: 'smooth' })
  }, [i])

  const src = (id: string) => `/api/lms/slide/${id}`
  const pct = Math.round(((i + 1) / n) * 100)

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_210px] lg:items-start">
      {/* Main column: slide, controls, then notes right underneath */}
      <div className="space-y-3 min-w-0">
        <div
          className="relative rounded-2xl overflow-hidden border border-black/[0.07] shadow-sm bg-[#0f0f10] aspect-video max-h-[78vh] select-none"
          onContextMenu={e => e.preventDefault()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src(slides[i])}
            alt={`Slide ${i + 1}`}
            draggable={false}
            onDragStart={e => e.preventDefault()}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none [-webkit-user-drag:none]"
          />
          {/* Prev / next zones */}
          {i > 0 && (
            <button onClick={() => go(i - 1)} aria-label="Previous slide"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {i < n - 1 && (
            <button onClick={() => go(i + 1)} aria-label="Next slide"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center transition-colors">
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Progress + controls */}
        <div className="space-y-2">
          <div className="h-1.5 rounded-full bg-black/[0.08] overflow-hidden">
            <div className="h-full bg-[#E11D2E] transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center justify-between">
            <button onClick={() => go(i - 1)} disabled={i === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-black/[0.1] bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-[#F7F7F5]">
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <span className="text-sm text-ink/60">Slide <span className="font-semibold text-ink">{i + 1}</span> of {n}</span>
            <button onClick={() => go(i + 1)} disabled={i === n - 1}
              className="inline-flex items-center gap-1 rounded-lg border border-black/[0.1] bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-[#F7F7F5]">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Notes sit directly under the slide */}
        <NotesPanel lessonId={lessonId} initial={notes} />
      </div>

      {/* Slide rail — sticky sidebar with its own scroll, so it never leaves a
          gap next to the (shorter) slide + notes column. */}
      <div className="rounded-2xl border border-black/[0.07] bg-white shadow-sm flex flex-col overflow-hidden lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]">
        <div className="px-3 py-2 border-b border-black/[0.06] text-xs font-semibold text-ink/60">Slides ({n})</div>
        <div ref={railRef} className="flex lg:flex-col gap-2 p-2 overflow-x-auto lg:overflow-y-auto">
          {slides.map((id, idx) => (
            <button
              key={id}
              data-idx={idx}
              onClick={() => setI(idx)}
              onContextMenu={e => e.preventDefault()}
              className={`relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors select-none ${
                idx === i ? 'border-[#E11D2E]' : 'border-transparent hover:border-black/20'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src(id)} alt="" loading="lazy" draggable={false} className="w-28 lg:w-full aspect-video object-cover bg-[#0f0f10] pointer-events-none select-none [-webkit-user-drag:none]" />
              <span className="absolute bottom-0.5 left-0.5 text-[10px] font-semibold text-white bg-black/55 rounded px-1 leading-tight">{idx + 1}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Fallback viewer (no rendered slides): PDF inline / PowerPoint via Office embed.
function DocumentViewer({ type, att }: { type: string; att: Attachment }) {
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])

  if (type === 'pdf' || isPdf(att)) {
    return <iframe src={`/api/lms/attachment/${att.id}`} className="w-full h-full min-h-[70vh] rounded-2xl border border-black/[0.07] bg-white shadow-sm" title={att.filename} />
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(origin)
  const publicUrl = `${origin}/api/lms/file/${att.id}?f=${encodeURIComponent(att.filename)}`
  const officeSrc = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicUrl)}`

  return (
    <div className="flex flex-col gap-3">
      {origin && !isLocal ? (
        <div className="relative w-full rounded-2xl overflow-hidden border border-black/[0.07] shadow-sm bg-[#1b1b1b]" style={{ paddingBottom: 'calc(56.25% + 40px)' }}>
          <iframe src={officeSrc} className="absolute inset-0 w-full h-full" title={att.filename} allowFullScreen />
        </div>
      ) : (
        <div className="rounded-2xl border border-[#E11D2E]/30 bg-[#E11D2E]/5 p-5 text-sm text-ink/60">
          The slide viewer needs the live site — open this lesson on <span className="font-medium">study.qazidriving.ca</span> to view the slides here.
        </div>
      )}
    </div>
  )
}

// Student's personal notes — autosaves ~1s after they stop typing.
function NotesPanel({ lessonId, initial, className = '' }: { lessonId: string; initial: string; className?: string }) {
  const [text, setText] = useState(initial)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstRun = useRef(true)

  const save = useCallback(async (value: string) => {
    setStatus('saving')
    try {
      await fetch(`/api/lms/lesson/${lessonId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: value }),
      })
      setStatus('saved')
    } catch { setStatus('idle') }
  }, [lessonId])

  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => save(text), 900)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [text, save])

  return (
    <div className={`rounded-2xl border border-black/[0.07] bg-white shadow-sm p-4 flex flex-col ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <NotebookPen className="h-4 w-4 text-[#E11D2E]" /> My notes
        </div>
        <span className="text-xs text-ink/40">{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}</span>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Write your notes here while you go through the lesson… they save automatically."
        className="w-full flex-1 min-h-[200px] resize-y rounded-xl border border-black/[0.1] p-3 text-sm leading-6 focus:outline-none focus:border-[#E11D2E] bg-[#FCFCFB]"
      />
    </div>
  )
}
