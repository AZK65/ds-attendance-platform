'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { Bell, CheckCircle2, AlertCircle, Clock, Send, Loader2, CalendarPlus, Truck, Users, MessageSquare, Image } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface MessageLog {
  id: string
  type: string
  to: string
  toName: string | null
  message: string
  status: string
  error: string | null
  createdAt: string
}

interface QueuedMessage {
  id: string
  message: string
  scheduledAt: string
  moduleNumber: number | null
  classTime: string | null
  isGroupMessage: boolean
  groupId: string
  status: string
}

type Tab = 'sent' | 'queue'

function getTypeIcon(type: string) {
  switch (type) {
    case 'class-scheduled': return <CalendarPlus className="h-3.5 w-3.5 text-blue-500" />
    case 'student-notify': return <CalendarPlus className="h-3.5 w-3.5 text-blue-500" />
    case 'teacher-notify': return <Users className="h-3.5 w-3.5 text-purple-500" />
    case 'truck-summary': return <Truck className="h-3.5 w-3.5 text-emerald-500" />
    case 'group-reminder': return <Clock className="h-3.5 w-3.5 text-orange-500" />
    case 'reminder': return <Clock className="h-3.5 w-3.5 text-orange-500" />
    case 'group-notify': return <Send className="h-3.5 w-3.5 text-cyan-500" />
    case 'group-message': return <MessageSquare className="h-3.5 w-3.5 text-indigo-500" />
    case 'certificate': return <Image className="h-3.5 w-3.5 text-pink-500" />
    default: return <Send className="h-3.5 w-3.5 text-gray-500" />
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'class-scheduled': return 'Class Scheduled'
    case 'student-notify': return 'Class Scheduled'
    case 'teacher-notify': return 'Teacher Notified'
    case 'truck-summary': return 'Truck Schedule'
    case 'group-reminder': return 'Group Reminder'
    case 'reminder': return 'Group Reminder'
    case 'group-notify': return 'Group Notified'
    case 'group-message': return 'Group Message'
    case 'certificate': return 'Certificate'
    default: return 'Message'
  }
}

function timeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function formatScheduledTime(dateStr: string) {
  const d = new Date(dateStr)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('sent')
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Fetch sent messages
  const { data: sentData, isLoading: loadingSent } = useQuery<{ messages: MessageLog[] }>({
    queryKey: ['message-log', 'sent'],
    queryFn: async () => {
      const res = await fetch('/api/message-log?tab=sent')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    refetchInterval: open ? 10000 : 30000,
  })

  // Fetch queue messages
  const { data: queueData, isLoading: loadingQueue } = useQuery<{ messages: QueuedMessage[] }>({
    queryKey: ['message-log', 'queue'],
    queryFn: async () => {
      const res = await fetch('/api/message-log?tab=queue')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    refetchInterval: open ? 10000 : 30000,
  })

  const sentMessages = sentData?.messages || []
  const queueMessages = queueData?.messages || []
  const queueCount = queueMessages.length

  // Count recent failures (last hour)
  const recentFailures = sentMessages.filter(m => {
    const age = Date.now() - new Date(m.createdAt).getTime()
    return m.status === 'failed' && age < 3600000
  }).length

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <Bell className="h-4 w-4" />
        {/* Badge for queue count or failures */}
        {(queueCount > 0 || recentFailures > 0) && (
          <span className={`absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 min-w-[16px] px-1 text-[10px] font-bold rounded-full text-white ${
            recentFailures > 0 ? 'bg-red-500' : 'bg-blue-500'
          }`}>
            {recentFailures > 0 ? recentFailures : queueCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-10 w-80 sm:w-96 bg-background border rounded-lg shadow-xl z-50 overflow-hidden"
          >
            {/* Header with tabs */}
            <div className="flex border-b">
              <button
                onClick={() => setTab('sent')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors relative ${
                  tab === 'sent' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'sent' && (
                  <motion.div
                    layoutId="notifTab"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-primary"
                    transition={{ type: 'spring', duration: 0.3, bounce: 0.1 }}
                  />
                )}
                <CheckCircle2 className="h-3.5 w-3.5" />
                Sent
                {sentMessages.length > 0 && (
                  <span className="text-xs text-muted-foreground">({sentMessages.length})</span>
                )}
              </button>
              <button
                onClick={() => setTab('queue')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors relative ${
                  tab === 'queue' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'queue' && (
                  <motion.div
                    layoutId="notifTab"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-primary"
                    transition={{ type: 'spring', duration: 0.3, bounce: 0.1 }}
                  />
                )}
                <Clock className="h-3.5 w-3.5" />
                Queue
                {queueCount > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{queueCount}</Badge>
                )}
              </button>
            </div>

            {/* Content */}
            <div className="max-h-80 overflow-y-auto">
              <AnimatePresence mode="wait">
                {tab === 'sent' ? (
                  <motion.div
                    key="sent"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {loadingSent ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : sentMessages.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        No messages sent yet
                      </div>
                    ) : (
                      <div className="divide-y">
                        {sentMessages.map(msg => (
                          <div key={msg.id} className="px-3 py-2.5 hover:bg-muted/50 transition-colors">
                            <div className="flex items-start gap-2">
                              <div className="mt-0.5 flex-shrink-0">
                                {msg.status === 'sent' ? getTypeIcon(msg.type) : <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-medium">{getTypeLabel(msg.type)}</span>
                                    <span className="text-xs text-muted-foreground">→</span>
                                    <span className="text-xs font-medium truncate max-w-[120px]">
                                      {msg.toName || msg.to}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                    {timeAgo(msg.createdAt)}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{msg.message}</p>
                                {msg.status === 'failed' && msg.error && (
                                  <p className="text-[10px] text-red-500 mt-0.5">{msg.error}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="queue"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {loadingQueue ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : queueMessages.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        No messages queued for today
                      </div>
                    ) : (
                      <div className="divide-y">
                        {queueMessages.map(msg => (
                          <div key={msg.id} className="px-3 py-2.5 hover:bg-muted/50 transition-colors">
                            <div className="flex items-start gap-2">
                              <div className="mt-0.5 flex-shrink-0">
                                <Clock className="h-3.5 w-3.5 text-orange-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    {msg.isGroupMessage ? (
                                      <Badge variant="outline" className="h-4 px-1 text-[10px]">Group</Badge>
                                    ) : (
                                      <Badge variant="outline" className="h-4 px-1 text-[10px]">Individual</Badge>
                                    )}
                                    {msg.moduleNumber && (
                                      <span className="text-xs font-medium">Module {msg.moduleNumber}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-xs font-medium text-orange-600">
                                      {formatScheduledTime(msg.scheduledAt)}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{msg.message}</p>
                                {msg.classTime && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">Class: {msg.classTime}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
