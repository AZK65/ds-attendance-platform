'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, Download, Loader2, Mail, MessageCircle, Printer,
  CreditCard, Copy, ExternalLink, CheckCircle2, Banknote, Globe, Link2,
  FileText, DollarSign, TrendingDown, AlertTriangle,
} from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion } from 'motion/react'

interface InvoiceData {
  id: string
  invoiceNumber: string
  studentName: string
  studentAddress: string | null
  studentCity: string | null
  studentProvince: string | null
  studentPostalCode: string | null
  studentPhone: string | null
  studentEmail: string | null
  invoiceDate: string
  dueDate: string | null
  lineItems: string
  subtotal: number
  gstAmount: number
  qstAmount: number
  total: number
  notes: string | null
  paymentMethod: string | null
  paymentStatus: string
  cloverOrderId: string | null
  cloverPaymentUrl: string | null
  cloverPaid: boolean
}

interface SettingsData {
  schoolName: string
  schoolAddress: string
  schoolCity: string
  schoolProvince: string
  schoolPostalCode: string
  gstNumber: string
  qstNumber: string
  defaultGstRate: number
  defaultQstRate: number
  taxesEnabled: boolean
  cloverConfigured: boolean
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount)
}

export default function InvoiceViewPage() {
  const params = useParams()
  const invoiceId = params.id as string
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfBase64, setPdfBase64] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [whatsappSent, setWhatsappSent] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  // Fetch invoice + settings
  const { data, isLoading, error } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/invoice/${invoiceId}`)
      if (!res.ok) throw new Error('Failed to fetch invoice')
      return res.json() as Promise<{ invoice: InvoiceData; settings: SettingsData }>
    },
  })

  const invoice = data?.invoice
  const settings = data?.settings

  // Fetch student invoice history + balance
  const { data: studentProfile } = useQuery({
    queryKey: ['student-profile', invoice?.studentPhone, invoice?.studentName],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (invoice?.studentPhone) params.set('phone', invoice.studentPhone)
      if (invoice?.studentName) params.set('name', invoice.studentName)
      if (!params.toString()) return null
      const res = await fetch(`/api/students/profile?${params}`)
      if (!res.ok) return null
      return res.json()
    },
    enabled: !!invoice,
  })

  // Fetch student balance for link to student detail page
  const { data: balanceData } = useQuery({
    queryKey: ['student-balance-link', invoice?.studentPhone, invoice?.studentName],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (invoice?.studentPhone) params.set('phone', invoice.studentPhone)
      if (invoice?.studentName) params.set('name', invoice.studentName)
      const res = await fetch(`/api/students/balance?${params}`)
      if (!res.ok) return null
      return res.json() as Promise<{ groupId: string | null; contactId: string | null }>
    },
    enabled: !!invoice,
  })

  // Generate PDF when invoice loads (includes remaining balance)
  useEffect(() => {
    if (!invoice || !settings) return

    let lineItems
    try {
      lineItems = JSON.parse(invoice.lineItems)
    } catch {
      lineItems = []
    }

    // Fetch student balance then generate PDF
    const generatePdf = async () => {
      let remainingBalance = 0
      try {
        const balanceParams = new URLSearchParams()
        if (invoice.studentPhone) balanceParams.set('phone', invoice.studentPhone)
        if (invoice.studentName) balanceParams.set('name', invoice.studentName)
        if (balanceParams.toString()) {
          const balRes = await fetch(`/api/students/balance?${balanceParams}`)
          if (balRes.ok) {
            const balData = await balRes.json()
            remainingBalance = balData.openBalance || 0
          }
        }
      } catch { /* non-fatal */ }

      const payload = {
        schoolName: settings.schoolName,
        schoolAddress: settings.schoolAddress,
        schoolCity: settings.schoolCity,
        schoolProvince: settings.schoolProvince,
        schoolPostalCode: settings.schoolPostalCode,
        gstNumber: settings.gstNumber,
        qstNumber: settings.qstNumber,
        studentName: invoice.studentName,
        studentAddress: invoice.studentAddress || '',
        studentCity: invoice.studentCity || '',
        studentProvince: invoice.studentProvince || '',
        studentPostalCode: invoice.studentPostalCode || '',
        studentPhone: invoice.studentPhone || '',
        studentEmail: invoice.studentEmail || '',
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate || '',
        lineItems,
        subtotal: invoice.subtotal,
        gstRate: settings.defaultGstRate,
        qstRate: settings.defaultQstRate,
        gstAmount: invoice.gstAmount,
        qstAmount: invoice.qstAmount,
        total: invoice.total,
        taxesEnabled: settings.taxesEnabled && (invoice.gstAmount > 0 || invoice.qstAmount > 0),
        notes: invoice.notes || '',
        remainingBalance,
      }

      try {
        const res = await fetch('/api/invoice/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Failed to generate PDF')
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        setPdfUrl(url)

        // Also convert to base64 for email/WhatsApp
        const arrayBuffer = await blob.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        setPdfBase64(btoa(binary))
      } catch (err) {
        console.error('PDF generation failed:', err)
      }
    }

    generatePdf()
  }, [invoice, settings])

  // Cleanup blob URL
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    }
  }, [pdfUrl])

  // Email mutation
  const emailMutation = useMutation({
    mutationFn: async () => {
      if (!pdfBase64 || !invoice?.studentEmail) throw new Error('Missing data')
      const res = await fetch('/api/invoice/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: invoice.studentEmail,
          studentName: invoice.studentName,
          invoiceNumber: invoice.invoiceNumber,
          pdfBase64,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send email')
      }
      return res.json()
    },
    onSuccess: () => setEmailSent(true),
  })

  // WhatsApp mutation
  const whatsappMutation = useMutation({
    mutationFn: async () => {
      if (!pdfBase64 || !invoice?.studentPhone) throw new Error('Missing data')
      const res = await fetch('/api/invoice/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: invoice.studentPhone,
          studentName: invoice.studentName,
          invoiceNumber: invoice.invoiceNumber,
          pdfBase64,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send via WhatsApp')
      }
      return res.json()
    },
    onSuccess: () => setWhatsappSent(true),
  })

  // Payment link mutation
  const paymentLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/invoice/clover/payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create payment link')
      }
      return res.json()
    },
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-destructive">Invoice not found</p>
          <Link href="/invoice/history">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to History
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const paymentMethodLabel = invoice.paymentMethod === 'cash' ? 'Cash' : invoice.paymentMethod === 'card' ? 'Credit/Debit' : invoice.paymentMethod === 'online' ? 'Online' : null
  const paymentMethodIcon = invoice.paymentMethod === 'cash' ? Banknote : invoice.paymentMethod === 'card' ? CreditCard : invoice.paymentMethod === 'online' ? Globe : null
  const PaymentIcon = paymentMethodIcon

  // Student detail page link
  const studentDetailHref = balanceData?.groupId && balanceData?.contactId
    ? `/groups/${balanceData.groupId}/student/${balanceData.contactId}`
    : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex items-center justify-between mb-6"
        >
          <div className="flex items-center gap-4">
            <Link href="/invoice/history">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </Link>
            <div>
              <h2 className="text-xl font-bold">
                Invoice {invoice.invoiceNumber}
              </h2>
              <p className="text-sm text-muted-foreground">
                {studentDetailHref ? (
                  <Link href={studentDetailHref} className="text-primary hover:underline font-medium">
                    {invoice.studentName}
                  </Link>
                ) : (
                  <span>{invoice.studentName}</span>
                )}
                {' — '}{formatCurrency(invoice.total)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Payment status */}
            {invoice.paymentStatus === 'paid' ? (
              <Badge className="bg-green-100 text-green-700 border-green-200">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Paid{paymentMethodLabel ? ` (${paymentMethodLabel})` : ''}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-orange-600 border-orange-200">
                Unpaid
              </Badge>
            )}
            {invoice.cloverOrderId && (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                <Link2 className="h-3 w-3 mr-1" />
                Clover Matched
              </Badge>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.25 }}
          className="grid grid-cols-1 lg:grid-cols-5 gap-6"
        >
          {/* PDF Preview — large left column */}
          <div className="lg:col-span-3">
            <Card className="h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Invoice Preview
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!pdfUrl}
                      onClick={() => {
                        if (!pdfUrl) return
                        const printWindow = window.open(pdfUrl, '_blank')
                        if (printWindow) {
                          printWindow.addEventListener('load', () => printWindow.print())
                        }
                      }}
                    >
                      <Printer className="h-4 w-4 mr-1" />
                      Print
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!pdfUrl}
                      onClick={() => {
                        if (!pdfUrl) return
                        const a = document.createElement('a')
                        a.href = pdfUrl
                        a.download = `invoice-${invoice.invoiceNumber}.pdf`
                        document.body.appendChild(a)
                        a.click()
                        document.body.removeChild(a)
                      }}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {pdfUrl ? (
                  <iframe
                    src={pdfUrl}
                    className="w-full rounded-lg border bg-white"
                    style={{ height: '80vh', minHeight: '700px' }}
                    title={`Invoice ${invoice.invoiceNumber}`}
                  />
                ) : (
                  <div className="flex items-center justify-center py-32">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-3 text-muted-foreground">Generating PDF...</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column — Balance → Details → History → Send → Payment Link */}
          <div className="lg:col-span-2 space-y-4">
            {/* Student Balance — FIRST card */}
            {studentProfile?.summary && (
              <Card className={`border-2 ${studentProfile.summary.openBalance > 0 ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20' : 'border-green-300 bg-green-50/50 dark:bg-green-950/20'}`}>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${studentProfile.summary.openBalance > 0 ? 'bg-amber-100 dark:bg-amber-900' : 'bg-green-100 dark:bg-green-900'}`}>
                        <DollarSign className={`h-6 w-6 ${studentProfile.summary.openBalance > 0 ? 'text-amber-600' : 'text-green-600'}`} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground font-medium">Student Balance</p>
                        <p className={`text-2xl font-bold font-mono ${studentProfile.summary.openBalance > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>
                          {formatCurrency(studentProfile.summary.openBalance)}
                        </p>
                        {studentProfile.summary.openBalance > 0 && (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Outstanding
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right space-y-0.5">
                      <div className="text-xs">
                        <span className="text-muted-foreground">Invoiced: </span>
                        <span className="font-mono font-medium">{formatCurrency(studentProfile.summary.totalInvoiced)}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">Paid: </span>
                        <span className="font-mono font-medium text-green-600">{formatCurrency(studentProfile.summary.totalPaid)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Invoice Details — SECOND card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice #</span>
                  <span className="font-mono font-medium">{invoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span>{invoice.invoiceDate}</span>
                </div>
                {invoice.dueDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Due Date</span>
                    <span>{invoice.dueDate}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Student</span>
                  {studentDetailHref ? (
                    <Link href={studentDetailHref} className="font-medium text-primary hover:underline">
                      {invoice.studentName}
                    </Link>
                  ) : (
                    <span className="font-medium">{invoice.studentName}</span>
                  )}
                </div>
                {invoice.studentEmail && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span className="text-xs">{invoice.studentEmail}</span>
                  </div>
                )}
                {invoice.studentPhone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span>{invoice.studentPhone}</span>
                  </div>
                )}
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(invoice.subtotal)}</span>
                  </div>
                  {invoice.gstAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GST</span>
                      <span>{formatCurrency(invoice.gstAmount)}</span>
                    </div>
                  )}
                  {invoice.qstAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">QST</span>
                      <span>{formatCurrency(invoice.qstAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t pt-1 mt-1">
                    <span>Total</span>
                    <span>{formatCurrency(invoice.total)}</span>
                  </div>
                </div>
                {paymentMethodLabel && PaymentIcon && (
                  <div className="flex justify-between items-center border-t pt-2 mt-2">
                    <span className="text-muted-foreground">Payment</span>
                    <Badge variant="outline" className="text-xs">
                      <PaymentIcon className="h-3 w-3 mr-1" />
                      {paymentMethodLabel}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Invoice History — THIRD card */}
            {studentProfile?.invoices && studentProfile.invoices.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Invoice History ({studentProfile.invoices.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y max-h-[300px] overflow-y-auto">
                    {studentProfile.invoices.map((inv: { id: string; invoiceNumber: string; invoiceDate: string; total: number; paymentStatus: string }) => (
                      <Link
                        key={inv.id}
                        href={`/invoice/${inv.id}`}
                        className={`flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors ${inv.id === invoiceId ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
                      >
                        <div className="min-w-0">
                          <p className={`text-sm font-medium ${inv.id === invoiceId ? 'text-blue-700 dark:text-blue-400' : ''}`}>
                            {inv.invoiceNumber}
                            {inv.id === invoiceId && <span className="text-xs text-blue-500 ml-1.5">(current)</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">{inv.invoiceDate}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-sm font-medium">{formatCurrency(inv.total)}</span>
                          {inv.paymentStatus === 'paid' ? (
                            <Badge className="bg-green-100 text-green-700 border-green-200 text-xs px-1.5">
                              Paid
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-orange-600 border-orange-200 text-xs px-1.5">
                              Unpaid
                            </Badge>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Send — FOURTH card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Send</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Email */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 justify-start"
                    disabled={!invoice.studentEmail || !pdfBase64 || emailMutation.isPending}
                    onClick={() => emailMutation.mutate()}
                  >
                    {emailMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4 mr-2" />
                    )}
                    {emailSent ? 'Email Sent!' : 'Email'}
                  </Button>
                  {emailSent && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                </div>
                {!invoice.studentEmail && (
                  <p className="text-xs text-amber-600 ml-1">No email on file</p>
                )}
                {emailMutation.isError && (
                  <p className="text-xs text-destructive ml-1">{emailMutation.error?.message}</p>
                )}

                {/* WhatsApp */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 justify-start"
                    disabled={!invoice.studentPhone || !pdfBase64 || whatsappMutation.isPending}
                    onClick={() => whatsappMutation.mutate()}
                  >
                    {whatsappMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <MessageCircle className="h-4 w-4 mr-2" />
                    )}
                    {whatsappSent ? 'WhatsApp Sent!' : 'WhatsApp'}
                  </Button>
                  {whatsappSent && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                </div>
                {!invoice.studentPhone && (
                  <p className="text-xs text-amber-600 ml-1">No phone on file</p>
                )}
                {whatsappMutation.isError && (
                  <p className="text-xs text-destructive ml-1">{whatsappMutation.error?.message}</p>
                )}
              </CardContent>
            </Card>

            {/* Payment Link — FIFTH card */}
            {settings?.cloverConfigured && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Payment Link</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {invoice.cloverPaymentUrl || paymentLinkMutation.data?.paymentUrl ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground truncate">
                        {invoice.cloverPaymentUrl || paymentLinkMutation.data?.paymentUrl}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            const url = invoice.cloverPaymentUrl || paymentLinkMutation.data?.paymentUrl
                            if (url) {
                              navigator.clipboard.writeText(url)
                              setCopiedLink(true)
                              setTimeout(() => setCopiedLink(false), 2000)
                            }
                          }}
                        >
                          {copiedLink ? (
                            <CheckCircle2 className="h-4 w-4 mr-1 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4 mr-1" />
                          )}
                          {copiedLink ? 'Copied!' : 'Copy Link'}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            const url = invoice.cloverPaymentUrl || paymentLinkMutation.data?.paymentUrl
                            if (url) window.open(url, '_blank')
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      disabled={paymentLinkMutation.isPending}
                      onClick={() => paymentLinkMutation.mutate()}
                    >
                      {paymentLinkMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CreditCard className="h-4 w-4 mr-2" />
                      )}
                      Generate Payment Link
                    </Button>
                  )}
                  {paymentLinkMutation.isError && (
                    <p className="text-xs text-destructive">
                      {paymentLinkMutation.error?.message || 'Failed to create link'}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
