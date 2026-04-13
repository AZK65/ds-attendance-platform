'use client'

import { useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft, Loader2, Phone, MapPin, Mail, Calendar, CreditCard,
  Award, Users, DollarSign, FileText, Receipt, Clock, Plus,
  BookOpen, GraduationCap, Database, CalendarDays, Download,
  CheckCircle, XCircle, ChevronDown, ChevronUp, ClipboardList,
  Shield,
} from 'lucide-react'
import Link from 'next/link'
import { motion } from 'motion/react'

interface TeamupEvent {
  id: string
  title: string
  start_dt: string
  end_dt: string
  subcalendar_ids: number[]
  notes?: string
}

interface SubCalendar { id: number; name: string }

interface StudentProfile {
  student: {
    student_id: number; full_name: string; phone_number: string; permit_number: string;
    full_address: string; city: string; postal_code: string; email: string; dob: string;
    status: string; contract_number: number; user_defined_contract_number: number | null;
  }
  localStudent: {
    id: string
    certificates: Array<{
      id: string; certificateType: string; contractNumber: string | null;
      attestationNumber: string | null; generatedAt: string;
    }>
  } | null
  invoices: Array<{
    id: string; invoiceNumber: string; invoiceDate: string; total: number;
    paymentStatus: string; lineItems: string;
  }>
  groups: Array<{ groupId: string; groupName: string; moduleNumber: number | null }>
  exams?: Array<{
    id: string; examCode: string; groupName: string; score: number | null;
    passed: boolean | null; totalQuestions: number; startedAt: string;
    submittedAt: string | null; timeExpired: boolean;
  }>
  summary: {
    totalInvoiced: number; totalPaid: number; openBalance: number;
    invoiceCount: number; certificateCount: number; groupCount: number;
  }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount)
}

function parseModuleFromTitle(title: string) {
  const match = title.match(/^(?:Session|M|Module)\s*(\d+)/i)
  return match ? match[1] : null
}

