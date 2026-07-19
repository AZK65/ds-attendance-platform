'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { StudyShell } from '@/components/StudyShell'
import { ArrowLeft, Loader2, CheckCircle2, XCircle, ClipboardList } from 'lucide-react'

interface Question { id: string; question: string; options: string[]; imageUrl: string | null }
interface ReviewItem { id: string; question: string; options: string[]; selectedIndex: number | null; correctIndex: number; correct: boolean }
interface Result { score: number; total: number; passed: boolean; review: ReviewItem[] }

export default function ExamPage() {
  return <StudyShell>{() => <Exam />}</StudyShell>
}

function Exam() {
  const router = useRouter()
  const [phase, setPhase] = useState<'intro' | 'taking' | 'done'>('intro')
  const [attemptId, setAttemptId] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const start = async () => {
    setBusy(true); setError('')
    const res = await fetch('/api/lms/exam', { method: 'POST' })
    setBusy(false)
    if (!res.ok) { setError((await res.json()).error || 'Could not start exam'); return }
    const d = await res.json()
    setAttemptId(d.attemptId); setQuestions(d.questions); setAnswers({}); setPhase('taking')
  }

  const submit = async () => {
    setBusy(true); setError('')
    const res = await fetch('/api/lms/exam', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attemptId, answers }),
    })
    setBusy(false)
    if (!res.ok) { setError((await res.json()).error || 'Submit failed'); return }
    setResult(await res.json()); setPhase('done')
  }

  const answeredCount = Object.keys(answers).length

  if (phase === 'intro') {
    return (
      <div className="space-y-5">
        <button onClick={() => router.push('/study')} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to course
        </button>
        <div className="text-center py-8 space-y-4">
          <ClipboardList className="h-12 w-12 mx-auto text-[#E11D2E]" />
          <h1 className="text-2xl font-bold">Mock Exam</h1>
          <p className="text-muted-foreground max-w-sm mx-auto">
            A practice test drawn from your course. You&apos;ll see your score and every question you got wrong at the end. Take it as many times as you like.
          </p>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button onClick={start} disabled={busy} className="rounded-lg bg-[#0B0B0F] text-white px-6 py-3 text-sm font-medium hover:bg-black inline-flex items-center gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Start exam
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'taking') {
    return (
      <div className="space-y-5 pb-24">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Mock Exam</h1>
          <span className="text-sm text-muted-foreground">{answeredCount}/{questions.length} answered</span>
        </div>
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-xl border bg-white dark:bg-slate-900 p-4">
            <p className="font-medium mb-3"><span className="text-muted-foreground">{i + 1}.</span> {q.question}</p>
            {q.imageUrl && <img src={q.imageUrl} alt="" className="rounded-lg mb-3 max-h-60" />}
            <div className="space-y-2">
              {q.options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => setAnswers(a => ({ ...a, [q.id]: idx }))}
                  className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    answers[q.id] === idx ? 'border-[#E11D2E] bg-[#E11D2E]/5 font-medium' : 'hover:border-slate-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t p-3">
          <div className="max-w-3xl mx-auto">
            <button onClick={submit} disabled={busy} className="w-full rounded-lg bg-[#0B0B0F] text-white py-3 text-sm font-medium hover:bg-black inline-flex items-center justify-center gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit exam ({answeredCount}/{questions.length})
            </button>
          </div>
        </div>
      </div>
    )
  }

  // done
  const wrong = result?.review.filter(r => !r.correct) || []
  return (
    <div className="space-y-6">
      <div className="text-center py-6 space-y-2">
        {result?.passed ? <CheckCircle2 className="h-14 w-14 mx-auto text-green-600" /> : <XCircle className="h-14 w-14 mx-auto text-amber-500" />}
        <h1 className="text-3xl font-bold">{result?.score}/{result?.total}</h1>
        <p className={`font-medium ${result?.passed ? 'text-green-600' : 'text-amber-600'}`}>
          {result?.passed ? 'Passed — great work!' : 'Keep practicing — review the ones you missed below.'}
        </p>
      </div>

      {wrong.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">Questions to review ({wrong.length})</h2>
          {wrong.map(r => (
            <div key={r.id} className="rounded-xl border border-red-200 bg-red-50/40 dark:bg-red-950/10 p-4">
              <p className="font-medium mb-2">{r.question}</p>
              <p className="text-sm text-red-700 flex items-start gap-1.5">
                <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                Your answer: {r.selectedIndex != null ? r.options[r.selectedIndex] : '(no answer)'}
              </p>
              <p className="text-sm text-green-700 flex items-start gap-1.5 mt-1">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                Correct: {r.options[r.correctIndex]}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => { setPhase('intro'); setResult(null) }} className="flex-1 rounded-lg bg-[#0B0B0F] text-white py-3 text-sm font-medium hover:bg-black">
          Take another
        </button>
        <button onClick={() => router.push('/study')} className="flex-1 rounded-lg border py-3 text-sm font-medium hover:bg-muted">
          Back to course
        </button>
      </div>
    </div>
  )
}
