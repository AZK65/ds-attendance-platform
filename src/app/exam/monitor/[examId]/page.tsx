'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, Loader2, Users, CheckCircle2, XCircle, Clock,
  Copy, Check, AlertTriangle, BarChart3,
} from 'lucide-react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { useState } from 'react'

interface StudentStatus {
  id: string
  name: string
  phone: string | null
  answeredCount: number
  totalQuestions: number
  progress: number
  timeRemainingSeconds: number
  startedAt: string
  submittedAt: string | null
  score: number | null
  passed: boolean | null
  timeExpired: boolean
  status: 'in-progress' | 'passed' | 'failed'
}

interface ExamStatus {
  exam: { id: string; code: string; groupName: string; active: boolean; createdAt: string }
  students: StudentStatus[]
  summary: { total: number; inProgress: number; completed: number; passed: number; failed: number }
}

export default function ExamMonitorPage() {
  const params = useParams()
  const examId = params.examId as string
  const [copied, setCopied] = useState(false)

  const { data, isLoading } = useQuery<ExamStatus>({
    queryKey: ['exam-status', examId],
    queryFn: async () => {
      const res = await fetch(`/api/exam/${examId}/status`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    refetchInterval: 2000, // Poll every 2 seconds for near-realtime updates
  })

  const copyLink = () => {
    if (data?.exam.code) {
      navigator.clipboard.writeText(`https://qazidrivingschool.ca/exam?code=${data.exam.code}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  if (isLoading) {
    return <main className="max-w-4xl mx-auto p-6 flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></main>
  }

  if (!data) {
    return <main className="max-w-4xl mx-auto p-6"><p className="text-center text-muted-foreground py-20">Exam not found</p></main>
  }

  const { exam, students, summary } = data

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/groups/${encodeURIComponent(exam.id)}`}><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5" /> Exam Monitor
            </h1>
            <p className="text-sm text-muted-foreground">{exam.groupName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <code className="px-3 py-1.5 bg-muted rounded-lg text-sm font-mono">{exam.code}</code>
          <Button variant="outline" size="sm" onClick={copyLink}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </motion.div>

      {/* Live indicator */}
      {summary.inProgress > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 text-sm"
        >
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          Live — refreshing every 5 seconds
        </motion.div>
      )}

      {/* Summary Cards */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: summary.total, icon: Users, color: 'text-blue-600' },
          { label: 'In Progress', value: summary.inProgress, icon: Clock, color: 'text-amber-600' },
          { label: 'Completed', value: summary.completed, icon: CheckCircle2, color: 'text-indigo-600' },
          { label: 'Passed', value: summary.passed, icon: CheckCircle2, color: 'text-green-600' },
          { label: 'Failed', value: summary.failed, icon: XCircle, color: 'text-red-600' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.04 }}>
            <Card><CardContent className="p-3 text-center">
              <stat.icon className={`h-5 w-5 mx-auto mb-1 ${stat.color}`} />
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-xl font-bold">{stat.value}</p>
            </CardContent></Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Student List */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card>
          <CardHeader><CardTitle className="text-base">Students</CardTitle></CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No students have started the exam yet</p>
            ) : (
              <div className="space-y-3">
                {students.map((student, i) => (
                  <motion.div
                    key={student.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`p-4 rounded-lg border ${
                      student.status === 'passed' ? 'border-green-200 bg-green-50/50 dark:bg-green-950/10' :
                      student.status === 'failed' ? 'border-red-200 bg-red-50/50 dark:bg-red-950/10' :
                      'border-muted'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{student.name}</span>
                        {student.phone && <span className="text-xs text-muted-foreground">{student.phone}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {student.status === 'in-progress' && (
                          <>
                            <span className={`text-sm font-mono font-bold ${
                              student.timeRemainingSeconds < 300 ? 'text-red-500' :
                              student.timeRemainingSeconds < 600 ? 'text-amber-500' : ''
                            }`}>
                              {formatTime(student.timeRemainingSeconds)}
                            </span>
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800">In Progress</Badge>
                          </>
                        )}
                        {student.status === 'passed' && (
                          <Badge className="bg-green-600">{student.score}/{student.totalQuestions} Passed</Badge>
                        )}
                        {student.status === 'failed' && (
                          <Badge variant="destructive">
                            {student.score}/{student.totalQuestions} Failed
                            {student.timeExpired && <AlertTriangle className="h-3 w-3 ml-1" />}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${
                          student.status === 'passed' ? 'bg-green-500' :
                          student.status === 'failed' ? 'bg-red-500' :
                          'bg-primary'
                        }`}
                        animate={{ width: `${student.submittedAt ? 100 : student.progress}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-muted-foreground">
                        {student.answeredCount}/{student.totalQuestions} answered
                      </span>
                      {student.submittedAt && (
                        <span className="text-xs text-muted-foreground">
                          Submitted {new Date(student.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          {student.timeExpired && ' (time expired)'}
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </main>
  )
}