export default function StudentProfilePage() {
  const params = useParams()
  const router = useRouter()
  const studentId = params.studentId as string
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null)

  const { data, isLoading } = useQuery<StudentProfile>({
    queryKey: ['student-profile', studentId],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  const student = data?.student
  const phone = student?.phone_number?.replace(/\D/g, '') || ''
  const displayName = student?.full_name || 'Unknown'
  const groupNames = data?.groups?.map(g => g.groupName) || []

  // Fetch Teamup events
  const { data: studentEvents = [], isLoading: loadingEvents } = useQuery<TeamupEvent[]>({
    queryKey: ['student-events-standalone', displayName, phone, groupNames],
    queryFn: async () => {
      const allEvents: TeamupEvent[] = []
      const seenIds = new Set<string>()
      const fetchEvents = async (p: URLSearchParams) => {
        const res = await fetch(`/api/scheduling/student-events?${p}`)
        if (!res.ok) return
        const events: TeamupEvent[] = await res.json()
        for (const e of events) { if (!seenIds.has(e.id)) { seenIds.add(e.id); allEvents.push(e) } }
      }
      const p1 = new URLSearchParams()
      if (student?.full_name) p1.set('studentName', student.full_name)
      if (phone) p1.set('phone', phone)
      for (const gn of groupNames) { if (gn) p1.set('groupName', gn) }
      await fetchEvents(p1)
      if (student?.full_name) {
        const parts = student.full_name.trim().split(/\s+/).filter(p => p.length >= 3)
        if (parts.length >= 2) {
          const shortName = parts.slice(-2).join(' ')
          if (shortName !== student.full_name) {
            const p2 = new URLSearchParams()
            p2.set('studentName', shortName)
            await fetchEvents(p2)
          }
        }
      }
      return allEvents
    },
    enabled: !!student,
  })

  // Fetch attendance
  const eventIds = studentEvents.map(e => e.id).join(',')
  const { data: attendanceMap = {} } = useQuery<Record<string, boolean>>({
    queryKey: ['class-attendance-standalone', eventIds],
    queryFn: async () => {
      if (!eventIds) return {}
      const res = await fetch(`/api/scheduling/attendance?eventIds=${eventIds}`)
      if (!res.ok) return {}
      return res.json()
    },
    enabled: studentEvents.length > 0,
  })

  // Fetch teachers
  const { data: subcalendars = [] } = useQuery<SubCalendar[]>({
    queryKey: ['subcalendars'],
    queryFn: async () => {
      const res = await fetch('/api/scheduling/subcalendars')
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const getTeacherName = (ids: number[]) => subcalendars.find(s => ids.includes(s.id))?.name?.split(' ')[0] || ''

  const { upcomingEvents, pastEvents } = useMemo(() => {
    const now = new Date()
    const upcoming = studentEvents.filter(e => new Date(e.start_dt) >= now).sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime())
    const past = studentEvents.filter(e => new Date(e.start_dt) < now).sort((a, b) => new Date(b.start_dt).getTime() - new Date(a.start_dt).getTime())
    return { upcomingEvents: upcoming, pastEvents: past }
  }, [studentEvents])

  if (isLoading) return <main className="max-w-3xl mx-auto p-6 flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></main>
  if (!data || !student) return <main className="max-w-3xl mx-auto p-6"><p className="text-center text-muted-foreground py-20">Student not found</p></main>

  const { invoices, groups, summary } = data

  const renderEventCard = (event: TeamupEvent) => {
    const module = parseModuleFromTitle(event.title)
    const teacher = getTeacherName(event.subcalendar_ids)
    const startDt = new Date(event.start_dt)
    const endDt = new Date(event.end_dt)
    const dateStr = startDt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    const startTime = startDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    const endTime = endDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    const isPast = startDt < new Date()
    const hasAttendance = event.id in attendanceMap
    const isPresent = attendanceMap[event.id]

    return (
      <div key={event.id} className={`flex items-center justify-between p-3 rounded-lg border ${
        isPast ? (hasAttendance ? (isPresent ? 'bg-green-50/50 dark:bg-green-950/10 border-green-200' : 'bg-red-50/50 dark:bg-red-950/10 border-red-200') : '') : 'bg-blue-50/50 dark:bg-blue-950/10 border-blue-200'
      }`}>
        <div className="flex items-center gap-3 min-w-0">
          {isPast && hasAttendance ? (
            isPresent ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />
          ) : isPast ? <div className="w-4 h-4 rounded-full border border-muted-foreground/30 shrink-0" /> : <CalendarDays className="h-4 w-4 text-blue-600 shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{event.title}</p>
            <p className="text-xs text-muted-foreground">{dateStr} {startTime} - {endTime}{teacher ? ` with ${teacher}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasAttendance && <Badge variant={isPresent ? 'default' : 'destructive'} className="text-xs">{isPresent ? 'Present' : 'Absent'}</Badge>}
          {module && <Badge variant="outline" className="text-xs">M{module}</Badge>}
        </div>
      </div>
    )
  }

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header — same as group profile */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/students"><ArrowLeft className="h-4 w-4 mr-1" /> Back to Students</Link>
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{displayName}</h1>
            <a href={`tel:+${phone}`} className="text-muted-foreground hover:text-primary flex items-center gap-1 mt-1">
              <Phone className="h-4 w-4" /> +{phone}
            </a>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="default" size="sm" asChild>
              <Link href={`/scheduling?bookFor=${encodeURIComponent(displayName)}&phone=${encodeURIComponent(phone)}`}>
                <CalendarDays className="h-4 w-4 mr-1" /> Book Class
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/certificate?studentName=${encodeURIComponent(displayName)}&studentPhone=${encodeURIComponent(phone)}`}>
                <Award className="h-4 w-4 mr-1" /> Certificate
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/invoice?studentName=${encodeURIComponent(student.full_name)}&studentPhone=${encodeURIComponent(student.phone_number)}&studentAddress=${encodeURIComponent(student.full_address || '')}&studentCity=${encodeURIComponent(student.city || '')}&studentPostalCode=${encodeURIComponent(student.postal_code || '')}&studentEmail=${encodeURIComponent(student.email || '')}`}>
                <Receipt className="h-4 w-4 mr-1" /> Invoice
              </Link>
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Info Cards — same 6-column layout */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.25 }} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {groups.length > 0 ? (
          <Link href={`/groups/${encodeURIComponent(groups[0].groupId)}`} className="p-3 border rounded-lg text-center hover:bg-accent/50 transition-colors cursor-pointer block">
            <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Group</p>
            <p className="font-medium text-sm truncate text-primary">{groups[0].groupName}</p>
          </Link>
        ) : (
          <div className="p-3 border rounded-lg text-center">
            <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Group</p>
            <p className="font-medium text-sm text-muted-foreground">None</p>
          </div>
        )}
        <div className="p-3 border rounded-lg text-center">
          <Shield className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="font-medium text-sm">{student.status || 'Active'}</p>
        </div>
        <div className="p-3 border rounded-lg text-center">
          <CalendarDays className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">Classes</p>
          <p className="font-medium text-sm">{studentEvents.length}</p>
        </div>
        <div className="p-3 border rounded-lg text-center">
          <GraduationCap className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">Attendance</p>
          <p className="font-medium text-sm">{Object.keys(attendanceMap).length > 0 ? `${Math.round((Object.values(attendanceMap).filter(v => v).length / Object.keys(attendanceMap).length) * 100)}%` : '-'}</p>
        </div>
        <div className="p-3 border rounded-lg text-center">
          <DollarSign className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">Invoiced</p>
          <p className="font-medium text-sm">${summary.totalInvoiced.toFixed(2)}</p>
        </div>
        <div className={`p-3 border rounded-lg text-center ${summary.openBalance > 0 ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30' : ''}`}>
          <CreditCard className={`h-5 w-5 mx-auto mb-1 ${summary.openBalance > 0 ? 'text-amber-600' : 'text-green-600'}`} />
          <p className="text-xs text-muted-foreground">Balance</p>
          <p className={`font-medium text-sm ${summary.openBalance > 0 ? 'text-amber-700' : 'text-green-700'}`}>
            {summary.openBalance > 0 ? `$${summary.openBalance.toFixed(2)}` : 'Paid up'}
          </p>
        </div>
      </motion.div>

      {/* Database Profile Card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.25 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Database className="h-5 w-5" /> Student Profile
              <Badge variant="outline" className="ml-auto text-xs text-blue-600 border-blue-200">Matched from DB</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div><p className="text-xs text-muted-foreground">Full Name</p><p className="font-medium">{student.full_name}</p></div>
                {student.permit_number && (
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">Permit Number</p><p className="text-sm">{student.permit_number}</p></div>
                  </div>
                )}
                {(student.contract_number || student.user_defined_contract_number) && (
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">Contract #</p><p className="text-sm">{student.user_defined_contract_number || student.contract_number}</p></div>
                  </div>
                )}
                {student.dob && student.dob !== '0000-00-00' && (
                  <div><p className="text-xs text-muted-foreground">Date of Birth</p><p className="text-sm">{new Date(student.dob).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p></div>
                )}
              </div>
              <div className="space-y-3">
                {student.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm">{student.email}</p></div>
                  </div>
                )}
                {(student.full_address || student.city) && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div><p className="text-xs text-muted-foreground">Address</p><p className="text-sm">{[student.full_address, student.city, student.postal_code].filter(Boolean).join(', ')}</p></div>
                  </div>
                )}
                {student.status && (
                  <div><p className="text-xs text-muted-foreground">Status</p><Badge variant="secondary" className="text-xs mt-0.5">{student.status}</Badge></div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Certificate Info */}
      {data.localStudent && data.localStudent.certificates.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.25 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Award className="h-5 w-5" /> Certificate Info
                <Badge variant="secondary" className="ml-auto text-xs">{data.localStudent.certificates.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.localStudent.certificates.map(cert => (
                  <div key={cert.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${cert.certificateType === 'full' ? 'bg-green-100 dark:bg-green-950' : 'bg-blue-100 dark:bg-blue-950'}`}>
                        <GraduationCap className={`h-4 w-4 ${cert.certificateType === 'full' ? 'text-green-600' : 'text-blue-600'}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{cert.certificateType === 'full' ? 'Full Certificate' : 'Learners Certificate'}</p>
                        <p className="text-xs text-muted-foreground">{new Date(cert.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        <div className="flex flex-wrap gap-x-3 mt-0.5">
                          {cert.contractNumber && <p className="text-xs"><span className="text-muted-foreground">Contract: </span><span className="font-mono font-medium">{cert.contractNumber}</span></p>}
                          {cert.attestationNumber && <p className="text-xs"><span className="text-muted-foreground">Attestation: </span><span className="font-mono font-medium">{cert.attestationNumber}</span></p>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Upcoming Classes */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.25 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="h-5 w-5" /> Upcoming Classes
              {upcomingEvents.length > 0 && <Badge variant="secondary" className="ml-auto">{upcomingEvents.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingEvents ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin mr-2" /><span className="text-muted-foreground">Loading schedule...</span></div>
            ) : upcomingEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No upcoming classes scheduled</p>
            ) : (
              <div className="space-y-2">{upcomingEvents.map(renderEventCard)}</div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Past Classes */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.25 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" /> Past Classes
              {pastEvents.length > 0 && <Badge variant="secondary" className="ml-auto">{pastEvents.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingEvents ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin mr-2" /><span className="text-muted-foreground">Loading...</span></div>
            ) : pastEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No past classes found</p>
            ) : (
              <div className="space-y-2">
                {pastEvents.slice(0, 20).map(renderEventCard)}
                {pastEvents.length > 20 && <p className="text-sm text-muted-foreground text-center pt-2">Showing 20 of {pastEvents.length} past classes</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Invoice History */}
      {invoices.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.25 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Receipt className="h-5 w-5" /> Invoice History
                <Badge variant="secondary" className="ml-auto">{invoices.length}</Badge>
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  Total: {formatCurrency(summary.totalInvoiced)} | Paid: {formatCurrency(summary.totalPaid)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {invoices.map(inv => {
                  let lineItems: Array<{ description: string; quantity: number; unitPrice: number }> = []
                  try { lineItems = JSON.parse(inv.lineItems) } catch { /* skip */ }
                  const isExpanded = expandedInvoice === inv.id

                  return (
                    <div key={inv.id}>
                      <div
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => setExpandedInvoice(isExpanded ? null : inv.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium">Invoice #{inv.invoiceNumber}</p>
                            <p className="text-xs text-muted-foreground">{inv.invoiceDate}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-medium text-sm">{formatCurrency(inv.total)}</span>
                          <Badge variant={inv.paymentStatus === 'paid' ? 'default' : inv.paymentStatus === 'refunded' ? 'secondary' : 'outline'}
                            className={`text-xs ${inv.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' : inv.paymentStatus === 'refunded' ? 'bg-purple-100 text-purple-800' : 'text-orange-600'}`}>
                            {inv.paymentStatus}
                          </Badge>
                          {lineItems.length > 0 && (isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                        </div>
                      </div>
                      {isExpanded && lineItems.length > 0 && (
                        <div className="ml-7 mr-3 mt-1 mb-2 p-2 bg-muted/30 rounded text-xs">
                          <table className="w-full">
                            <thead><tr className="text-muted-foreground"><th className="text-left py-1">Item</th><th className="text-center py-1">Qty</th><th className="text-right py-1">Price</th><th className="text-right py-1">Total</th></tr></thead>
                            <tbody>
                              {lineItems.map((item, idx) => (
                                <tr key={idx} className="border-t border-muted">
                                  <td className="py-1">{item.description}</td>
                                  <td className="text-center py-1">{item.quantity}</td>
                                  <td className="text-right py-1">${item.unitPrice.toFixed(2)}</td>
                                  <td className="text-right py-1">${(item.quantity * item.unitPrice).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
                <div className="flex justify-center">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/invoice?studentName=${encodeURIComponent(student.full_name)}&studentPhone=${encodeURIComponent(student.phone_number)}&studentAddress=${encodeURIComponent(student.full_address || '')}&studentCity=${encodeURIComponent(student.city || '')}&studentPostalCode=${encodeURIComponent(student.postal_code || '')}&studentEmail=${encodeURIComponent(student.email || '')}`}>
                      <Plus className="h-4 w-4 mr-1" /> Create Invoice
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Exam Results */}
      {data.exams && data.exams.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.25 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="h-5 w-5" /> Exam Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.exams.map(exam => (
                  <div key={exam.id} className={`flex items-center justify-between p-3 rounded-lg ${
                    exam.passed ? 'bg-green-50 dark:bg-green-950/10 border border-green-200' :
                    exam.passed === false ? 'bg-red-50 dark:bg-red-950/10 border border-red-200' : 'bg-muted/50 border'
                  }`}>
                    <div>
                      <p className="font-medium text-sm">{exam.groupName}</p>
                      <p className="text-xs text-muted-foreground">
                        Code: {exam.examCode} — {exam.submittedAt ? new Date(exam.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'In progress'}
                        {exam.timeExpired && ' (time expired)'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {exam.score !== null && <span className="font-mono font-bold text-sm">{exam.score}/{exam.totalQuestions}</span>}
                      {exam.passed === true && <Badge className="bg-green-600">Passed</Badge>}
                      {exam.passed === false && <Badge variant="destructive">Failed</Badge>}
                      {exam.passed === null && <Badge variant="secondary">In Progress</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </main>
  )
}
