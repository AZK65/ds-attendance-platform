'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { MessageSquare, Bot, User } from 'lucide-react'

// Nav-bar bell for WhatsApp threads that need a human reply.
// Polls /api/inbox/attention every 20 s. Shows a small red count badge
// when threads are waiting. Click to jump straight to /inbox, or hover
// (desktop) / tap (mobile) to peek at who's waiting.

interface PreviewItem {
  phone: string
  displayName: string | null
  lastAt: string
  lastBody: string
  reason: 'unanswered' | 'bot-deferred'
}
interface AttentionResp {
  count: number
  preview: PreviewItem[]
}

function fmtAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export function InboxAttentionBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data } = useQuery<AttentionResp>({
    queryKey: ['inbox-attention'],
    queryFn: () => fetch('/api/inbox/attention').then(r => r.json()),
    refetchInterval: 20_000,
  })

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const count = data?.count || 0
  const hasAny = count > 0

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={hasAny ? `${count} WhatsApp chat${count === 1 ? '' : 's'} need attention` : 'Inbox — no unanswered chats'}
        className={`relative inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors ${
          hasAny ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40' : 'text-muted-foreground hover:bg-muted'
        }`}
      >
        <MessageSquare className="h-4.5 w-4.5" style={{ height: 18, width: 18 }} />
        {hasAny && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center leading-none">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover text-popover-foreground shadow-lg z-50"
          >
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">WhatsApp inbox</div>
                <div className="text-xs text-muted-foreground">
                  {hasAny
                    ? `${count} thread${count === 1 ? '' : 's'} waiting for a reply`
                    : 'All caught up'}
                </div>
              </div>
              <Link
                href="/inbox"
                onClick={() => setOpen(false)}
                className="text-xs text-primary hover:underline"
              >
                Open →
              </Link>
            </div>

            {hasAny && data?.preview?.length ? (
              <ul className="max-h-80 overflow-y-auto">
                {data.preview.map(p => (
                  <li key={p.phone} className="border-b last:border-b-0">
                    <Link
                      href="/inbox"
                      onClick={() => setOpen(false)}
                      className="block px-4 py-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate flex items-center gap-1.5">
                          {p.reason === 'bot-deferred' ? (
                            <Bot className="h-3 w-3 text-amber-600 flex-shrink-0" />
                          ) : (
                            <User className="h-3 w-3 text-blue-600 flex-shrink-0" />
                          )}
                          <span className="truncate">{p.displayName || p.phone}</span>
                        </span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtAgo(p.lastAt)} ago</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{p.lastBody}</div>
                      <div className="text-[10px] uppercase tracking-wider mt-1">
                        {p.reason === 'bot-deferred' ? (
                          <span className="text-amber-700">Bot couldn't answer</span>
                        ) : (
                          <span className="text-blue-700">Customer waiting</span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
                {count > data.preview.length && (
                  <li className="px-4 py-2 text-center">
                    <Link
                      href="/inbox"
                      onClick={() => setOpen(false)}
                      className="text-xs text-primary hover:underline"
                    >
                      + {count - data.preview.length} more in the inbox
                    </Link>
                  </li>
                )}
              </ul>
            ) : (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                Nothing pending. New messages will show up here.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
