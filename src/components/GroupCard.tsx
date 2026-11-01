'use client'

import { motion } from 'motion/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, Clock, BookOpen, CalendarDays, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'

interface GroupCardProps {
  group: {
    id: string
    name: string
    participantCount: number
    moduleNumber?: number | null
    lastMessageDate?: string | Date | null
    lastMessagePreview?: string | null
  }
  nextTheory?: {
    date: string
    endDate: string | null
    title: string
    module: number | null
  } | null
}

function formatNextTheoryLabel(iso: string): string {
  const d = new Date(iso)
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${dateStr} · ${timeStr}`
}

const fadeSlideUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
}

export function GroupCard({ group, nextTheory }: GroupCardProps) {
  const lastMessageDate = group.lastMessageDate ? new Date(group.lastMessageDate) : null
  const timeAgo = lastMessageDate ? getTimeAgo(lastMessageDate) : null

  return (
    <motion.div variants={fadeSlideUp} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
      <Link href={`/groups/${encodeURIComponent(group.id)}`} className="group block rounded-xl">
        <Card className="gap-4 transition-colors duration-200 hover:border-foreground/30 cursor-pointer h-full">
          <CardHeader className="gap-2">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-lg leading-tight">{group.name}</CardTitle>
              {group.moduleNumber && (
                <Badge variant="secondary" className="shrink-0 gap-1 rounded-md">
                  <BookOpen className="h-3 w-3" />
                  Module {group.moduleNumber}
                </Badge>
              )}
            </div>
            {timeAgo && (
              <CardDescription className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last message {timeAgo}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-2"><Users className="h-4 w-4" />{group.participantCount} members</span>
              <ArrowUpRight className="h-4 w-4 transition-colors group-hover:text-foreground" />
            </div>
            {nextTheory && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-sm" title={nextTheory.title}>
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div><p className="text-xs text-muted-foreground">Next theory{nextTheory.module ? ` · Module ${nextTheory.module}` : ''}</p><p className="mt-1 font-medium">{formatNextTheoryLabel(nextTheory.date)}</p></div>
              </div>
            )}
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  )
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`

  // Format as date for older messages
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}
