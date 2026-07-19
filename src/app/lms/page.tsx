'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  ArrowLeft, Plus, Trash2, Loader2, Save, Upload, FileText, Car, Truck,
  GraduationCap, Sparkles, Users, ChevronDown, ChevronRight,
} from 'lucide-react'

type Vehicle = 'car' | 'truck'
type Tab = 'content' | 'questions' | 'accounts'

interface Attachment { id: string; filename: string; mimetype: string; size: number }
interface Lesson { id: string; title: string; contentHtml: string; videoUrl: string | null; order: number; attachments: Attachment[] }
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
  const addLesson = async (sectionId: string) => { await api('POST', { kind: 'lesson', sectionId, title: 'New lesson' }); load() }
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
              {section.lessons.map(lesson => (
                <div key={lesson.id} className="rounded-lg border">
                  <button onClick={() => setOpenLesson(openLesson === lesson.id ? null : lesson.id)} className="w-full flex items-center gap-2 p-3 text-left">
                    {openLesson === lesson.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="flex-1 font-medium truncate">{lesson.title}</span>
                    {lesson.videoUrl && <span className="text-xs text-muted-foreground">video</span>}
                    {lesson.attachments.length > 0 && <span className="text-xs text-muted-foreground">{lesson.attachments.length} file(s)</span>}
                  </button>
                  {openLesson === lesson.id && <LessonEditor lesson={lesson} onChanged={load} onDelete={() => delLesson(lesson.id)} />}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => addLesson(section.id)}><Plus className="h-4 w-4 mr-1" /> Add lesson</Button>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button onClick={addSection}><Plus className="h-4 w-4 mr-1" /> Add section</Button>
    </div>
  )
}

function LessonEditor({ lesson, onChanged, onDelete }: { lesson: Lesson; onChanged: () => void; onDelete: () => void }) {
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
      body: JSON.stringify({ kind: 'lesson', id: lesson.id, title, videoUrl, contentHtml }),
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

  return (
    <div className="p-3 pt-0 space-y-3 border-t">
      <div>
        <label className="text-xs text-muted-foreground">Title</label>
        <Input value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Video URL (YouTube, Vimeo, or direct link) — optional</label>
        <Input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=…" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Lesson content (HTML — headings, lists, &lt;img&gt;, etc.)</label>
        <textarea
          className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono min-h-[140px]"
          value={contentHtml}
          onChange={e => setContentHtml(e.target.value)}
          placeholder="<h2>Topic</h2><p>Explanation…</p><ul><li>Point</li></ul>"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Attachments (PDF, PowerPoint, images)</label>
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
        <input ref={fileRef} type="file" hidden accept=".pdf,.ppt,.pptx,image/*" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
        <Button variant="outline" size="sm" className="mt-2" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />} Upload file
        </Button>
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
function AccountsTab() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const generateAll = async () => {
    if (!confirm('Create LMS logins for every student who doesn’t have one yet?')) return
    setBusy(true); setResult(null)
    const res = await fetch('/api/lms/admin/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate-all' }) })
    const d = await res.json()
    setBusy(false)
    setResult(res.ok ? `Created ${d.created} new account${d.created === 1 ? '' : 's'}.` : (d.error || 'Failed'))
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <h2 className="font-semibold">Student logins</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Each student gets a <span className="font-mono">first.last@qazidrivingschool.ca</span> username and a random password.
            Manage an individual student&apos;s login (view username, reset, send via WhatsApp) from their profile page under <span className="font-medium">LMS Activity</span>.
          </p>
          <Button onClick={generateAll} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Generate logins for all students
          </Button>
          {result && <p className="text-sm text-green-700">{result}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
