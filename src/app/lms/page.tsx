'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  ArrowLeft, Plus, Trash2, Loader2, Save, Upload, FileText, Car, Truck,
  GraduationCap, Sparkles, Users, ChevronDown, ChevronRight,
  PlayCircle, Presentation, ClipboardList, BookOpen, Send, Search,
} from 'lucide-react'

type Vehicle = 'car' | 'truck'
type Tab = 'content' | 'questions' | 'accounts'
type LessonType = 'video' | 'pdf' | 'powerpoint' | 'exam' | 'text'

// Per-type metadata: icon, short label, and (for the add-lesson picker) the
// button text. Keeps the row header, picker, and editor in sync.
const LESSON_TYPE_META: Record<LessonType, { label: string; addLabel: string; icon: React.ElementType; accept?: string }> = {
  video: { label: 'Video', addLabel: 'Video', icon: PlayCircle },
  pdf: { label: 'PDF', addLabel: 'PDF', icon: FileText, accept: '.pdf' },
  powerpoint: { label: 'PowerPoint', addLabel: 'PowerPoint', icon: Presentation, accept: '.ppt,.pptx' },
  exam: { label: 'Exam', addLabel: 'Exam', icon: ClipboardList },
  text: { label: 'Notes', addLabel: 'Notes', icon: BookOpen },
}
const lessonTypeOf = (t: string): LessonType =>
  (['video', 'pdf', 'powerpoint', 'exam', 'text'] as string[]).includes(t) ? (t as LessonType) : 'text'

interface Attachment { id: string; filename: string; mimetype: string; size: number }
interface Lesson { id: string; title: string; lessonType: string; contentHtml: string; videoUrl: string | null; order: number; attachments: Attachment[] }
interface Section { id: string; title: string; order: number; lessons: Lesson[] }
interface Question { id: string; question: string; options: string[]; correctIndex: number; imageUrl: string | null }

