'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Search, Loader2, FileText, ArrowLeft, X, Calendar,
  CreditCard, Link2, Eye, Copy, ExternalLink, CheckCircle2,
} from 'lucide-react'
import Link from 'next/link'

interface Invoice {
  id: string
  invoiceNumber: string
  studentName: string
  studentPhone: string | null
  studentEmail: string | null
  studentAddress: string | null
  studentCity: string | null
  studentProvince: string | null
  invoiceDate: string
  dueDate: string | null
  lineItems: string
  subtotal: number
  gstAmount: number
  qstAmount: number
  total: number
  cloverOrderId: string | null
  cloverPaymentUrl: string | null
  cloverPaid: boolean
  createdAt: string
}

interface CloverLineItem {
  name: string
  price: number
  quantity: number
}

interface CloverMatch {
  orderId: string
  total: number
  date: string
  score: 'exact' | 'close' | 'partial' | 'weak'
  diff: number
  lineItems: CloverLineItem[]
}

interface CloverOrder {
  id: string
  total: number
  createdTime: number
  state: string
  lineItems: CloverLineItem[]
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const [year, month, day] = dateStr.split('-')
  if (!year || !month || !day) return dateStr
  return `${month}/${day}/${year}`
}

function getLineItemCount(lineItemsJson: string): number {
  try {
    const items = JSON.parse(lineItemsJson)
    return Array.isArray(items) ? items.length : 0
  } catch {
    return 0
  }
}

