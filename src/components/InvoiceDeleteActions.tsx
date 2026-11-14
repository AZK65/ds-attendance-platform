'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, RotateCcw, Trash2 } from 'lucide-react'

async function readError(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}))
  return typeof data.error === 'string' && data.error.trim() ? data.error : fallback
}

export function DeleteInvoiceButton({
  invoiceId,
  invoiceNumber,
  onDeleted,
  variant = 'icon',
}: {
  invoiceId: string
  invoiceNumber: string
  onDeleted?: () => void
  variant?: 'icon' | 'label'
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/invoice/${invoiceId}`, { method: 'DELETE' })
      if (!res.ok) {
        setError(await readError(res, 'Could not delete this invoice.'))
        return
      }
      setOpen(false)
      onDeleted?.()
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={variant === 'icon' ? 'ghost' : 'outline'}
        className={variant === 'icon'
          ? 'h-7 w-7 p-0 text-muted-foreground hover:text-red-600'
          : 'h-7 text-xs text-red-600 hover:text-red-700'}
        title="Delete invoice"
        onClick={(event) => {
          event.stopPropagation()
          setError(null)
          setOpen(true)
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {variant === 'label' ? 'Delete' : <span className="sr-only">Delete</span>}
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" /> Delete invoice {invoiceNumber}
            </DialogTitle>
            <DialogDescription>
              This hides the invoice from history, search, student payment history, balances, and reports.
              The invoice number stays reserved and the amounts are not changed. You can restore it from Recently deleted.
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={confirm}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function RestoreInvoiceButton({
  invoiceId,
  invoiceNumber,
  onRestored,
}: {
  invoiceId: string
  invoiceNumber: string
  onRestored?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/invoice/${invoiceId}/restore`, { method: 'POST' })
      if (!res.ok) {
        setError(await readError(res, 'Could not restore this invoice.'))
        return
      }
      setOpen(false)
      onRestored?.()
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={(event) => {
          event.stopPropagation()
          setError(null)
          setOpen(true)
        }}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Restore
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restore invoice {invoiceNumber}</DialogTitle>
            <DialogDescription>
              The invoice will show up again with the same number, amounts, and status.
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" disabled={pending} onClick={confirm} className="bg-green-600 hover:bg-green-700 text-white">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
