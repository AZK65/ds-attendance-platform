'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MessageCircle, Pause, Play, User, Bot, Clock } from 'lucide-react'

interface Conversation {
  phone: string
  displayName: string | null
  studentId: string | null
  messageCount: number
  lastMessage: { createdAt: string; role: string; body: string } | null
  paused: boolean
  pausedUntil: string | null
  pauseReason: string | null
}

interface BotStatus {
  enabled: boolean
  model: string
  conversations: Conversation[]
}

interface TranscriptMessage {
  id: string
  role: 'user' | 'assistant' | 'admin'
  body: string
  status: 'sent' | 'deferred'
  createdAt: string
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  if (hrs < 24) return `${hrs}h ago`
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

function fmtDuration(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m left`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h left`
}

export default function BotPage() {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<BotStatus>({
    queryKey: ['bot-status'],
    queryFn: () => fetch('/api/bot').then(r => r.json()),
    refetchInterval: 10_000,
  })

  const { data: transcript } = useQuery<{ messages: TranscriptMessage[]; displayName: string | null; phone: string }>({
    queryKey: ['bot-conversation', selectedPhone],
    queryFn: () =>
      selectedPhone
        ? fetch(`/api/bot/conversation/${encodeURIComponent(selectedPhone)}`).then(r => r.json())
        : Promise.resolve(null),
    enabled: !!selectedPhone,
    refetchInterval: selectedPhone ? 5_000 : false,
  })

  const toggle = useMutation({
    mutationFn: (args: { phone: string; action: 'pause' | 'resume' }) =>
      fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bot-status'] }),
  })

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }
  if (!data) return null

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Bot className="h-6 w-6" /> WhatsApp bot
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-replies to inbound WhatsApp messages. Pauses per-conversation for 24 h whenever you send a manual reply.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={data.enabled ? 'default' : 'secondary'}>
            {data.enabled ? 'Enabled' : 'Disabled (BOT_ENABLED=false)'}
          </Badge>
          <span className="text-xs text-muted-foreground font-mono">{data.model}</span>
        </div>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Conversation list */}
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Conversations
            <span className="text-xs font-normal text-muted-foreground">({data.conversations.length})</span>
          </h2>
          {data.conversations.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No inbound messages yet. Any WhatsApp DM to the school will appear here.
            </p>
          )}
          <ul className="divide-y">
            {data.conversations.map(c => (
              <li key={c.phone}>
                <button
                  className={`w-full text-left py-3 px-2 hover:bg-muted/50 rounded-md ${selectedPhone === c.phone ? 'bg-muted' : ''}`}
                  onClick={() => setSelectedPhone(c.phone)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">
                      {c.displayName || c.phone}
                    </span>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {c.lastMessage ? fmtTime(c.lastMessage.createdAt) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground font-mono">{c.phone}</span>
                    {c.studentId && (
                      <Badge variant="outline" className="text-[10px] py-0 h-5 px-1.5">
                        <User className="h-2.5 w-2.5 mr-1" /> student
                      </Badge>
                    )}
                    {c.paused && (
                      <Badge variant="secondary" className="text-[10px] py-0 h-5 px-1.5">
                        <Pause className="h-2.5 w-2.5 mr-1" /> paused · {c.pausedUntil ? fmtDuration(c.pausedUntil) : '—'}
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground ml-auto">{c.messageCount} msg</span>
                  </div>
                  {c.lastMessage && (
                    <p className="text-xs text-muted-foreground mt-1 truncate italic">
                      {c.lastMessage.role === 'user' ? '' : c.lastMessage.role === 'admin' ? 'you: ' : 'bot: '}
                      {c.lastMessage.body}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* Transcript */}
        <Card className="p-4">
          {!selectedPhone && (
            <div className="text-sm text-muted-foreground text-center py-12">
              Select a conversation to see the transcript.
            </div>
          )}
          {selectedPhone && transcript && (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold">
                    {transcript.displayName || transcript.phone}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">{transcript.phone}</div>
                </div>
                {(() => {
                  const conv = data.conversations.find(x => x.phone === selectedPhone)
                  if (!conv) return null
                  return conv.paused ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggle.mutate({ phone: selectedPhone, action: 'resume' })}
                      disabled={toggle.isPending}
                    >
                      <Play className="h-3.5 w-3.5 mr-1.5" /> Resume bot
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => toggle.mutate({ phone: selectedPhone, action: 'pause' })}
                      disabled={toggle.isPending}
                    >
                      <Pause className="h-3.5 w-3.5 mr-1.5" /> Pause bot
                    </Button>
                  )
                })()}
              </div>
              <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-2">
                {transcript.messages.map(m => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                    <div
                      className={`max-w-[78%] rounded-lg px-3 py-2 text-sm ${
                        m.role === 'user'
                          ? 'bg-muted'
                          : m.role === 'admin'
                            ? 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-50'
                            : m.status === 'deferred'
                              ? 'bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800'
                              : 'bg-primary text-primary-foreground'
                      }`}
                    >
                      <div className="whitespace-pre-wrap break-words">
                        {m.status === 'deferred' && (
                          <span className="text-[10px] uppercase tracking-wider opacity-70 block mb-1">
                            Deferred — bot chose not to reply
                          </span>
                        )}
                        {m.body}
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-[10px] opacity-60">
                        <Clock className="h-2.5 w-2.5" />
                        {new Date(m.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        <span className="ml-1">·</span>
                        <span className="ml-1">
                          {m.role === 'user' ? 'contact' : m.role === 'admin' ? 'you (WA)' : 'bot'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <Card className="p-4 bg-muted/30">
        <h3 className="text-sm font-semibold mb-2">How it decides to reply</h3>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
          <li>Every inbound WhatsApp DM triggers the bot (groups are ignored).</li>
          <li>The bot only answers from a curated knowledge base (marketing site + SAAQ facts).</li>
          <li>If it can't answer confidently, it stays <em>silent</em> — you see the message unanswered here and in WhatsApp.</li>
          <li>Whenever you send a manual reply from WhatsApp, the bot pauses that thread for 24 h.</li>
          <li>Kill switch: set <code className="font-mono">BOT_ENABLED=false</code> in the container env and rebuild.</li>
        </ul>
      </Card>
    </div>
  )
}
