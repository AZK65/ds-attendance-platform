'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, Clock, BookOpen } from 'lucide-react'
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
}

export function GroupCard({ group }: GroupCardProps) {
  const lastMessageDate = group.lastMessageDate ? new Date(group.lastMessageDate) : null
  const timeAgo = lastMessageDate ? getTimeAgo(lastMessageDate) : null

  return (
    <Link href={`/groups/${encodeURIComponent(group.id)}`}>
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg leading-tight">{group.name}</CardTitle>
            {group.moduleNumber && (
              <Badge variant="default" className="shrink-0 gap-1">
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
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3 w-3" />
              {group.participantCount} members
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
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
