'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface SheetCardData {
  status: 'draft' | 'complete'
  locked: boolean
  masteredCount: number
  updatedAt: string
  updatedByLabel: string | null
  summaryLine?: string
}

export function Rsep1ResultsSheetCard({ studentId }: { studentId: string }) {
  const query = useQuery<SheetCardData>({
    queryKey: ['results-sheet', studentId],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}/results-sheet`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message || body.error || 'Could not load the results sheet')
      return body
    },
  })

  return (
    <Card data-testid="rsep1-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardList className="h-5 w-5" /> RSEP-1 Results Sheet
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {query.isError && <p className="text-sm text-destructive">{(query.error as Error).message}</p>}
        {query.data && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={query.data.status === 'complete' ? 'default' : 'secondary'}>
                {query.data.locked ? 'Finalized' : query.data.status === 'complete' ? 'Complete' : 'Draft'}
              </Badge>
              <span className="text-sm">{query.data.masteredCount}/8 mastered</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Overall sheet status. This is not the theory-grade summary and not attendance.
            </p>
            {query.data.updatedAt && (
              <p className="text-xs text-muted-foreground">
                Last saved {new Date(query.data.updatedAt).toLocaleString('en-CA', { timeZone: 'America/Toronto' })}
                {query.data.updatedByLabel ? ` by ${query.data.updatedByLabel}` : ''}
              </p>
            )}
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <Link href={`/students/${studentId}/results-sheet`}>Open</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/students/${studentId}/results-sheet/pdf`}>Download</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
