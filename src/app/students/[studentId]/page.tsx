'use client'

import { useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, Loader2, Phone, MapPin, Mail, Calendar, CreditCard,
  Award, Users, DollarSign, FileText, Receipt, Clock, ChevronDown,
  ChevronUp, BookOpen, User,
} from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'motion/react'

interface TeamupEvent {
  id: string
  title: string
  start_dt: string
  end_dt: string
  subcalendar_ids: number[]
  notes?: string
}

interface SubCalendar {
  id: number
  name: string
}

interface StudentProfile {
  student: {
    student_id: number
    full_name: string
    phone_number: string
    permit_number: string
    full_address: string
    city: string
    postal_code: string
    email: string
    dob: string
    status: string
    contract_number: number
    user_defined_contract_number: number | null
  }
  localStudent: {
    id: string
    certificates: Array<{
      id: string
      certificateType: string
      contractNumber: string | null
      attestationNumber: string | null
      generatedAt: string
    }>
  } | null
  invoices: Array<{
    id: string
    invoiceNumber: string
    invoiceDate: string
    total: number
    paymentStatus: string
    lineItems: string
  }>
  groups: Array<{
    groupId: string
    groupName: string
    moduleNumber: number | null
  }>
  summary: {
    totalInvoiced: number
    totalPaid: number
    openBalance: number
    invoiceCount: number
    certificateCount: number
    groupCount: number
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
  const studentId = params.studentId as string
  const [showAllPast, setShowAllPast] = useState(false)
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null)

  // Fetch student data from MySQL + SQLite
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
  const groupNames = data?.groups?.map(g => g.groupName) || []

