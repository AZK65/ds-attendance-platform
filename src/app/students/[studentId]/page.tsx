'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, Loader2, Phone, MapPin, Mail, Calendar, CreditCard,
  Award, Users, DollarSign, FileText, Receipt,
} from 'lucide-react'
import Link from 'next/link'
import { motion } from 'motion/react'

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

export default function StudentProfilePage() {
  const params = useParams()
  const studentId = params.studentId as string

  const { data, isLoading, error } = useQuery<StudentProfile>({
    queryKey: ['student-profile', studentId],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  if (isLoading) {
    return (
      <main className="max-w-4xl mx-auto p-6 flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    )
  }

  if (error || !data) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <p className="text-center text-muted-foreground py-20">Student not found</p>
      </main>
    )
  }

  const { student, localStudent, invoices, groups, summary } = data

  const age = student.dob && student.dob !== '0000-00-00' && student.dob !== '2000-01-01'
    ? Math.floor((Date.now() - new Date(student.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <Link href="/students">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{student.full_name}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
            {student.phone_number && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {student.phone_number}</span>}
            {student.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {student.city}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/certificate?mode=database&search=${encodeURIComponent(student.full_name)}`}>
            <Button variant="outline" size="sm"><Award className="h-4 w-4 mr-1" /> Certificate</Button>
          </Link>
          <Link href={`/invoice?student=${encodeURIComponent(student.full_name)}&phone=${encodeURIComponent(student.phone_number)}`}>
            <Button variant="outline" size="sm"><Receipt className="h-4 w-4 mr-1" /> Invoice</Button>
          </Link>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        {[
          { label: 'Groups', value: summary.groupCount, icon: Users, color: 'text-blue-600' },
          { label: 'Invoiced', value: formatCurrency(summary.totalInvoiced), icon: DollarSign, color: 'text-green-600' },
          { label: 'Balance', value: summary.openBalance > 0 ? formatCurrency(summary.openBalance) : 'Paid up', icon: CreditCard, color: summary.openBalance > 0 ? 'text-amber-600' : 'text-green-600' },
          { label: 'Certificates', value: summary.certificateCount, icon: Award, color: 'text-purple-600' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.05 }}
          >
            <Card>
              <CardContent className="p-4 text-center">
                <stat.icon className={`h-5 w-5 mx-auto mb-1 ${stat.color}`} />
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="font-semibold text-sm">{stat.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Student Details */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card>
          <CardHeader><CardTitle className="text-base">Student Profile</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Full Name</p>
                <p className="font-medium">{student.full_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Phone</p>
                <p className="font-medium">{student.phone_number || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Email</p>
                <p className="font-medium flex items-center gap-1">{student.email ? <><Mail className="h-3.5 w-3.5" /> {student.email}</> : '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Date of Birth</p>
                <p className="font-medium flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {student.dob && student.dob !== '0000-00-00' ? student.dob : '-'}
                  {age && <span className="text-muted-foreground">({age} years old)</span>}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-muted-foreground">Address</p>
                <p className="font-medium">{[student.full_address, student.city, student.postal_code].filter(Boolean).join(', ') || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Permit Number</p>
                <p className="font-mono font-medium">{student.permit_number || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Contract / Attestation</p>
                <p className="font-mono font-medium">
                  {student.user_defined_contract_number || '-'} / {student.contract_number || '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Groups */}
      {groups.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Groups</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {groups.map(g => (
                  <Link key={g.groupId} href={`/groups/${encodeURIComponent(g.groupId)}`}>
                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors">
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
      {localStudent && localStudent.certificates.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="h-4 w-4" /> Certificates</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {localStudent.certificates.map(cert => (
                  <div key={cert.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div>
                      <Badge variant={cert.certificateType === 'full' ? 'default' : 'secondary'} className="text-xs">
                        {cert.certificateType === 'full' ? 'Full' : 'Phase 1'}
                      </Badge>
                      <span className="text-sm ml-2">
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
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Invoices</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {invoices.map(inv => {
                  let items = ''
                  try {
                    const parsed = JSON.parse(inv.lineItems)
                    items = parsed.map((li: { description: string }) => li.description).join(', ')
                  } catch { /* skip */ }

                  return (
                    <Link key={inv.id} href={`/invoice/${inv.id}`}>
                      <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors">
                        <div>
                          <span className="font-mono text-sm font-medium">#{inv.invoiceNumber}</span>
                          <span className="text-sm ml-2 text-muted-foreground">{items}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{formatCurrency(inv.total)}</span>
                          <Badge variant={inv.paymentStatus === 'paid' ? 'default' : 'secondary'} className="text-xs">
                            {inv.paymentStatus}
                          </Badge>
                        </div>
                      </div>
                    </Link>
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