function parseLineItems(lineItemsJson: string): Array<{ description: string; quantity: number; unitPrice: number }> {
  try {
    const items = JSON.parse(lineItemsJson)
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

const scoreColors: Record<string, string> = {
  exact: 'bg-green-100 text-green-700 border-green-200',
  close: 'bg-blue-100 text-blue-700 border-blue-200',
  partial: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  weak: 'bg-gray-100 text-gray-700 border-gray-200',
}

export default function InvoiceHistoryPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Dialog state
  const [matchDialogInvoice, setMatchDialogInvoice] = useState<Invoice | null>(null)
  const [viewDialogInvoice, setViewDialogInvoice] = useState<Invoice | null>(null)
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const queryParams = useMemo(() => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (dateFrom) params.set('from', dateFrom)
    if (dateTo) params.set('to', dateTo)
    return params.toString()
  }, [debouncedSearch, dateFrom, dateTo])

  // Check if Clover is configured
  const { data: settings } = useQuery({
    queryKey: ['invoice-settings'],
    queryFn: async () => {
      const res = await fetch('/api/invoice/settings')
      if (!res.ok) throw new Error('Failed to fetch settings')
      return res.json()
    },
  })
  const cloverConfigured = !!settings?.cloverConfigured

  // Fetch invoices
  const { data, isLoading } = useQuery({
    queryKey: ['invoices', debouncedSearch, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`/api/invoice/list${queryParams ? `?${queryParams}` : ''}`)
      if (!res.ok) throw new Error('Failed to fetch invoices')
      return res.json()
    },
  })

  const invoices: Invoice[] = data?.invoices || []
  const hasFilters = search || dateFrom || dateTo

  // Match dialog: fetch matches
  const { data: matchData, isLoading: matchLoading } = useQuery({
    queryKey: ['clover-match', matchDialogInvoice?.id],
    queryFn: async () => {
      const res = await fetch('/api/invoice/clover/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: matchDialogInvoice!.id }),
      })
      if (!res.ok) throw new Error('Failed to fetch matches')
      return res.json()
    },
    enabled: !!matchDialogInvoice && cloverConfigured,
  })

  // Confirm match mutation
  const confirmMatchMutation = useMutation({
    mutationFn: async ({ invoiceId, cloverOrderId }: { invoiceId: string; cloverOrderId: string }) => {
      const res = await fetch('/api/invoice/clover/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, cloverOrderId }),
      })
      if (!res.ok) throw new Error('Failed to confirm match')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      setMatchDialogInvoice(null)
    },
  })

  // View dialog: fetch Clover order details
  const { data: cloverOrderData, isLoading: cloverOrderLoading } = useQuery({
    queryKey: ['clover-order', viewDialogInvoice?.cloverOrderId],
    queryFn: async () => {
      const res = await fetch(`/api/invoice/clover/orders?orderId=${viewDialogInvoice!.cloverOrderId}`)
      if (!res.ok) throw new Error('Failed to fetch Clover order')
      return res.json()
    },
    enabled: !!viewDialogInvoice?.cloverOrderId && cloverConfigured,
  })

  // Payment link mutation
  const paymentLinkMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
  }

  function copyLink(url: string, invoiceId: string) {
    navigator.clipboard.writeText(url)
    setCopiedLinkId(invoiceId)
    setTimeout(() => setCopiedLinkId(null), 2000)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" />
              Invoice History
            </h2>
            <p className="text-muted-foreground mt-1">
              View and search past invoices
            </p>
          </div>
          <Link href="/invoice">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by student name or invoice number..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[150px]"
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[150px]"
                />
              </div>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              Invoices
              {!isLoading && (
                <Badge variant="secondary">{invoices.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {hasFilters
                  ? 'No invoices match your search.'
                  : 'No invoices yet. Create your first invoice to see it here.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      {cloverConfigured && <TableHead>Clover</TableHead>}
                      <TableHead className="w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow
                        key={inv.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setViewDialogInvoice(inv)}
                      >
                        <TableCell className="font-mono font-medium">
                          {inv.invoiceNumber}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{inv.studentName}</div>
                          {inv.studentEmail && (
                            <div className="text-xs text-muted-foreground">{inv.studentEmail}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(inv.invoiceDate)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {getLineItemCount(inv.lineItems)} item{getLineItemCount(inv.lineItems) !== 1 ? 's' : ''}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(inv.total)}
                        </TableCell>
                        {cloverConfigured && (
                          <TableCell>
                            {inv.cloverPaid ? (
                              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Paid
                              </Badge>
                            ) : inv.cloverOrderId ? (
                              <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                                <Link2 className="h-3 w-3 mr-1" />
                                Matched
                              </Badge>
                            ) : null}
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            {cloverConfigured && (
                              <>
                                {/* Payment Link */}
                                {inv.cloverPaymentUrl ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    title="Copy payment link"
                                    onClick={() => copyLink(inv.cloverPaymentUrl!, inv.id)}
                                  >
                                    {copiedLinkId === inv.id ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    title="Generate payment link"
                                    disabled={paymentLinkMutation.isPending}
                                    onClick={() => paymentLinkMutation.mutate(inv.id)}
                                  >
                                    {paymentLinkMutation.isPending ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <CreditCard className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                )}
                                {/* Match */}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  title={inv.cloverOrderId ? 'View Clover match' : 'Find Clover match'}
                                  onClick={() => setMatchDialogInvoice(inv)}
                                >
                                  <Link2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {/* View details */}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="View invoice details"
                              onClick={() => setViewDialogInvoice(inv)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ========== Match Dialog ========== */}
      <Dialog open={!!matchDialogInvoice} onOpenChange={(open) => !open && setMatchDialogInvoice(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              {matchDialogInvoice?.cloverOrderId ? 'Clover Match' : 'Find Clover Match'}
            </DialogTitle>
            <DialogDescription>
              Invoice {matchDialogInvoice?.invoiceNumber} — {matchDialogInvoice?.studentName} — {formatCurrency(matchDialogInvoice?.total || 0)}
            </DialogDescription>
          </DialogHeader>

          {matchDialogInvoice?.cloverOrderId ? (
            <div className="space-y-3">
              <div className="p-3 rounded-lg border bg-green-50 dark:bg-green-950">
                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                  <CheckCircle2 className="h-4 w-4 inline mr-1" />
                  Matched to Clover Order: <span className="font-mono">{matchDialogInvoice.cloverOrderId}</span>
                </p>
              </div>
            </div>
          ) : matchLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Searching Clover orders...</span>
            </div>
          ) : (matchData?.matches || []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No matching Clover orders found within ±3 days and similar amounts.
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Found {matchData.matches.length} potential match{matchData.matches.length !== 1 ? 'es' : ''}:
              </p>
              {matchData.matches.map((match: CloverMatch) => (
                <div key={match.orderId} className="p-3 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-sm font-medium">{match.orderId}</span>
                      <span className="text-sm text-muted-foreground ml-2">{formatDate(match.date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-xs ${scoreColors[match.score]}`}>
                        {match.score === 'exact' ? 'Exact' : match.score === 'close' ? 'Close' : match.score === 'partial' ? 'Partial' : 'Weak'}
                      </Badge>
                      <span className="font-semibold">{formatCurrency(match.total)}</span>
                    </div>
                  </div>
                  {match.lineItems.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {match.lineItems.map((li, i) => (
                        <span key={i}>
                          {i > 0 && ' • '}
                          {li.name} ({formatCurrency(li.price)})
                        </span>
                      ))}
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={confirmMatchMutation.isPending}
                    onClick={() => confirmMatchMutation.mutate({
                      invoiceId: matchDialogInvoice!.id,
                      cloverOrderId: match.orderId,
                    })}
                  >
                    {confirmMatchMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                    )}
                    Confirm Match
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========== View / Side-by-Side Dialog ========== */}
      <Dialog open={!!viewDialogInvoice} onOpenChange={(open) => !open && setViewDialogInvoice(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Invoice {viewDialogInvoice?.invoiceNumber}
            </DialogTitle>
            <DialogDescription>
              {viewDialogInvoice?.studentName} — {formatDate(viewDialogInvoice?.invoiceDate || '')}
            </DialogDescription>
          </DialogHeader>

          <div className={`grid gap-6 ${viewDialogInvoice?.cloverOrderId && cloverConfigured ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
            {/* Invoice Panel */}
            <div className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Invoice</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice #</span>
                  <span className="font-mono font-medium">{viewDialogInvoice?.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Student</span>
                  <span className="font-medium">{viewDialogInvoice?.studentName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span>{formatDate(viewDialogInvoice?.invoiceDate || '')}</span>
                </div>
                {viewDialogInvoice?.studentEmail && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span>{viewDialogInvoice.studentEmail}</span>
                  </div>
                )}
                {viewDialogInvoice?.studentPhone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span>{viewDialogInvoice.studentPhone}</span>
                  </div>
                )}
              </div>

              {/* Line Items */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Item</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs text-right">Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewDialogInvoice && parseLineItems(viewDialogInvoice.lineItems).map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{item.description}</TableCell>
                        <TableCell className="text-sm text-right">{item.quantity}</TableCell>
                        <TableCell className="text-sm text-right">{formatCurrency(item.unitPrice)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(viewDialogInvoice?.subtotal || 0)}</span>
                </div>
                {(viewDialogInvoice?.gstAmount || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">GST</span>
                    <span>{formatCurrency(viewDialogInvoice!.gstAmount)}</span>
                  </div>
                )}
                {(viewDialogInvoice?.qstAmount || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">QST</span>
                    <span>{formatCurrency(viewDialogInvoice!.qstAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-t pt-1">
                  <span>Total</span>
                  <span>{formatCurrency(viewDialogInvoice?.total || 0)}</span>
                </div>
              </div>

              {/* Payment Link */}
              {cloverConfigured && viewDialogInvoice && (
                <div className="pt-2">
                  {viewDialogInvoice.cloverPaymentUrl ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => copyLink(viewDialogInvoice.cloverPaymentUrl!, viewDialogInvoice.id)}
                      >
                        {copiedLinkId === viewDialogInvoice.id ? (
                          <CheckCircle2 className="h-4 w-4 mr-1 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4 mr-1" />
                        )}
                        Copy Payment Link
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(viewDialogInvoice.cloverPaymentUrl!, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={paymentLinkMutation.isPending}
                      onClick={() => paymentLinkMutation.mutate(viewDialogInvoice.id)}
                    >
                      {paymentLinkMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <CreditCard className="h-4 w-4 mr-1" />
                      )}
                      Generate Payment Link
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Clover Order Panel */}
            {viewDialogInvoice?.cloverOrderId && cloverConfigured && (
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Clover Receipt</h3>
                {cloverOrderLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : cloverOrderData?.order ? (
                  <>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Order ID</span>
                        <span className="font-mono font-medium">{cloverOrderData.order.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date</span>
                        <span>{new Date(cloverOrderData.order.createdTime).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">State</span>
                        <Badge variant="outline" className="text-xs capitalize">{cloverOrderData.order.state}</Badge>
                      </div>
                    </div>

                    {/* Line Items */}
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Item</TableHead>
                            <TableHead className="text-xs text-right">Qty</TableHead>
                            <TableHead className="text-xs text-right">Price</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(cloverOrderData.order.lineItems as CloverLineItem[]).map((item: CloverLineItem, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="text-sm">{item.name}</TableCell>
                              <TableCell className="text-sm text-right">{item.quantity}</TableCell>
                              <TableCell className="text-sm text-right">{formatCurrency(item.price)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="flex justify-between font-bold text-sm border-t pt-1">
                      <span>Total</span>
                      <span>{formatCurrency(cloverOrderData.order.total)}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Could not load Clover order details.
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
