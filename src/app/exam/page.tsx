'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  KeyRound, User, Clock, ChevronLeft, ChevronRight,
  Loader2, CheckCircle2, XCircle, AlertTriangle, Send,
} from 'lucide-react'

interface ExamQuestion {
  id: number
  question: string
  image?: string | null
  options: string[]
}

type ExamStep = 'code' | 'name' | 'exam' | 'submitting' | 'result'

export default function ExamPage() {
  const [step, setStep] = useState<ExamStep>('code')
  const [examCode, setExamCode] = useState('')
  const [studentName, setStudentName] = useState('')
  const [studentPhone, setStudentPhone] = useState('')
  const [error, setError] = useState('')

  // Exam data
  const [examId, setExamId] = useState('')
  const [groupName, setGroupName] = useState('')
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [passingScore, setPassingScore] = useState(18)

  // Attempt
  const [attemptId, setAttemptId] = useState('')
  const [startedAt, setStartedAt] = useState<Date | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [timeLeft, setTimeLeft] = useState(60 * 60) // 60 minutes in seconds

  // Result
  const [score, setScore] = useState(0)
  const [passed, setPassed] = useState(false)

  const autoSaveRef = useRef<NodeJS.Timeout | null>(null)

  // Timer
  useEffect(() => {
    if (step !== 'exam' || !startedAt) return
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000)
      const remaining = Math.max(0, 60 * 60 - elapsed)
      setTimeLeft(remaining)

      if (remaining <= 0) {
        clearInterval(interval)
        handleSubmit(true)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [step, startedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save every 30 seconds
  useEffect(() => {
    if (step !== 'exam' || !attemptId) return
    autoSaveRef.current = setInterval(() => {
      fetch(`/api/exam/${examId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', attemptId, answers }),
      }).catch(() => {})
    }, 30000)
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current) }
  }, [step, attemptId, examId, answers])

  const handleCodeSubmit = async () => {
    if (!examCode.trim()) return
    setError('')
    try {
      const res = await fetch(`/api/exam/${encodeURIComponent(examCode.trim())}?byCode=true`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Invalid exam code')
        return
      }
      const data = await res.json()
      setExamId(data.exam.id)
      setGroupName(data.exam.groupName)
      setQuestions(data.questions)
      setPassingScore(data.passingScore)
      setStep('name')
    } catch {
      setError('Failed to verify exam code')
    }
  }

  const handleStartExam = async () => {
    if (!studentName.trim()) return
    setError('')
    try {
      const res = await fetch(`/api/exam/${examId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', studentName: studentName.trim(), studentPhone }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to start exam')
        return
      }
      const data = await res.json()
      setAttemptId(data.attemptId)
      setStartedAt(new Date(data.startedAt))
      setAnswers(data.answers || {})
      setStep('exam')
    } catch {
      setError('Failed to start exam')
    }
  }

  const handleSubmit = useCallback(async (timeExpired = false) => {
    if (step === 'submitting' || step === 'result') return
    setStep('submitting')
    try {
      const res = await fetch(`/api/exam/${examId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', attemptId, answers, timeExpired }),
      })
      if (res.ok) {
        const data = await res.json()
        setScore(data.score)
        setPassed(data.passed)
        setStep('result')
      } else {
        setError('Failed to submit exam')
        setStep('exam')
      }
    } catch {
      setError('Failed to submit exam')
      setStep('exam')
    }
  }, [examId, attemptId, answers, step])

  const selectAnswer = (questionIdx: number, optionIdx: number) => {
    setAnswers(prev => ({ ...prev, [String(questionIdx)]: optionIdx }))
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const answeredCount = Object.keys(answers).length

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 text-red-700 text-sm flex items-center gap-2"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
              <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">x</button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {/* Step 1: Enter exam code */}
          {step === 'code' && (
            <motion.div
              key="code"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center pt-20"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              >
                <KeyRound className="h-16 w-16 mx-auto text-primary mb-6" />
              </motion.div>
              <h1 className="text-2xl font-bold mb-2">Module 5 Exam</h1>
              <p className="text-muted-foreground mb-8">Enter your exam code to begin</p>

              <div className="max-w-xs mx-auto space-y-4">
                <Input
                  value={examCode}
                  onChange={e => setExamCode(e.target.value.toUpperCase())}
                  placeholder="EXAM-XXXX-XXX"
                  className="text-center text-lg font-mono tracking-wider h-12"
                  onKeyDown={e => e.key === 'Enter' && handleCodeSubmit()}
                  autoFocus
                />
                <Button className="w-full h-12" onClick={handleCodeSubmit} disabled={!examCode.trim()}>
                  Continue
                </Button>
              </div>

              <p className="text-xs text-muted-foreground mt-8">Qazi Driving School</p>
            </motion.div>
          )}

          {/* Step 2: Enter name */}
          {step === 'name' && (
            <motion.div
              key="name"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center pt-16"
            >
              <User className="h-12 w-12 mx-auto text-primary mb-4" />
              <h2 className="text-xl font-bold mb-1">Welcome</h2>
              <p className="text-muted-foreground mb-6">{groupName}</p>

              <div className="max-w-xs mx-auto space-y-4">
                <div>
                  <Input
                    value={studentName}
                    onChange={e => setStudentName(e.target.value)}
                    placeholder="Your full name"
                    className="h-12"
                    onKeyDown={e => e.key === 'Enter' && handleStartExam()}
                    autoFocus
                  />
                </div>
                <div>
                  <Input
                    value={studentPhone}
                    onChange={e => setStudentPhone(e.target.value)}
                    placeholder="Phone number (optional)"
                    className="h-12"
                    type="tel"
                  />
                </div>
                <Button className="w-full h-12" onClick={handleStartExam} disabled={!studentName.trim()}>
                  Start Exam
                </Button>
              </div>

              <div className="mt-8 p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground max-w-sm mx-auto">
                <p className="font-medium text-foreground mb-2">Before you begin:</p>
                <ul className="space-y-1 text-left">
                  <li>- 24 multiple choice questions</li>
                  <li>- You need {passingScore} correct to pass</li>
                  <li>- You have 1 hour to complete</li>
                  <li>- Your progress auto-saves</li>
                </ul>
              </div>
            </motion.div>
          )}

          {/* Step 3: Exam */}
          {step === 'exam' && questions.length > 0 && (
            <motion.div
              key="exam"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {/* Top bar — timer + progress */}
              <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-3 border-b mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Q{currentQuestion + 1}/{questions.length}</span>
                    <span className="text-xs text-muted-foreground">({answeredCount} answered)</span>
                  </div>
                  <div className={`flex items-center gap-1.5 font-mono text-sm font-bold ${timeLeft < 300 ? 'text-red-500 animate-pulse' : timeLeft < 600 ? 'text-amber-500' : ''}`}>
                    <Clock className="h-4 w-4" />
                    {formatTime(timeLeft)}
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    animate={{ width: `${(answeredCount / questions.length) * 100}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>

              {/* Question */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentQuestion}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-4">
                      {currentQuestion + 1}. {questions[currentQuestion].question}
                    </h3>

                    {questions[currentQuestion].image && (
                      <img
                        src={questions[currentQuestion].image!}
                        alt="Question image"
                        className="w-full max-w-md mx-auto rounded-lg border mb-4"
                      />
                    )}

                    <div className="space-y-2">
                      {questions[currentQuestion].options.map((option, optIdx) => {
                        const isSelected = answers[String(currentQuestion)] === optIdx
                        return (
                          <motion.button
                            key={optIdx}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => selectAnswer(currentQuestion, optIdx)}
                            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-primary bg-primary/5 shadow-sm'
                                : 'border-muted hover:border-primary/30 hover:bg-muted/50'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium shrink-0 ${
                                isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                              }`}>
                                {String.fromCharCode(65 + optIdx)}
                              </div>
                              <span className="text-sm pt-0.5">{option}</span>
                            </div>
                          </motion.button>
                        )
                      })}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Navigation */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
                  disabled={currentQuestion === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>

                {/* Question dots */}
                <div className="hidden sm:flex gap-1 flex-wrap justify-center max-w-xs">
                  {questions.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentQuestion(i)}
                      className={`w-6 h-6 rounded-full text-xs font-medium transition-all ${
                        i === currentQuestion ? 'bg-primary text-primary-foreground scale-110' :
                        answers[String(i)] !== undefined ? 'bg-green-500 text-white' :
                        'bg-muted hover:bg-muted-foreground/20'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>

                {currentQuestion < questions.length - 1 ? (
                  <Button onClick={() => setCurrentQuestion(currentQuestion + 1)}>
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button onClick={() => handleSubmit(false)} className="bg-green-600 hover:bg-green-700">
                    <Send className="h-4 w-4 mr-1" /> Submit
                  </Button>
                )}
              </div>

              {/* Mobile question nav */}
              <div className="sm:hidden mt-4 flex gap-1 flex-wrap justify-center">
                {questions.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentQuestion(i)}
                    className={`w-8 h-8 rounded-full text-xs font-medium ${
                      i === currentQuestion ? 'bg-primary text-primary-foreground' :
                      answers[String(i)] !== undefined ? 'bg-green-500 text-white' :
                      'bg-muted'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Submitting */}
          {step === 'submitting' && (
            <motion.div
              key="submitting"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center pt-24"
            >
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
              <p className="font-medium">Submitting your exam...</p>
            </motion.div>
          )}

          {/* Result */}
          {step === 'result' && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center pt-16"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
              >
                {passed ? (
                  <CheckCircle2 className="h-20 w-20 mx-auto text-green-500 mb-6" />
                ) : (
                  <XCircle className="h-20 w-20 mx-auto text-red-500 mb-6" />
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <h2 className={`text-3xl font-bold mb-2 ${passed ? 'text-green-600' : 'text-red-600'}`}>
                  {passed ? 'Congratulations!' : 'Not Quite'}
                </h2>
                <p className="text-lg mb-6">
                  You scored <span className="font-bold">{score}</span> out of {questions.length}
                </p>

                <div className={`inline-block px-6 py-3 rounded-xl text-lg font-semibold mb-6 ${
                  passed ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                  'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {passed ? 'PASSED' : 'FAILED'}
                </div>

                <p className="text-muted-foreground max-w-sm mx-auto">
                  {passed
                    ? 'You have successfully passed the Module 5 exam. Great job!'
                    : 'You did not reach the passing score of 18. We will contact you to schedule a retake.'
                  }
                </p>

                <p className="text-xs text-muted-foreground mt-8">You can close this page now.</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
