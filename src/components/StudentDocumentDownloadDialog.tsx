'use client'

import { useMemo, useState } from 'react'
import {
  Archive,
  Award,
  ClipboardList,
  Download,
  FileSignature,
  HeartPulse,
  Images,
  Loader2,
  Receipt,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const documentOptions = [
  {
    id: 'contract',
    label: 'Course contract',
    description: 'The student’s Class 5 or Class 1 agreement',
    icon: FileSignature,
  },
  {
    id: 'attendance',
    label: 'Attendance booklet',
    description: 'Signed theory and practical class attendance',
    icon: ClipboardList,
  },
  {
    id: 'medical',
    label: 'Medical declaration',
    description: 'The completed SAAQ medical form, when available',
    icon: HeartPulse,
  },
  {
    id: 'certificates',
    label: 'Certificates',
    description: 'Every saved learner and full certificate',
    icon: Award,
  },
  {
    id: 'invoices',
    label: 'Invoices',
    description: 'Every invoice saved under this student',
    icon: Receipt,
  },
  {
    id: 'registration',
    label: 'Registration files',
    description: 'Permit, identification, photo, and signatures',
    icon: Images,
  },
] as const

type DocumentId = (typeof documentOptions)[number]['id']

interface StudentDocumentDownloadDialogProps {
  studentName: string
  params: Record<string, string | number | null | undefined>
}

export function StudentDocumentDownloadDialog({
  studentName,
  params,
}: StudentDocumentDownloadDialogProps) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<DocumentId>>(() => new Set())
  const [downloading, setDownloading] = useState<'selected' | 'all' | null>(null)

  const baseQuery = useMemo(() => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined && String(value).trim()) {
        query.set(key, String(value))
      }
    }
    return query
  }, [params])

  const toggleDocument = (id: DocumentId) => {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startDownload = (mode: 'selected' | 'all') => {
    if (mode === 'selected' && selected.size === 0) return
    setDownloading(mode)
    const query = new URLSearchParams(baseQuery)
    if (mode === 'selected') query.set('include', Array.from(selected).join(','))
    const link = document.createElement('a')
    link.href = `/api/students/documents?${query.toString()}`
    link.download = ''
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => setDownloading(null), 1200)
  }

  const allSelected = selected.size === documentOptions.length

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-foreground/15 bg-background shadow-xs transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-foreground/30 hover:bg-muted active:translate-y-0"
        >
          <Download className="h-4 w-4" />
          Documents
        </Button>
      </DialogTrigger>

      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b bg-muted/40 px-6 pb-5 pt-6 pr-14">
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg border bg-background shadow-xs">
            <Download className="h-5 w-5" />
          </div>
          <DialogTitle className="text-xl">Download student documents</DialogTitle>
          <DialogDescription className="max-w-md text-sm">
            Choose what to include for {studentName}. Files that have not been completed will be noted in the ZIP.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Choose documents</p>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setSelected(allSelected ? new Set() : new Set(documentOptions.map(option => option.id)))}
            >
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {documentOptions.map(option => {
              const Icon = option.icon
              const checked = selected.has(option.id)
              return (
                <label
                  key={option.id}
                  className={`group flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                    checked
                      ? 'border-foreground/30 bg-muted/60 shadow-xs'
                      : 'border-border bg-background hover:border-foreground/20 hover:bg-muted/30'
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleDocument(option.id)}
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/30 px-6 py-4 sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {selected.size} of {documentOptions.length} categories selected
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => startDownload('selected')}
              disabled={selected.size === 0 || downloading !== null}
            >
              {downloading === 'selected' ? <Loader2 className="animate-spin" /> : <Download />}
              Download selected
            </Button>
            <Button
              type="button"
              onClick={() => startDownload('all')}
              disabled={downloading !== null}
            >
              {downloading === 'all' ? <Loader2 className="animate-spin" /> : <Archive />}
              Download all as ZIP
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
