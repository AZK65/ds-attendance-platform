'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, AlertTriangle, ClipboardList,
} from 'lucide-react'
import Link from 'next/link'
import { motion } from 'motion/react'

interface ReviewQuestion {
  questionNumber: number
  question: string
  image: string | null
  options: string[]
  studentAnswer: number | null
  correctAnswer: number
  isCorrect: boolean
}

interface ExamReview {
  studentName: string
  score: number
  passed: boolean
  totalQuestions: number
  submittedAt: string
  timeExpired: boolean
  tabSwitches: number
  review: ReviewQuestion[]
}

export default function ExamReviewPage() {
  const params = useParams()
  const attemptId = params.attemptId as string

  const { data, isLoading } = useQuery<ExamReview>({
    queryKey: ['exam-review', attemptId],
    queryFn: async () => {
      // First get the attempt to find the examId
      const attemptRes = await fetch(`/api/exam?attemptId=${attemptId}`)
      let examId = ''
      if (attemptRes.ok) {
        const attemptData = await attemptRes.json()
        examId = attemptData.examId
      }
      // Fallback: try getting from the attempt directly
      if (!examId) {
        // We need the examId — search all exams
        const examsRes = await fetch('/api/exam')
        if (examsRes.ok) {
          const examsData = await examsRes.json()
          for (const exam of examsData.exams || []) {
            const match = exam.attempts?.find((a: { id: string }) => a.id === attemptId)
            if (match) { examId = exam.id; break }
          }
        }
      }
      if (!examId) throw new Error('Exam not found')

      const res = await fetch(`/api/exam/${examId}/review?attemptId=${attemptId}`)
      if (!res.ok) throw new Error('Failed to fetch review')
      return res.json()
    },
  })

  if (isLoading) {
    return <main className="max-w-3xl mx-auto p-6 flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></main>
  }

  if (!data) {
    return <main className="max-w-3xl mx-auto p-6"><p className="text-center text-muted-foreground py-20">Review not found</p></main>
  }

  const correctCount = data.review.filter(q => q.isCorrect).length
  const wrongCount = data.review.filter(q => !q.isCorrect).length
  const unanswered = data.review.filter(q => q.studentAnswer === null).length

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/students"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="h-6 w-6" /> Exam Review
            </h1>
            <p className="text-muted-foreground mt-1">{data.studentName}</p>
          </div>
          <Badge className={`text-lg px-4 py-1 ${data.passed ? 'bg-green-600' : 'bg-red-600'}`}>
            {data.score}/{data.totalQuestions} — {data.passed ? 'PASSED' : 'FAILED'}
          </Badge>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center">
          <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-green-600" />
          <p className="text-xs text-muted-foreground">Correct</p>
          <p className="text-xl font-bold text-green-700">{correctCount}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <XCircle className="h-5 w-5 mx-auto mb-1 text-red-600" />
          <p className="text-xs text-muted-foreground">Wrong</p>
          <p className="text-xl font-bold text-red-700">{wrongCount - unanswered}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-amber-600" />
          <p className="text-xs text-muted-foreground">Unanswered</p>
          <p className="text-xl font-bold text-amber-700">{unanswered}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Tab Switches</p>
          <p className={`text-xl font-bold ${data.tabSwitches > 0 ? 'text-red-600' : ''}`}>{data.tabSwitches}</p>
        </CardContent></Card>
      </motion.div>

      {/* Questions */}
      <div className="space-y-4">
        {data.review.map((q, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.02 }}
          >
            <Card className={`${q.isCorrect ? 'border-green-200' : 'border-red-200'}`}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white ${q.isCorrect ? 'bg-green-500' : 'bg-red-500'}`}>
                    {q.questionNumber}
                  </div>
                  <p className="font-medium text-sm leading-relaxed">{q.question}</p>
                </div>

                {q.image && (
                  <img src={q.image} alt="" className="w-full max-w-md rounded-lg border mb-3 ml-10" />
                )}

                <div className="space-y-1.5 ml-10">
                  {q.options.map((option, optIdx) => {
                    const isStudentAnswer = q.studentAnswer === optIdx
                    const isCorrectAnswer = q.correctAnswer === optIdx
                    const isWrongSelection = isStudentAnswer && !q.isCorrect

                    return (
                      <div
                        key={optIdx}
                        className={`flex items-start gap-2 p-2 rounded-lg text-sm ${
                          isCorrectAnswer ? 'bg-green-50 dark:bg-green-950/20 border border-green-300' :
                          isWrongSelection ? 'bg-red-50 dark:bg-red-950/20 border border-red-300' :
                          'bg-muted/30'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                          isCorrectAnswer ? 'bg-green-500 text-white' :
                          isWrongSelection ? 'bg-red-500 text-white' :
                          'bg-muted'
                        }`}>
                          {String.fromCharCode(65 + optIdx)}
                        </div>
                        <span className="pt-0.5">{option}</span>
                        {isCorrectAnswer && <CheckCircle2 className="h-4 w-4 text-green-600 ml-auto shrink-0 mt-0.5" />}
                        {isWrongSelection && <XCircle className="h-4 w-4 text-red-500 ml-auto shrink-0 mt-0.5" />}
                      </div>
                    )
                  })}
                  {q.studentAnswer === null && (
                    <p className="text-xs text-amber-600 font-medium mt-1">Not answered</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </main>
  )
}
