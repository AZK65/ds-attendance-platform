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
        <button onClick={() => router.push('/study')} className="text-sm text-ink/60 hover:text-ink flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to course
        </button>
        <div className="rounded-2xl border border-black/[0.07] bg-white shadow-sm text-center py-10 px-6 space-y-4">
          <span className="h-14 w-14 rounded-2xl bg-[#E11D2E] text-white flex items-center justify-center mx-auto">
            <ClipboardList className="h-7 w-7" />
          </span>
          <h1 className="text-[30px] leading-tight tracking-tight">
            <span className="font-sans">Mock </span><span className="font-serif italic text-[#E11D2E]">Exam</span>
          </h1>
          <p className="text-ink/60 max-w-sm mx-auto">
            A practice test drawn from your course. You&apos;ll see your score and every question you got wrong at the end. Take it as many times as you like.
          </p>
          {error && <p className="text-[#C5121F] text-sm">{error}</p>}
          <button onClick={start} disabled={busy} className="rounded-xl bg-[#0B0B0F] text-white px-6 py-3 text-sm font-medium hover:bg-black inline-flex items-center gap-2">
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
          <span className="text-sm text-ink/50">{answeredCount}/{questions.length} answered</span>
        </div>
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-2xl border border-black/[0.07] bg-white shadow-sm p-4">
            <p className="font-medium mb-3"><span className="text-ink/50">{i + 1}.</span> {q.question}</p>
            {q.imageUrl && <img src={q.imageUrl} alt="" className="rounded-lg mb-3 max-h-60" />}
            <div className="space-y-2">
              {q.options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => setAnswers(a => ({ ...a, [q.id]: idx }))}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    answers[q.id] === idx ? 'border-[#E11D2E] bg-[#E11D2E]/5 font-medium' : 'border-black/[0.1] hover:border-black/20'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
        {error && <p className="text-[#C5121F] text-sm">{error}</p>}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-black/[0.07] p-3">
          <div className="max-w-3xl mx-auto">
            <button onClick={submit} disabled={busy} className="w-full rounded-xl bg-[#0B0B0F] text-white py-3 text-sm font-medium hover:bg-black inline-flex items-center justify-center gap-2">
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
      <div className="rounded-2xl border border-black/[0.07] bg-white shadow-sm text-center py-8 px-6 space-y-2">
        {result?.passed ? <CheckCircle2 className="h-14 w-14 mx-auto text-green-600" /> : <XCircle className="h-14 w-14 mx-auto text-[#E11D2E]" />}
        <h1 className="text-3xl font-bold">{result?.score}/{result?.total}</h1>
        <p className={`font-medium ${result?.passed ? 'text-green-600' : 'text-[#C5121F]'}`}>
          {result?.passed ? 'Passed — great work!' : 'Keep practicing — review the ones you missed below.'}
        </p>
      </div>

      {wrong.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">Questions to review ({wrong.length})</h2>
          {wrong.map(r => (
            <div key={r.id} className="rounded-2xl border border-[#E11D2E]/25 bg-[#E11D2E]/5 p-4">
              <p className="font-medium mb-2">{r.question}</p>
              <p className="text-sm text-[#C5121F] flex items-start gap-1.5">
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
        <button onClick={() => { setPhase('intro'); setResult(null) }} className="flex-1 rounded-xl bg-[#0B0B0F] text-white py-3 text-sm font-medium hover:bg-black">
          Take another
        </button>
        <button onClick={() => router.push('/study')} className="flex-1 rounded-xl border border-black/[0.1] bg-white py-3 text-sm font-medium hover:bg-[#F7F7F5]">
          Back to course
        </button>
      </div>
    </div>
  )
}