  // Fetch Teamup events for this student
  // Search by full name, individual name parts, and phone — some events use shortened names
  const { data: studentEvents = [], isLoading: loadingEvents } = useQuery<TeamupEvent[]>({
    queryKey: ['student-events-standalone', student?.full_name, phone, groupNames],
    queryFn: async () => {
      const allEvents: TeamupEvent[] = []
      const seenIds = new Set<string>()

      // Helper to fetch and merge
      const fetchEvents = async (p: URLSearchParams) => {
        const res = await fetch(`/api/scheduling/student-events?${p}`)
        if (!res.ok) return
        const events: TeamupEvent[] = await res.json()
        for (const e of events) {
          if (!seenIds.has(e.id)) { seenIds.add(e.id); allEvents.push(e) }
        }
      }

      // Search by full name + phone + group names
      const params1 = new URLSearchParams()
      if (student?.full_name) params1.set('studentName', student.full_name)
      if (phone) params1.set('phone', phone)
      for (const gn of groupNames) { if (gn) params1.set('groupName', gn) }
      await fetchEvents(params1)

      // Also search by individual name parts (catches "Andres Inaki" when MySQL has "Aguilar Trejo Andres Inaki")
      if (student?.full_name) {
        const parts = student.full_name.trim().split(/\s+/).filter(p => p.length >= 3)
        // Try last 2 parts (usually first + last name used for booking)
        if (parts.length >= 2) {
          const shortName = parts.slice(-2).join(' ')
          if (shortName !== student.full_name) {
            const params2 = new URLSearchParams()
            params2.set('studentName', shortName)
            await fetchEvents(params2)
          }
        }
      }

      return allEvents
    },
    enabled: !!student,
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

  const getTeacherName = (ids: number[]) => {
    const t = subcalendars.find(s => ids.includes(s.id))
    return t?.name?.split(' ')[0] || ''
  }

  // Split events
  const { upcomingEvents, pastEvents } = useMemo(() => {
    const now = new Date()
    const upcoming = studentEvents.filter(e => new Date(e.start_dt) >= now)
      .sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime())
    const past = studentEvents.filter(e => new Date(e.start_dt) < now)
      .sort((a, b) => new Date(b.start_dt).getTime() - new Date(a.start_dt).getTime())
    return { upcomingEvents: upcoming, pastEvents: past }
  }, [studentEvents])

  const age = student?.dob && student.dob !== '0000-00-00' && student.dob !== '2000-01-01'
    ? Math.floor((Date.now() - new Date(student.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  if (isLoading) {
    return <main className="max-w-4xl mx-auto p-6 flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></main>
  }

  if (!data || !student) {
    return <main className="max-w-4xl mx-auto p-6"><p className="text-center text-muted-foreground py-20">Student not found</p></main>
  }

  const { invoices, groups, summary } = data

  const formatEventDate = (dt: string) => {
    const d = new Date(dt)
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }
  const formatEventTime = (dt: string) => {
    return new Date(dt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <Link href="/students"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{student.full_name}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
            {student.phone_number && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {student.phone_number}</span>}
            {student.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {student.city}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/scheduling?bookFor=${encodeURIComponent(student.full_name)}&phone=${encodeURIComponent(student.phone_number)}`}>
            <Button size="sm"><Calendar className="h-4 w-4 mr-1" /> Book Class</Button>
          </Link>
          <Link href={`/certificate?mode=database&search=${encodeURIComponent(student.full_name)}`}>
            <Button variant="outline" size="sm"><Award className="h-4 w-4 mr-1" /> Certificate</Button>
          </Link>
          <Link href={`/invoice?studentName=${encodeURIComponent(student.full_name)}&studentPhone=${encodeURIComponent(student.phone_number)}`}>
            <Button variant="outline" size="sm"><Receipt className="h-4 w-4 mr-1" /> Invoice</Button>
          </Link>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Groups', value: summary.groupCount, icon: Users, color: 'text-blue-600' },
          { label: 'Classes', value: upcomingEvents.length + pastEvents.length, icon: BookOpen, color: 'text-indigo-600' },
          { label: 'Invoiced', value: formatCurrency(summary.totalInvoiced), icon: DollarSign, color: 'text-green-600' },
          { label: 'Balance', value: summary.openBalance > 0 ? formatCurrency(summary.openBalance) : 'Paid up', icon: CreditCard, color: summary.openBalance > 0 ? 'text-amber-600' : 'text-green-600' },
          { label: 'Certificates', value: summary.certificateCount, icon: Award, color: 'text-purple-600' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.04 }}>
            <Card><CardContent className="p-3 text-center">
              <stat.icon className={`h-5 w-5 mx-auto mb-1 ${stat.color}`} />
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="font-semibold text-sm">{stat.value}</p>
            </CardContent></Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Student Details */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" /> Student Profile</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div><p className="text-muted-foreground">Full Name</p><p className="font-medium">{student.full_name}</p></div>
              <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{student.phone_number || '-'}</p></div>
              <div><p className="text-muted-foreground">Email</p><p className="font-medium">{student.email ? <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {student.email}</span> : '-'}</p></div>
              <div><p className="text-muted-foreground">Date of Birth</p><p className="font-medium">{student.dob && student.dob !== '0000-00-00' ? student.dob : '-'}{age ? <span className="text-muted-foreground ml-1">({age} yrs)</span> : ''}</p></div>
              <div className="sm:col-span-2"><p className="text-muted-foreground">Address</p><p className="font-medium">{[student.full_address, student.city, student.postal_code].filter(Boolean).join(', ') || '-'}</p></div>
              <div><p className="text-muted-foreground">Permit Number</p><p className="font-mono font-medium">{student.permit_number || '-'}</p></div>
              <div><p className="text-muted-foreground">Contract / Attestation</p><p className="font-mono font-medium">{student.user_defined_contract_number || '-'} / {student.contract_number || '-'}</p></div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Upcoming Classes */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" /> Upcoming Classes</CardTitle></CardHeader>
          <CardContent>
            {loadingEvents ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No upcoming classes scheduled</p>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.map(event => {
                  const module = parseModuleFromTitle(event.title)
                  const teacher = getTeacherName(event.subcalendar_ids)
                  return (
                    <div key={event.id} className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                      <div>
                        <p className="font-medium text-sm">{event.title}</p>
                        <p className="text-xs text-muted-foreground">{formatEventDate(event.start_dt)} {formatEventTime(event.start_dt)} - {formatEventTime(event.end_dt)}{teacher ? ` with ${teacher}` : ''}</p>
                      </div>
                      {module && <Badge variant="secondary">M{module}</Badge>}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Past Classes */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Past Classes</CardTitle>
              {pastEvents.length > 5 && (
                <Button variant="ghost" size="sm" onClick={() => setShowAllPast(!showAllPast)}>
                  {showAllPast ? <><ChevronUp className="h-4 w-4 mr-1" /> Show Less</> : <><ChevronDown className="h-4 w-4 mr-1" /> Show All ({pastEvents.length})</>}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadingEvents ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : pastEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No past classes found</p>
            ) : (
              <div className="space-y-1.5">
                {(showAllPast ? pastEvents : pastEvents.slice(0, 5)).map(event => {
                  const module = parseModuleFromTitle(event.title)
                  const teacher = getTeacherName(event.subcalendar_ids)
                  return (
                    <div key={event.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                      <div>
                        <p className="font-medium text-sm">{event.title}</p>
                        <p className="text-xs text-muted-foreground">{formatEventDate(event.start_dt)} {formatEventTime(event.start_dt)} - {formatEventTime(event.end_dt)}{teacher ? ` with ${teacher}` : ''}</p>
                      </div>
                      {module && <Badge variant="outline" className="text-xs">M{module}</Badge>}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Groups */}
      {groups.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Groups</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {groups.map(g => (
                  <Link key={g.groupId} href={`/groups/${encodeURIComponent(g.groupId)}`}>
                    <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted transition-colors">
                      <span className="font-medium text-sm">{g.groupName}</span>
                      {g.moduleNumber && <Badge variant="secondary">Module {g.moduleNumber}</Badge>}
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Certificates */}
      {data.localStudent && data.localStudent.certificates.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="h-4 w-4" /> Certificates</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {data.localStudent.certificates.map(cert => (
                  <div key={cert.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Badge variant={cert.certificateType === 'full' ? 'default' : 'secondary'} className="text-xs">
                        {cert.certificateType === 'full' ? 'Full' : 'Phase 1'}
                      </Badge>
                      <span className="text-sm">
                        Contract: <span className="font-mono">{cert.contractNumber || '-'}</span>
                        {' / '}
                        Att: <span className="font-mono">{cert.attestationNumber || '-'}</span>
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(cert.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Invoices
                <Badge variant="secondary" className="ml-auto">{formatCurrency(summary.totalInvoiced)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {invoices.map(inv => {
                  let items: Array<{ description: string; quantity: number; unitPrice: number }> = []
                  try { items = JSON.parse(inv.lineItems) } catch { /* skip */ }

                  return (
                    <div key={inv.id}>
                      <Link href={`/invoice/${inv.id}`}>
                        <div
                          className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                          onClick={(e) => { if (items.length > 0) { e.preventDefault(); setExpandedInvoice(expandedInvoice === inv.id ? null : inv.id) } }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm font-medium">#{inv.invoiceNumber}</span>
                            <span className="text-xs text-muted-foreground">{inv.invoiceDate}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{formatCurrency(inv.total)}</span>
                            <Badge variant={inv.paymentStatus === 'paid' ? 'default' : 'secondary'} className="text-xs">
                              {inv.paymentStatus}
                            </Badge>
                            {items.length > 0 && (expandedInvoice === inv.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                          </div>
                        </div>
                      </Link>
                      <AnimatePresence>
                        {expandedInvoice === inv.id && items.length > 0 && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="pl-6 pr-2 pb-2 space-y-1">
                              {items.map((li, i) => (
                                <div key={i} className="flex justify-between text-xs text-muted-foreground">
                                  <span>{li.description} x{li.quantity}</span>
                                  <span>{formatCurrency(li.unitPrice * li.quantity)}</span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </main>
  )
}