export default function LmsAdminPage() {
  const [vehicle, setVehicle] = useState<Vehicle>('car')
  const [tab, setTab] = useState<Tab>('content')

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/scheduling"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          <h1 className="text-xl font-semibold">LMS — study.qazidriving.ca</h1>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="inline-flex rounded-lg border p-1">
          <button onClick={() => setVehicle('car')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${vehicle === 'car' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
            <Car className="h-4 w-4" /> Class 5 (Car)
          </button>
          <button onClick={() => setVehicle('truck')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${vehicle === 'truck' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
            <Truck className="h-4 w-4" /> Class 1 (Truck)
          </button>
        </div>
        <div className="flex gap-1 border-b">
          {(['content', 'questions', 'accounts'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize ${tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'content' && <ContentTab vehicle={vehicle} />}
      {tab === 'questions' && <QuestionsTab vehicle={vehicle} />}
      {tab === 'accounts' && <AccountsTab />}
    </main>
  )
}

// ── Content ─────────────────────────────────────────────────────
function ContentTab({ vehicle }: { vehicle: Vehicle }) {
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)
  const [openLesson, setOpenLesson] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/lms/admin/content?vehicleType=${vehicle}`).then(r => r.json()).then(d => { setSections(d.sections || []); setLoading(false) })
  }, [vehicle])
  useEffect(() => { load() }, [load])

  const api = (method: string, body: unknown) =>
    fetch('/api/lms/admin/content', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  const addSection = async () => { await api('POST', { kind: 'section', vehicleType: vehicle, title: 'New section' }); load() }
  const addLesson = async (sectionId: string, lessonType: LessonType) => { await api('POST', { kind: 'lesson', sectionId, title: 'New lesson', lessonType }); load() }
  const delSection = async (id: string) => { if (confirm('Delete this section and all its lessons?')) { await api('DELETE', { kind: 'section', id }); load() } }
  const delLesson = async (id: string) => { if (confirm('Delete this lesson?')) { await api('DELETE', { kind: 'lesson', id }); load() } }
  const renameSection = async (id: string, title: string) => { await api('PATCH', { kind: 'section', id, title }) }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      {sections.map(section => (
        <Card key={section.id}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Input defaultValue={section.title} className="font-semibold" onBlur={e => renameSection(section.id, e.target.value)} />
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => delSection(section.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-2 pl-2 border-l-2">
              {section.lessons.map(lesson => {
                const meta = LESSON_TYPE_META[lessonTypeOf(lesson.lessonType)]
                const TypeIcon = meta.icon
                return (
                  <div key={lesson.id} className="rounded-lg border">
                    <button onClick={() => setOpenLesson(openLesson === lesson.id ? null : lesson.id)} className="w-full flex items-center gap-2 p-3 text-left">
                      {openLesson === lesson.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="flex-1 font-medium truncate">{lesson.title}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <TypeIcon className="h-3.5 w-3.5" /> {meta.label}
                      </span>
                    </button>
                    {openLesson === lesson.id && <LessonEditor lesson={lesson} vehicle={vehicle} onChanged={load} onDelete={() => delLesson(lesson.id)} />}
                  </div>
                )
              })}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs text-muted-foreground mr-1">+ Add lesson:</span>
                {(Object.keys(LESSON_TYPE_META) as LessonType[]).map(t => {
                  const meta = LESSON_TYPE_META[t]
                  const Icon = meta.icon
                  return (
                    <Button key={t} variant="outline" size="sm" className="h-7 px-2" onClick={() => addLesson(section.id, t)}>
                      <Icon className="h-3.5 w-3.5 mr-1" /> {meta.addLabel}
                    </Button>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button onClick={addSection}><Plus className="h-4 w-4 mr-1" /> Add section</Button>
    </div>
  )
}

function LessonEditor({ lesson, vehicle, onChanged, onDelete }: { lesson: Lesson; vehicle: Vehicle; onChanged: () => void; onDelete: () => void }) {
  const type = lessonTypeOf(lesson.lessonType)
  const [title, setTitle] = useState(lesson.title)
  const [videoUrl, setVideoUrl] = useState(lesson.videoUrl || '')
  const [contentHtml, setContentHtml] = useState(lesson.contentHtml)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>(lesson.attachments)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const save = async () => {
    setSaving(true)
    await fetch('/api/lms/admin/content', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'lesson', id: lesson.id, title, videoUrl, contentHtml, lessonType: type }),
    })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000); onChanged()
  }

  const upload = async (file: File) => {
    setUploading(true)
    const fd = new FormData(); fd.append('lessonId', lesson.id); fd.append('file', file)
    const res = await fetch('/api/lms/admin/upload', { method: 'POST', body: fd })
    if (res.ok) { const d = await res.json(); setAttachments(a => [...a, d.attachment]) }
    else alert((await res.json()).error || 'Upload failed')
    setUploading(false)
  }

  const removeAttachment = async (id: string) => {
    await fetch('/api/lms/admin/upload', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attachmentId: id }) })
    setAttachments(a => a.filter(x => x.id !== id))
  }

  const showVideo = type === 'video'
  const showUpload = type === 'pdf' || type === 'powerpoint'
  const isText = type === 'text'
  const notesLabel = type === 'exam' ? 'Instructions (optional)' : isText ? 'Content' : 'Notes (optional)'
  const notesPlaceholder = isText
    ? '<h2>Topic</h2><p>Explanation…</p><ul><li>Point</li></ul>'
    : 'Notes shown to students (HTML allowed)…'

  return (
    <div className="p-3 pt-0 space-y-3 border-t">
      <div>
        <label className="text-xs text-muted-foreground">Title</label>
        <Input value={title} onChange={e => setTitle(e.target.value)} />
      </div>

      {showVideo && (
        <div>
          <label className="text-xs text-muted-foreground">Video URL (YouTube, Vimeo, or direct link)</label>
          <Input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=…" />
        </div>
      )}

      {showUpload && (
        <div>
          <label className="text-xs text-muted-foreground">{type === 'pdf' ? 'PDF file' : 'PowerPoint file'}</label>
          <div className="space-y-1 mt-1">
            {attachments.map(att => (
              <div key={att.id} className="flex items-center gap-2 text-sm rounded border px-2 py-1.5">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate">{att.filename}</span>
                <span className="text-xs text-muted-foreground">{Math.round(att.size / 1024)} KB</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeAttachment(att.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>
          <input ref={fileRef} type="file" hidden accept={LESSON_TYPE_META[type].accept} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
          <Button variant="outline" size="sm" className="mt-2" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />} Upload {type === 'pdf' ? 'PDF' : 'slides'}
          </Button>
        </div>
      )}

      {type === 'exam' && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          Students take a practice test from the {vehicle === 'truck' ? 'Truck' : 'Car'} question bank (managed in the Questions tab).
        </div>
      )}

      <div>
        <label className="text-xs text-muted-foreground">{notesLabel}</label>
        <textarea
          className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono min-h-[140px]"
          value={contentHtml}
          onChange={e => setContentHtml(e.target.value)}
          placeholder={notesPlaceholder}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save lesson
        </Button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
        <Button variant="ghost" size="sm" className="text-destructive ml-auto" onClick={onDelete}><Trash2 className="h-4 w-4 mr-1" /> Delete lesson</Button>
      </div>
    </div>
  )
}

// ── Questions ───────────────────────────────────────────────────
function QuestionsTab({ vehicle }: { vehicle: Vehicle }) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/lms/admin/questions?vehicleType=${vehicle}`).then(r => r.json()).then(d => { setQuestions(d.questions || []); setLoading(false) })
  }, [vehicle])
  useEffect(() => { load() }, [load])

  const api = (method: string, body: unknown) =>
    fetch('/api/lms/admin/questions', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  const add = async () => { await api('POST', { vehicleType: vehicle, question: 'New question', options: ['', '', '', ''], correctIndex: 0 }); load() }
  const seedCar = async () => {
    const res = await api('POST', { action: 'seed-car' })
    if (res.ok) load(); else alert((await res.json()).error || 'Already seeded')
  }
  const del = async (id: string) => { if (confirm('Delete this question?')) { await api('DELETE', { id }); load() } }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{questions.length} question{questions.length === 1 ? '' : 's'} in the {vehicle} bank</p>
        <div className="flex gap-2">
          {vehicle === 'car' && questions.length === 0 && (
            <Button variant="outline" size="sm" onClick={seedCar}><Sparkles className="h-4 w-4 mr-1" /> Import built-in 25</Button>
          )}
          <Button size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" /> Add question</Button>
        </div>
      </div>
      {questions.map((q, i) => <QuestionEditor key={q.id} q={q} index={i} onChanged={load} onDelete={() => del(q.id)} />)}
    </div>
  )
}

function QuestionEditor({ q, index, onChanged, onDelete }: { q: Question; index: number; onChanged: () => void; onDelete: () => void }) {
  const [question, setQuestion] = useState(q.question)
  const [options, setOptions] = useState<string[]>(q.options.length ? q.options : ['', '', '', ''])
  const [correctIndex, setCorrectIndex] = useState(q.correctIndex)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    setSaving(true)
    await fetch('/api/lms/admin/questions', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: q.id, question, options, correctIndex }),
    })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000); onChanged()
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start gap-2">
          <span className="text-sm text-muted-foreground pt-2">{index + 1}.</span>
          <textarea className="flex-1 rounded-md border bg-background px-3 py-2 text-sm min-h-[52px]" value={question} onChange={e => setQuestion(e.target.value)} />
        </div>
        {options.map((opt, idx) => (
          <div key={idx} className="flex items-center gap-2 pl-6">
            <input type="radio" checked={correctIndex === idx} onChange={() => setCorrectIndex(idx)} title="Correct answer" />
            <Input value={opt} onChange={e => setOptions(o => o.map((x, j) => j === idx ? e.target.value : x))} placeholder={`Option ${idx + 1}`} />
          </div>
        ))}
        <div className="flex items-center gap-2 pl-6">
          <Button size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save</Button>
          {saved && <span className="text-sm text-green-600">Saved</span>}
          <span className="text-xs text-muted-foreground">Select the radio next to the correct answer</span>
          <Button variant="ghost" size="sm" className="text-destructive ml-auto" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Accounts ────────────────────────────────────────────────────
