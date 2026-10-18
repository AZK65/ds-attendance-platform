'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock3, Download, FileText, ImageIcon, ShieldCheck, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export interface PaperExamProfileRecord {
  id: string
  title: string
  groupId: string
  groupName: string
  status: string
  score: number | null
  totalQuestions: number | null
  passingScore: number | null
  passed: boolean | null
  confidence: number | null
  error: string | null
  verified: boolean
  receivedAt: string
  originalDownloadUrl: string
  markedDownloadUrl: string
  pages: Array<{
    id: string
    pageNumber: number
    mimetype: string
    filename: string | null
    url: string
    markedUrl: string
  }>
}

function ResultBadge({ exam }: { exam: PaperExamProfileRecord }) {
  if (exam.status === 'graded' && exam.passed === true) {
    return <Badge className="bg-emerald-600"><CheckCircle2 /> Passed</Badge>
  }
  if (exam.status === 'graded' && exam.passed === false) {
    return <Badge variant="destructive"><XCircle /> Not passed</Badge>
  }
  if (exam.status === 'review' || exam.status === 'failed') {
    return <Badge className="bg-amber-500 text-amber-950"><AlertTriangle /> Needs review</Badge>
  }
  return <Badge variant="secondary"><Clock3 /> {exam.status === 'processing' ? 'Grading' : 'Received'}</Badge>
}

export function PaperExamProfileCard({ exams }: { exams: PaperExamProfileRecord[] | null | undefined }) {
  const [preview, setPreview] = useState<{ exam: PaperExamProfileRecord; page: PaperExamProfileRecord['pages'][number] } | null>(null)
  if (!exams?.length) return null

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardCheck className="h-5 w-5" /> Paper exams
            <Badge variant="secondary" className="ml-auto">{exams.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {exams.map(exam => (
            <div key={exam.id} className="rounded-xl border bg-muted/20 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{exam.title}</p>
                    <ResultBadge exam={exam} />
                    {exam.verified && <Badge variant="outline" className="border-emerald-200 text-emerald-700"><ShieldCheck /> Staff verified</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {exam.groupName} · {new Date(exam.receivedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                  {exam.error && <p className="mt-2 text-xs font-medium text-red-700">{exam.error}</p>}
                </div>
                <div className="flex items-center gap-3">
                  {exam.score !== null && (
                    <div className="text-right">
                      <p className="text-2xl font-bold tabular-nums">{exam.score}/{exam.totalQuestions || '—'}</p>
                      <p className="text-xs text-muted-foreground">Pass {exam.passingScore || '—'}</p>
                    </div>
                  )}
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/groups/${encodeURIComponent(exam.groupId)}/paper-exam`}>Open exam</Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={exam.verified ? exam.markedDownloadUrl : exam.originalDownloadUrl}><Download /> Download</a>
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 overflow-x-auto border-t pt-3">
                <span className="mr-1 flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground"><ImageIcon className="h-3.5 w-3.5" /> Submitted photos</span>
                {exam.pages.map(page => (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => setPreview({ exam, page })}
                    className="relative grid h-16 w-12 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted transition hover:ring-2 hover:ring-foreground/20"
                    title={`Open exam page ${page.pageNumber}`}
                  >
                    {page.mimetype.startsWith('image/') ? (
                      <Image src={exam.verified ? page.markedUrl : page.url} alt={`${exam.title} page ${page.pageNumber}`} fill unoptimized className="object-cover" sizes="48px" />
                    ) : (
                      <FileText className="h-5 w-5 text-red-600" />
                    )}
                    <span className="absolute bottom-0 right-0 rounded-tl bg-black/75 px-1 text-[9px] text-white">{page.pageNumber}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={Boolean(preview)} onOpenChange={open => !open && setPreview(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{preview?.exam.title} · Page {preview?.page.pageNumber}</DialogTitle>
            <DialogDescription>Saved on this student&apos;s profile from their private WhatsApp submission.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[75vh] min-h-[50vh] place-items-center overflow-auto bg-neutral-950 p-4">
            {preview?.page.mimetype.startsWith('image/') ? (
              <Image src={preview.exam.verified ? preview.page.markedUrl : preview.page.url} alt="Submitted paper exam" width={1600} height={2200} unoptimized className="h-auto max-h-[70vh] w-auto max-w-full object-contain" />
            ) : preview ? (
              <iframe src={preview.page.url} title="Submitted paper exam PDF" className="h-[70vh] w-full rounded bg-white" />
            ) : null}
          </div>
          {preview && (
            <div className="flex items-center justify-between border-t px-6 py-3">
              <span className="text-xs text-muted-foreground">{preview.exam.verified ? 'Staff-verified marked copy' : 'Original submission'}</span>
              <Button size="sm" variant="outline" asChild title="Download the exam photo and grade overview as one PDF"><a href={preview.exam.verified ? preview.exam.markedDownloadUrl : preview.exam.originalDownloadUrl}><Download /> Download</a></Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
