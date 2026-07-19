'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { GraduationCap, Loader2, KeyRound, Send, RotateCcw, Copy, CheckCircle2, XCircle, BookOpen, ClipboardList } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  student: { studentId?: string; phone?: string; name?: string; licence?: string }
}

interface Activity {
  account: { username: string; vehicleType: string; createdAt: string; lastLoginAt: string | null } | null
  summary?: { lessonsCompleted: number; lessonsViewed: number; totalLessons: number; examsTaken: number; bestScore: number }
  progress?: { lesson: string; section: string; completed: boolean; lastViewedAt: string }[]
  attempts?: { id: string; score: number | null; total: number | null; submittedAt: string | null; wrong: { question: string; yourAnswer: string; correctAnswer: string }[] }[]
  events?: { type: string; detail: string | null; createdAt: string }[]
}

const fmt = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const q = (s: Props['student']) => new URLSearchParams(
  Object.fromEntries(Object.entries(s).filter(([, v]) => v)) as Record<string, string>
).toString()

export function LmsActivityPanel({ open, onOpenChange, student }: Props) {
  const [data, setData] = useState<Activity | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [cred, setCred] = useState<{ username: string; password: string | null } | null>(null)
  const [copied, setCopied] = useState(false)
  const [msg, setMsg] = useState('')

  const load = () => {
    setLoading(true)
    fetch(`/api/lms/admin/activity?${q(student)}`).then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(() => { if (open) { setCred(null); setMsg(''); load() } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const account = (action: string) => async () => {
    setBusy(true); setMsg('')
    const res = await fetch('/api/lms/admin/accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...student }),
    })
    const d = await res.json()
    setBusy(false)
    if (action === 'send') {
      setMsg(res.ok ? `Sent login to WhatsApp (${d.username})` : (d.error || 'Send failed'))
      if (d.username && d.password) setCred({ username: d.username, password: d.password })
    } else {
      if (res.ok) { setCred({ username: d.username, password: d.password }); setMsg(d.created ? 'Account created' : d.password ? 'Password reset' : 'Account exists') }
      else setMsg(d.error || 'Failed')
    }
    load()
  }

  const copyCred = () => {
    if (!cred) return
    navigator.clipboard.writeText(`Study portal: https://study.qazidriving.ca\nUsername: ${cred.username}\nPassword: ${cred.password ?? '(unchanged)'}`)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const s = data?.summary
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5" /> LMS Activity</DialogTitle>
          <DialogDescription>Study portal login, progress, and mock-exam results.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-5">
            {/* Account / credentials */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  {data?.account ? (
                    <span className="font-mono">{data.account.username}</span>
                  ) : (
                    <span className="text-muted-foreground">No login yet</span>
                  )}
                </div>
                {data?.account && (
                  <span className="text-xs text-muted-foreground">
                    {data.account.lastLoginAt ? `Last login ${fmt(data.account.lastLoginAt)}` : 'Never logged in'}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {!data?.account && <Button size="sm" onClick={account('create')} disabled={busy}>Create login</Button>}
                {data?.account && <Button size="sm" variant="outline" onClick={account('reset')} disabled={busy}><RotateCcw className="h-4 w-4 mr-1" /> Reset password</Button>}
                <Button size="sm" onClick={account('send')} disabled={busy}><Send className="h-4 w-4 mr-1" /> Send via WhatsApp</Button>
                {busy && <Loader2 className="h-4 w-4 animate-spin self-center" />}
              </div>
              {cred && (
                <div className="rounded-md bg-muted/60 p-3 text-sm font-mono flex items-center justify-between gap-2">
                  <div>
                    <div>{cred.username}</div>
                    <div>{cred.password ? `Password: ${cred.password}` : 'Password unchanged'}</div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={copyCred}>{copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}</Button>
                </div>
              )}
              {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
            </div>

            {data?.account && s && (
              <>
                {/* Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat icon={<BookOpen className="h-4 w-4" />} label="Lessons done" value={`${s.lessonsCompleted}/${s.totalLessons}`} />
                  <Stat icon={<BookOpen className="h-4 w-4" />} label="Viewed" value={String(s.lessonsViewed)} />
                  <Stat icon={<ClipboardList className="h-4 w-4" />} label="Exams taken" value={String(s.examsTaken)} />
                  <Stat icon={<ClipboardList className="h-4 w-4" />} label="Best score" value={s.bestScore ? String(s.bestScore) : '—'} />
                </div>

                {/* Exam attempts with wrong answers */}
                {(data.attempts || []).filter(a => a.submittedAt).length > 0 && (
                  <div>
                    <h3 className="font-semibold text-sm mb-2">Mock exams</h3>
                    <div className="space-y-2">
                      {data.attempts!.filter(a => a.submittedAt).map(a => (
                        <details key={a.id} className="rounded-lg border">
                          <summary className="cursor-pointer p-3 flex items-center justify-between text-sm">
                            <span>{a.submittedAt ? fmt(a.submittedAt) : ''}</span>
                            <span className="flex items-center gap-2">
                              <Badge className={(a.score ?? 0) / (a.total || 1) >= 0.75 ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>
                                {a.score}/{a.total}
                              </Badge>
                              {a.wrong.length > 0 && <span className="text-xs text-muted-foreground">{a.wrong.length} wrong</span>}
                            </span>
                          </summary>
                          {a.wrong.length > 0 && (
                            <div className="p-3 pt-0 space-y-2">
                              {a.wrong.map((w, i) => (
                                <div key={i} className="text-sm border-t pt-2">
                                  <p className="font-medium">{w.question}</p>
                                  <p className="text-red-700 flex items-center gap-1"><XCircle className="h-3.5 w-3.5" /> {w.yourAnswer}</p>
                                  <p className="text-green-700 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> {w.correctAnswer}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </details>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent activity timeline */}
                {(data.events || []).length > 0 && (
                  <div>
                    <h3 className="font-semibold text-sm mb-2">Recent activity</h3>
                    <div className="space-y-1 max-h-52 overflow-y-auto text-sm">
                      {data.events!.map((e, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 py-1 border-b last:border-0">
                          <span className="capitalize">{e.type.replace(/_/g, ' ')}{e.detail ? <span className="text-muted-foreground"> · {e.detail}</span> : ''}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">{fmt(e.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-muted-foreground flex items-center gap-1 text-xs">{icon}{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  )
}