interface AccountRow {
  id: string
  studentId: string
  studentName: string
  phone: string | null
  username: string
  vehicleType: string
  createdAt: string
  lastLoginAt: string | null
}

function AccountsTab() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [without, setWithout] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/lms/admin/accounts?list=1')
      .then(r => r.json())
      .then(d => { setAccounts(d.accounts || []); setWithout(d.studentsWithoutAccount || 0); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const generateAll = async () => {
    if (!confirm('Create LMS logins for every student who doesn’t have one yet?')) return
    setBusy(true); setNote(null)
    const res = await fetch('/api/lms/admin/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate-all' }) })
    const d = await res.json()
    setBusy(false)
    setNote(res.ok ? `Created ${d.created} new login${d.created === 1 ? '' : 's'}.` : (d.error || 'Failed'))
    load()
  }

  const sendCreds = async (a: AccountRow) => {
    setSendingId(a.id); setNote(null)
    const res = await fetch('/api/lms/admin/accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send', studentId: a.studentId }),
    })
    const d = await res.json()
    setSendingId(null)
    setNote(res.ok ? `Sent login to ${a.studentName} on WhatsApp.` : (d.error || 'Send failed'))
    load()
  }

  const q = search.trim().toLowerCase()
  const filtered = q
    ? accounts.filter(a =>
        a.studentName.toLowerCase().includes(q) ||
        a.username.toLowerCase().includes(q) ||
        (a.phone || '').includes(q.replace(/\D/g, '')))
    : accounts

  const fmt = (iso: string | null) => iso
    ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold flex items-center gap-2"><Users className="h-5 w-5" /> Student logins</h2>
          <p className="text-sm text-muted-foreground">
            {accounts.length} login{accounts.length === 1 ? '' : 's'}
            {without > 0 && <> · {without} student{without === 1 ? '' : 's'} without one yet</>}
          </p>
        </div>
        <Button onClick={generateAll} disabled={busy} variant={without > 0 ? 'default' : 'outline'}>
          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
          Generate all missing
        </Button>
      </div>

      {note && <p className="text-sm text-green-700">{note}</p>}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by name, username, or phone…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
          {accounts.length === 0 ? 'No logins yet — “Generate all missing” creates them for every student.' : 'No matches.'}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => (
            <Card key={a.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <span className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  {a.vehicleType === 'truck' ? <Truck className="h-4 w-4" /> : <Car className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{a.studentName}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{a.username}</p>
                </div>
                <div className="hidden sm:block text-xs text-muted-foreground text-right flex-shrink-0">
                  {a.lastLoginAt
                    ? <>Last login<br />{fmt(a.lastLoginAt)}</>
                    : <span className="text-amber-600">Never logged in</span>}
                </div>
                <Button size="sm" variant="outline" disabled={sendingId === a.id || !a.phone} onClick={() => sendCreds(a)} title={a.phone ? 'Reset password + send login on WhatsApp' : 'No phone number'}>
                  {sendingId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Send</span></>}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Tip: manage one student in depth (progress, reset, mock-exam results) from their profile → <span className="font-medium">LMS Activity</span>.
      </p>
    </div>
  )
}
