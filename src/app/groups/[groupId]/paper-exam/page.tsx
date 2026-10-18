'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  ImageIcon,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  ScanLine,
  Send,
  Square,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface ExamPage {
  id: string
  pageNumber: number
  mimetype: string
  filename: string | null
  createdAt: string
  url: string
}

interface Submission {
  id: string
  studentName: string
  phone: string
  senderJid: string
  status: string
  score: number | null
  totalQuestions: number | null
  passed: boolean | null
  confidence: number | null
  error: string | null
  receivedAt: string
  pages: ExamPage[]
}

interface StudentRow {
  contactId: string
  name: string
  phone: string
  submitted: boolean
  submission: Submission | null
}

interface ExamModeData {
  group: { id: string; name: string }
  session: {
    id: string
    title: string
    status: 'active' | 'closed'
    startedAt: string
    closedAt: string | null
    hasAnswerKey: boolean
    totalQuestions: number | null
    passingScore: number | null
  } | null
  history: Array<{
    id: string
    title: string
    status: string
    startedAt: string
    closedAt: string | null
    _count: { submissions: number }
  }>
  students: StudentRow[]
  unmatched: Submission[]
  stats: { total: number; submitted: number; missing: number; pages: number; graded: number }
}

const SUBMISSION_MESSAGE = `📄 *Exam submission is open*

Please write your full name on every page, take a clear photo of each completed page, and send the photos privately to Qazi Driving School on WhatsApp (not in this group).

• One photo per page
• Keep the entire page visible
• Make sure your answers are dark and easy to read`

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '').slice(-10)
  if (digits.length !== 10) return phone ? `+${phone.replace(/\D/g, '')}` : 'Unknown number'
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function receivedTime(value: string) {
  return new Date(value).toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function PaperExamModePage() {
  const params = useParams()
  const groupId = decodeURIComponent(params.groupId as string)
  const queryClient = useQueryClient()
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [title, setTitle] = useState('Paper exam')
  const [filter, setFilter] = useState<'all' | 'submitted' | 'missing'>('all')
  const [preview, setPreview] = useState<{ studentName: string; page: ExamPage } | null>(null)
  const [instructionsSent, setInstructionsSent] = useState(false)

  const { data, isLoading, isFetching } = useQuery<ExamModeData>({
    queryKey: ['paper-exam', groupId, selectedSessionId],
    queryFn: async () => {
      const query = selectedSessionId ? `?sessionId=${encodeURIComponent(selectedSessionId)}` : ''
      const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/paper-exam${query}`)
      if (!response.ok) throw new Error('Could not load Exam Mode')
      return response.json()
    },
    refetchInterval: query => query.state.data?.session?.status === 'active' ? 4000 : false,
  })

  const examAction = useMutation({
    mutationFn: async (input: { action: 'start' | 'close'; sessionId?: string }) => {
      const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/paper-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, title }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Exam Mode action failed')
      return payload as ExamModeData
    },
    onSuccess: payload => {
      if (payload.session?.id) setSelectedSessionId(payload.session.id)
      queryClient.invalidateQueries({ queryKey: ['paper-exam', groupId] })
    },
  })

  const sendInstructions = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: SUBMISSION_MESSAGE }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not send instructions')
    },
    onSuccess: () => {
      setInstructionsSent(true)
      setTimeout(() => setInstructionsSent(false), 3000)
    },
  })

  const visibleStudents = useMemo(() => {
    const students = data?.students || []
    if (filter === 'submitted') return students.filter(student => student.submitted)
    if (filter === 'missing') return students.filter(student => !student.submitted)
    return students
  }, [data?.students, filter])

  if (isLoading) {
    return <main className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></main>
  }

  if (!data) {
    return <main className="mx-auto max-w-6xl p-6"><p>Exam Mode could not be loaded.</p></main>
  }

  const active = data.session?.status === 'active'

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-5 border-b pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <Link href={`/groups/${encodeURIComponent(groupId)}`}>
            <Button variant="ghost" size="icon" aria-label="Back to group"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Paper Exam Mode</h1>
              {data.session && (
                <Badge className={active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : ''} variant={active ? 'outline' : 'secondary'}>
                  {active && <span className="mr-1.5 h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
                  {active ? 'Collecting now' : 'Closed'}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">{data.group.name} · private WhatsApp submissions</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data.history.length > 0 && (
            <select
              value={data.session?.id || ''}
              onChange={event => setSelectedSessionId(event.target.value)}
              className="h-10 max-w-[240px] rounded-md border bg-background px-3 text-sm"
              aria-label="Select exam session"
            >
              {data.history.map(item => (
                <option key={item.id} value={item.id}>
                  {item.title} · {new Date(item.startedAt).toLocaleDateString()} · {item._count.submissions} sent
                </option>
              ))}
            </select>
          )}
          {active && (
            <Button variant="outline" onClick={() => sendInstructions.mutate()} disabled={sendInstructions.isPending}>
              {sendInstructions.isPending ? <Loader2 className="animate-spin" /> : instructionsSent ? <Check /> : <MessageCircle />}
              {instructionsSent ? 'Sent' : 'Send instructions'}
            </Button>
          )}
          {active && data.session ? (
            <Button variant="outline" onClick={() => examAction.mutate({ action: 'close', sessionId: data.session!.id })} disabled={examAction.isPending}>
              <Square className="fill-current" /> Stop collecting
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Input value={title} onChange={event => setTitle(event.target.value)} className="w-40" placeholder="Exam name" />
              <Button onClick={() => examAction.mutate({ action: 'start' })} disabled={examAction.isPending}>
                {examAction.isPending ? <Loader2 className="animate-spin" /> : <ScanLine />}
                Start collecting
              </Button>
            </div>
          )}
        </div>
      </header>

      {!data.session ? (
        <section className="grid min-h-[460px] place-items-center rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
          <div className="max-w-md">
            <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-foreground text-background">
              <ScanLine className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-semibold">Collect exams from this WhatsApp group</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Start Exam Mode before students privately message their photos to the school&apos;s WhatsApp. Each photo will be saved permanently and matched back to this group by the sender&apos;s phone number.
            </p>
            <div className="mx-auto mt-6 flex max-w-sm gap-2">
              <Input value={title} onChange={event => setTitle(event.target.value)} placeholder="Exam name" />
              <Button onClick={() => examAction.mutate({ action: 'start' })} disabled={examAction.isPending}>
                {examAction.isPending ? <Loader2 className="animate-spin" /> : <ScanLine />}
                Start
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              { label: 'Students', value: data.stats.total, icon: Users, tone: 'text-slate-700 bg-slate-50' },
              { label: 'Submitted', value: data.stats.submitted, icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-50' },
              { label: 'Missing', value: data.stats.missing, icon: Clock3, tone: 'text-amber-700 bg-amber-50' },
              { label: 'Photos', value: data.stats.pages, icon: ImageIcon, tone: 'text-blue-700 bg-blue-50' },
              { label: 'Graded', value: data.stats.graded, icon: Bot, tone: 'text-violet-700 bg-violet-50' },
            ].map(stat => (
              <Card key={stat.label} className="shadow-none">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`grid h-10 w-10 place-items-center rounded-xl ${stat.tone}`}><stat.icon className="h-5 w-5" /></div>
                  <div><p className="text-2xl font-semibold tabular-nums">{stat.value}</p><p className="text-xs text-muted-foreground">{stat.label}</p></div>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
            <div className="flex items-start gap-3">
              <Bot className="mt-0.5 h-5 w-5 text-violet-700" />
              <div>
                <p className="font-medium text-violet-950">OCR grading is ready for the answer-key step</p>
                <p className="mt-1 text-sm text-violet-800">
                  Submissions are being collected now. Once the answer sheet is added, this screen will extract each student&apos;s choices, calculate the score, and flag uncertain answers for review.
                </p>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border">
            <div className="flex flex-col gap-3 border-b bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">Student submissions</h2>
                <p className="text-sm text-muted-foreground">
                  {active ? 'Updates automatically when a student privately messages a photo to the school WhatsApp.' : `Collection stopped ${data.session.closedAt ? receivedTime(data.session.closedAt) : ''}.`}
                  {isFetching && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" />}
                </p>
              </div>
              <div className="flex rounded-lg border bg-background p-1">
                {(['all', 'submitted', 'missing'] as const).map(value => (
                  <Button key={value} size="sm" variant={filter === value ? 'secondary' : 'ghost'} onClick={() => setFilter(value)} className="capitalize">
                    {value}
                    {value === 'submitted' && <span className="ml-1 text-xs">{data.stats.submitted}</span>}
                    {value === 'missing' && <span className="ml-1 text-xs">{data.stats.missing}</span>}
                  </Button>
                ))}
              </div>
            </div>

            <div className="divide-y">
              {visibleStudents.map(student => (
                <div key={student.contactId} className="grid gap-4 p-4 sm:grid-cols-[minmax(220px,1fr)_140px_minmax(260px,1.2fr)] sm:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${student.submitted ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                      {student.submitted ? <CheckCircle2 className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{student.name}</p>
                      <p className="text-sm text-muted-foreground">{formatPhone(student.phone)}</p>
                    </div>
                  </div>
                  <div>
                    {student.submitted ? (
                      <Badge className="bg-emerald-600"><CheckCircle2 /> Submitted</Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-700"><Clock3 /> Waiting</Badge>
                    )}
                  </div>
                  <div className="flex min-h-14 items-center justify-start gap-2 sm:justify-end">
                    {student.submission ? (
                      <>
                        <div className="mr-2 hidden text-right lg:block">
                          <p className="text-sm font-medium">{student.submission.pages.length} page{student.submission.pages.length === 1 ? '' : 's'}</p>
                          <p className="text-xs text-muted-foreground">{receivedTime(student.submission.receivedAt)}</p>
                        </div>
                        {student.submission.pages.slice(0, 4).map(page => (
                          <button
                            key={page.id}
                            onClick={() => setPreview({ studentName: student.name, page })}
                            className="relative grid h-14 w-11 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted transition hover:ring-2 hover:ring-foreground/20"
                            title={`Open page ${page.pageNumber}`}
                          >
                            {page.mimetype.startsWith('image/') ? (
                              <Image src={page.url} alt={`Page ${page.pageNumber}`} fill unoptimized className="object-cover" sizes="44px" />
                            ) : (
                              <FileText className="h-5 w-5 text-red-600" />
                            )}
                            <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] text-white">{page.pageNumber}</span>
                          </button>
                        ))}
                        {student.submission.pages.length > 4 && <Badge variant="secondary">+{student.submission.pages.length - 4}</Badge>}
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">No exam received</span>
                    )}
                  </div>
                </div>
              ))}
              {visibleStudents.length === 0 && <p className="p-10 text-center text-sm text-muted-foreground">No students in this view.</p>}
            </div>
          </section>

          {data.unmatched.length > 0 && (
            <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <h2 className="flex items-center gap-2 font-semibold text-amber-950"><MoreHorizontal className="h-5 w-5" /> Needs matching ({data.unmatched.length})</h2>
              <p className="mt-1 text-sm text-amber-800">These exams were saved, but the WhatsApp sender did not match the current group roster.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {data.unmatched.map(submission => (
                  <div key={submission.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-white p-3">
                    <div><p className="font-medium">{submission.studentName}</p><p className="text-xs text-muted-foreground">{formatPhone(submission.phone)} · {submission.pages.length} page(s)</p></div>
                    {submission.pages[0] && <Button size="sm" variant="outline" onClick={() => setPreview({ studentName: submission.studentName, page: submission.pages[0] })}>Review</Button>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Dialog open={Boolean(preview)} onOpenChange={open => !open && setPreview(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{preview?.studentName} · Page {preview?.page.pageNumber}</DialogTitle>
            <DialogDescription>Received through the group&apos;s WhatsApp Exam Mode.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[75vh] min-h-[50vh] place-items-center overflow-auto bg-neutral-950/95 p-4">
            {preview?.page.mimetype.startsWith('image/') ? (
              <Image src={preview.page.url} alt="Submitted exam page" width={1600} height={2200} unoptimized className="h-auto max-h-[70vh] w-auto max-w-full object-contain" />
            ) : preview ? (
              <iframe src={preview.page.url} title="Submitted exam PDF" className="h-[70vh] w-full rounded bg-white" />
            ) : null}
          </div>
          {preview && (
            <div className="flex items-center justify-between border-t px-6 py-3">
              <span className="text-xs text-muted-foreground">{preview.page.filename || preview.page.mimetype}</span>
              <a href={`${preview.page.url}?download=1`}><Button size="sm" variant="outline"><Send className="rotate-90" /> Download</Button></a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
