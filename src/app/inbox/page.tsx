'use client'

import Link from 'next/link'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Search, Send, ArrowLeft, Users, User, Wifi, WifiOff,
  Loader2, MessageCircle, ImageIcon, FileText, Mic, Video,
  Bot, Pause, Play, AlertCircle, CalendarClock, CalendarPlus,
  CalendarX, RefreshCw, ExternalLink, Paperclip, X, Download
} from 'lucide-react'

// ── Bot state (per-conversation) ───────────────────────────────

interface BotConversation {
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
  conversations: BotConversation[]
}

// Extract the digits-only phone from a WA chat id: '15145551234@c.us'
// → '15145551234'. Returns null for groups (@g.us) or malformed ids.
function chatIdToPhone(chatId: string | null | undefined): string | null {
  if (!chatId) return null
  if (chatId.endsWith('@g.us')) return null
  const digits = chatId.split('@')[0]?.replace(/\D/g, '')
  return digits || null
}

function fmtPauseRemaining(iso: string | null): string {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return ''
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h`
}

// ── Types ──────────────────────────────────────────────────────

interface Chat {
  id: string
  name: string
  isGroup: boolean
  lastMessage: {
    body: string
    timestamp: number
    fromMe: boolean
  } | null
  unreadCount: number
  timestamp: number
}

interface Message {
  id: string
  body: string
  timestamp: number
  fromMe: boolean
  senderName: string | null
  type: string
  hasMedia: boolean
  mediaUrl?: string
  mimetype?: string | null
  filename?: string | null
  isAiReply?: boolean
  isReminder?: boolean
  systemKind?: SystemMessageKind
}

interface OutgoingMessage {
  message: string
  file: File | null
  previewUrl: string | null
}

type SystemMessageKind = 'reminder' | 'scheduled' | 'updated' | 'cancelled'

// ── Helpers ────────────────────────────────────────────────────

function formatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  if (hrs < 24) return `${hrs}h`
  if (days < 7) return `${days}d`
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

function formatMessageTime(ts: number): string {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleTimeString('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

function getDateKey(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function formatDateSeparator(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86400000)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-CA', { weekday: 'long' })
  return d.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: now.getFullYear() !== d.getFullYear() ? 'numeric' : undefined })
}

function mediaPlaceholder(type: string): { icon: typeof ImageIcon; label: string } {
  switch (type) {
    case 'image': return { icon: ImageIcon, label: 'Photo' }
    case 'video': return { icon: Video, label: 'Video' }
    case 'audio':
    case 'ptt': return { icon: Mic, label: 'Voice message' }
    case 'document': return { icon: FileText, label: 'Document' }
    case 'sticker': return { icon: ImageIcon, label: 'Sticker' }
    default: return { icon: FileText, label: type }
  }
}

function fileMessageType(file: File): string {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'document'
}

// ── Date separator ────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center my-4 select-none">
      <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/85 dark:bg-neutral-800/90 border border-black/5 dark:border-white/10 backdrop-blur-sm">
        <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300 tracking-wide">
          {label}
        </span>
      </div>
    </div>
  )
}

// ── Chat list item ─────────────────────────────────────────────

function ChatListItem({
  chat,
  isSelected,
  onClick,
  botState,
}: {
  chat: Chat
  isSelected: boolean
  onClick: () => void
  botState?: BotConversation | null
}) {
  const preview = chat.lastMessage?.body || ''
  const truncated = preview.length > 45 ? preview.slice(0, 45) + '...' : preview
  const isPaused = !!botState?.paused
  const isBotActive = !chat.isGroup && !!botState && !isPaused
  const lastMessageIsAi = !!(
    chat.lastMessage?.fromMe &&
    botState?.lastMessage?.role === 'assistant' &&
    botState.lastMessage.body === chat.lastMessage.body
  )
  const needsAttention =
    !!botState?.lastMessage &&
    botState.lastMessage.role === 'assistant' &&
    (botState.lastMessage.body.startsWith('[send failed]') ||
      // deferred rows are stored as 'assistant' too; the presence of any
      // recent 'assistant' whose most recent user message went unanswered
      // is what the admin should notice. This heuristic keeps it simple.
      false)

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-border/50 ${
        isSelected
          ? 'bg-primary/10'
          : 'hover:bg-muted/50'
      }`}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
        chat.isGroup ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
      }`}>
        {chat.isGroup ? <Users className="h-5 w-5" /> : <User className="h-5 w-5" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${chat.unreadCount > 0 ? 'font-bold' : 'font-medium'} flex items-center gap-1.5`}>
            {chat.name}
            {isBotActive && (
              <Bot className="h-3 w-3 text-emerald-600" aria-label="Bot active on this chat" />
            )}
            {isPaused && (
              <Pause className="h-3 w-3 text-amber-600" aria-label="Bot paused on this chat" />
            )}
            {needsAttention && (
              <AlertCircle className="h-3 w-3 text-red-600" aria-label="Bot couldn't respond" />
            )}
          </span>
          <span className="text-[11px] text-muted-foreground flex-shrink-0">
            {formatTime(chat.lastMessage?.timestamp || chat.timestamp)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">
            {chat.lastMessage?.fromMe && (
              <span className={lastMessageIsAi ? 'font-medium text-violet-600 dark:text-violet-400' : 'text-primary'}>
                {lastMessageIsAi ? 'AI: ' : 'You: '}
              </span>
            )}
            {truncated || 'No messages'}
          </span>
          {chat.unreadCount > 0 && (
            <Badge variant="default" className="h-5 min-w-[20px] px-1.5 text-[10px] rounded-full flex-shrink-0">
              {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
            </Badge>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Message bubble ─────────────────────────────────────────────

function MessageMediaContent({
  message,
  onOpenImage,
}: {
  message: Message
  onOpenImage: (url: string, name: string) => void
}) {
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const source = message.mediaUrl
    ? `${message.mediaUrl}${retry ? `?retry=${retry}` : ''}`
    : null
  const media = mediaPlaceholder(message.type)
  const MediaIcon = media.icon
  const filename = message.filename || media.label

  if (!source || failed) {
    return (
      <div className="mb-1 flex min-w-56 items-center gap-3 rounded-xl border border-black/10 bg-black/[0.04] p-2.5 dark:border-white/10 dark:bg-white/[0.06]">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/70 text-neutral-500 shadow-sm dark:bg-black/20 dark:text-neutral-300">
          <MediaIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold">{filename}</span>
          <span className="mt-0.5 block text-[11px] opacity-60">
            {failed ? 'Could not load this attachment' : 'Attachment unavailable'}
          </span>
        </span>
        {source && (
          <button
            type="button"
            onClick={() => {
              setFailed(false)
              setRetry(value => value + 1)
            }}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:hover:bg-white/10"
            aria-label="Try loading attachment again"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }

  if (message.type === 'image' || message.type === 'sticker' || message.mimetype?.startsWith('image/')) {
    return (
      <button
        type="button"
        onClick={() => onOpenImage(source, filename)}
        className="mb-1 block max-w-full cursor-zoom-in overflow-hidden rounded-xl bg-black/5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
        aria-label={`Open ${filename}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={source}
          alt={message.type === 'sticker' ? 'WhatsApp sticker' : 'WhatsApp photo'}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={message.type === 'sticker'
            ? 'h-32 w-32 object-contain'
            : 'max-h-80 max-w-full object-contain'}
        />
      </button>
    )
  }

  if (message.type === 'video' || message.mimetype?.startsWith('video/')) {
    return (
      <video
        src={source}
        controls
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
        className="mb-1 max-h-80 max-w-full rounded-xl bg-black"
      />
    )
  }

  if (message.type === 'audio' || message.type === 'ptt' || message.mimetype?.startsWith('audio/')) {
    return (
      <audio
        src={source}
        controls
        preload="metadata"
        onError={() => setFailed(true)}
        className="mb-1 w-64 max-w-full"
      />
    )
  }

  return (
    <a
      href={`${source}${source.includes('?') ? '&' : '?'}download=1`}
      download={filename}
      className="mb-1 flex min-w-56 items-center gap-3 rounded-xl border border-black/10 bg-black/[0.04] p-2.5 transition-colors hover:bg-black/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/10"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/70 text-neutral-500 shadow-sm dark:bg-black/20 dark:text-neutral-300">
        <FileText className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">{filename}</span>
        <span className="mt-0.5 block text-[11px] opacity-60">Download document</span>
      </span>
      <Download className="h-4 w-4 shrink-0 opacity-60" />
    </a>
  )
}

function MessageBubble({
  message,
  isGroup,
  isFirstInRun,
  isLastInRun,
  onSystemMessageClick,
  onOpenImage,
}: {
  message: Message
  isGroup: boolean
  isFirstInRun: boolean
  isLastInRun: boolean
  onSystemMessageClick: (message: Message) => void
  onOpenImage: (url: string, name: string) => void
}) {
  const mine = message.fromMe
  const systemKind = message.systemKind || (message.isReminder ? 'reminder' : undefined)
  const systemMeta = systemKind ? {
    reminder: {
      label: 'Class reminder',
      icon: CalendarClock,
      badge: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
    },
    scheduled: {
      label: 'Class scheduled',
      icon: CalendarPlus,
      badge: 'bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-200',
    },
    updated: {
      label: 'Schedule updated',
      icon: RefreshCw,
      badge: 'bg-orange-100 text-orange-900 dark:bg-orange-900/50 dark:text-orange-200',
    },
    cancelled: {
      label: 'Class cancelled',
      icon: CalendarX,
      badge: 'bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-200',
    },
  }[systemKind] : null
  const SystemIcon = systemMeta?.icon
  const displayBody = systemKind === 'reminder'
    ? message.body.replace(/^\s*Reminder\s*:\s*/i, '')
    : systemKind === 'updated'
      ? message.body.replace(/^\s*Schedule update\s*:\s*/i, '')
      : systemKind === 'cancelled'
        ? message.body.replace(/^\s*Class cancelled\s*:\s*/i, '')
        : message.body

  // WhatsApp-style bubble rounding: tail (cut corner) only on the last
  // message of a same-sender run. Within a run, keep all corners rounded
  // so the bubbles read as a stack rather than a chain of tails.
  //
  // rounded-2xl everywhere, then trim ONE corner on the tail bubble:
  //   mine + last-in-run  → tail on bottom-right (br cut to sm)
  //   theirs + last-in-run → tail on bottom-left  (bl cut to sm)
  const cornerCls = !isLastInRun
    ? 'rounded-2xl'
    : mine
      ? 'rounded-2xl rounded-br-md'
      : 'rounded-2xl rounded-bl-md'

  // Tight vertical spacing within a run, generous between runs.
  const runGap = isFirstInRun ? 'mt-2' : 'mt-0.5'

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${runGap} px-1`}>
      <div
        role={systemMeta ? 'button' : undefined}
        tabIndex={systemMeta ? 0 : undefined}
        onClick={() => systemMeta && onSystemMessageClick(message)}
        onKeyDown={(event) => {
          if (systemMeta && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            onSystemMessageClick(message)
          }
        }}
        className={`
          max-w-[85%] md:max-w-[70%] px-3.5 py-2 shadow-sm ${cornerCls}
          ${mine
            ? systemMeta
              ? 'bg-white text-neutral-900 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-50 dark:border-neutral-700'
              : message.isAiReply
              ? 'bg-violet-50 text-neutral-900 border border-violet-300 ring-1 ring-violet-100 dark:bg-violet-950/70 dark:text-neutral-50 dark:border-violet-700 dark:ring-violet-900'
              : 'bg-[#DCF8C6] text-neutral-900 dark:bg-emerald-800 dark:text-neutral-50'
            : 'bg-white text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100 border border-black/[0.03] dark:border-white/5'
          }
          ${systemMeta ? 'cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 dark:hover:border-neutral-600' : ''}
        `}
      >
        {systemMeta && SystemIcon && (
          <div className={`mb-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${systemMeta.badge}`}>
            <SystemIcon className="h-3.5 w-3.5" strokeWidth={2} />
            {systemMeta.label}
          </div>
        )}

        {message.isAiReply && !systemMeta && (
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">
            <Bot className="h-3 w-3" />
            AI reply
          </div>
        )}

        {/* Sender name for group received messages — only on first-in-run so it
            isn't repeated on every bubble of the same sender's stack. */}
        {isGroup && !mine && message.senderName && isFirstInRun && (
          <p className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-400 mb-0.5 truncate">
            {message.senderName}
          </p>
        )}

        {message.hasMedia && (
          <MessageMediaContent message={message} onOpenImage={onOpenImage} />
        )}

        {/* Message body */}
        {displayBody && (
          <p className="text-[14.5px] leading-[1.4] whitespace-pre-wrap break-words">{displayBody}</p>
        )}

        {/* Timestamp — right-aligned, inline with last line via flex-end.
            Only on the last message of a run to reduce visual noise. */}
        {isLastInRun && (
          <div className={`flex justify-end mt-1 text-[10.5px] tabular-nums ${message.isAiReply ? 'text-violet-500 dark:text-violet-300/70' : mine ? 'text-neutral-500 dark:text-neutral-300/70' : 'text-neutral-400 dark:text-neutral-400'}`}>
            {formatMessageTime(message.timestamp)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main inbox page ────────────────────────────────────────────

export default function InboxPage() {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [selectedSystemMessage, setSelectedSystemMessage] = useState<Message | null>(null)
  const [openImage, setOpenImage] = useState<{ url: string; name: string } | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [messageInput, setMessageInput] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prevMessageCount = useRef(0)
  const queryClient = useQueryClient()

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // ── Queries ────────────────────────────────────────────────

  const {
    data: chatData,
    isLoading: chatsLoading
  } = useQuery({
    queryKey: ['inbox-chats', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      const res = await fetch(`/api/inbox/chats?${params}`)
      if (!res.ok) throw new Error('Failed to fetch chats')
      return res.json() as Promise<{ chats: Chat[]; connected: boolean }>
    },
    refetchInterval: 15000, // Poll every 15s
  })

  // Per-chat history size. Bumped by "Load older" to progressively pull
  // more of the WA history in without loading the entire chat on selection.
  const [historyLimit, setHistoryLimit] = useState<Record<string, number>>({})
  const currentLimit = selectedChatId ? historyLimit[selectedChatId] ?? 100 : 100
  const messageQueryKey = ['inbox-messages', selectedChatId, currentLimit] as const

  const {
    data: messageData,
    isLoading: messagesLoading
  } = useQuery({
    queryKey: messageQueryKey,
    queryFn: async () => {
      if (!selectedChatId) return { messages: [], connected: true }
      const res = await fetch(
        `/api/inbox/chats/${encodeURIComponent(selectedChatId)}/messages?limit=${currentLimit}`
      )
      if (!res.ok) throw new Error('Failed to fetch messages')
      return res.json() as Promise<{ messages: Message[]; connected: boolean }>
    },
    enabled: !!selectedChatId,
    refetchInterval: 10000, // Poll every 10s
  })

  const loadOlder = () => {
    if (!selectedChatId) return
    setHistoryLimit(prev => ({ ...prev, [selectedChatId]: (prev[selectedChatId] ?? 100) + 200 }))
  }
  // "Load older" is worth showing once we've pulled a full batch — heuristic
  // that the WA history is likely deeper than what we're currently rendering.
  const canLoadOlder = (messageData?.messages?.length ?? 0) >= currentLimit

  // Bot pause state per phone — merged with the WA chat list to show
  // "bot active", "bot paused", and "bot couldn't respond" indicators
  // alongside each conversation, plus enable pause/resume from the
  // chat header. Same 15s poll cadence as the chat list.
  const { data: botStatus } = useQuery<BotStatus>({
    queryKey: ['bot-status'],
    queryFn: () => fetch('/api/bot').then(r => r.json()),
    refetchInterval: 15000,
  })
  const botConversations = botStatus?.conversations || []
  const botByPhone = new Map(botConversations.map(c => [c.phone, c]))
  const botStateForChat = (chat: Chat | undefined): BotConversation | null => {
    if (!chat || chat.isGroup) return null
    const phone = chatIdToPhone(chat.id)
    const exact = phone ? botByPhone.get(phone) : null
    if (exact) return exact
    // New WhatsApp Linked IDs do not contain the phone number. Match the
    // latest exact bot reply so AI status and pause controls still attach to
    // the correct conversation in the inbox.
    if (chat.lastMessage?.fromMe && chat.lastMessage.body) {
      return botConversations.find(conversation =>
        conversation.lastMessage?.role === 'assistant' &&
        conversation.lastMessage.body === chat.lastMessage?.body
      ) || null
    }
    return null
  }
  const selectedBotState = botStateForChat(chatData?.chats?.find(chat => chat.id === selectedChatId))
  const selectedPhone = selectedBotState?.phone || chatIdToPhone(selectedChatId)

  const botToggle = useMutation({
    mutationFn: async (args: { phone: string; action: 'pause' | 'resume' }) => {
      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      })
      if (!res.ok) throw new Error('Bot toggle failed')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-status'] })
    },
  })

  // ── Send mutation ──────────────────────────────────────────

  const sendMutation = useMutation({
    mutationFn: async ({ message, file }: OutgoingMessage) => {
      if (!selectedChatId) throw new Error('No chat selected')
      let res: Response
      if (file) {
        const form = new FormData()
        form.set('chatId', selectedChatId)
        form.set('message', message)
        form.set('file', file)
        res = await fetch('/api/inbox/media', { method: 'POST', body: form })
      } else {
        res = await fetch(`/api/inbox/chats/${encodeURIComponent(selectedChatId)}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        })
      }
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to send message or attachment')
      }
      return res.json()
    },
    onMutate: async ({ message, file, previewUrl }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: messageQueryKey })
      const previousMessages = queryClient.getQueryData(messageQueryKey)

      queryClient.setQueryData(messageQueryKey, (old: { messages: Message[]; connected: boolean } | undefined) => {
        const optimistic: Message = {
          id: `optimistic-${Date.now()}`,
          body: message,
          timestamp: Math.floor(Date.now() / 1000),
          fromMe: true,
          senderName: null,
          type: file ? fileMessageType(file) : 'chat',
          hasMedia: !!file,
          mediaUrl: previewUrl || undefined,
          mimetype: file?.type || null,
          filename: file?.name || null,
        }
        return {
          messages: [...(old?.messages || []), optimistic],
          connected: old?.connected ?? true
        }
      })

      return { previousMessages }
    },
    onError: (_err, _message, context) => {
      // Rollback on error
      if (context?.previousMessages) {
        queryClient.setQueryData(messageQueryKey, context.previousMessages)
      }
    },
    onSettled: (_data, _error, variables) => {
      if (variables.previewUrl) URL.revokeObjectURL(variables.previewUrl)
      // Refetch to get server state
      queryClient.invalidateQueries({ queryKey: ['inbox-messages', selectedChatId] })
      queryClient.invalidateQueries({ queryKey: ['inbox-chats'] })
    }
  })

  // ── Auto-scroll ────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const messages = messageData?.messages || []
    if (messages.length !== prevMessageCount.current) {
      prevMessageCount.current = messages.length
      // Small delay for DOM update
      setTimeout(scrollToBottom, 100)
    }
  }, [messageData?.messages, scrollToBottom])

  // Also scroll on chat change
  useEffect(() => {
    prevMessageCount.current = 0
    setTimeout(scrollToBottom, 200)
  }, [selectedChatId, scrollToBottom])

  // ── Send handler ───────────────────────────────────────────

  const chooseAttachment = (file: File | null) => {
    setAttachmentError(null)
    if (!file) return
    if (file.size > 25 * 1024 * 1024) {
      setAttachmentError('Attachment must be 25 MB or smaller')
      return
    }
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
    setAttachment(file)
    setAttachmentPreview(URL.createObjectURL(file))
  }

  const clearAttachment = () => {
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
    setAttachment(null)
    setAttachmentPreview(null)
    setAttachmentError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openChat = (chatId: string | null) => {
    clearAttachment()
    setSelectedChatId(chatId)
  }

  const handleSend = () => {
    const text = messageInput.trim()
    if ((!text && !attachment) || sendMutation.isPending) return
    sendMutation.mutate({ message: text, file: attachment, previewUrl: attachmentPreview })
    setMessageInput('')
    setAttachment(null)
    setAttachmentPreview(null)
    setAttachmentError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Auto-resize textarea
  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(event.clipboardData.files)[0]
    if (!file) return
    event.preventDefault()
    chooseAttachment(file)
  }

  // ── Derived state ──────────────────────────────────────────

  const chats = chatData?.chats || []
  const connected = chatData?.connected ?? true
  const messages = messageData?.messages || []
  const selectedChat = chats.find(c => c.id === selectedChatId)
  const bookingName = (selectedChat?.name || 'Student').replace(/\s*#\d+\s*$/, '').trim()
  const bookingPhone = selectedBotState?.phone || (selectedChatId?.endsWith('@c.us')
    ? selectedChatId.replace('@c.us', '').replace(/\D/g, '')
    : '')
  const bookingParams = new URLSearchParams({ bookFor: bookingName })
  if (bookingPhone) bookingParams.set('phone', bookingPhone)
  const systemDialogTitle = selectedSystemMessage?.systemKind === 'cancelled'
    ? 'Class cancelled'
    : selectedSystemMessage?.systemKind === 'updated'
      ? 'Schedule updated'
      : selectedSystemMessage?.systemKind === 'scheduled'
        ? 'Class scheduled'
        : 'Class reminder'

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* ── Chat list sidebar ── */}
      <div
        className={`${
          selectedChatId ? 'hidden md:flex' : 'flex'
        } flex-col w-full md:w-80 lg:w-96 border-r bg-background flex-shrink-0`}
      >
        {/* Header */}
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Inbox
            </h1>
            <div className="flex items-center gap-1.5">
              {connected ? (
                <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-xs">
                  <Wifi className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 text-xs">
                  <WifiOff className="h-3 w-3 mr-1" />
                  Disconnected
                </Badge>
              )}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search chats..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          {!connected ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2 p-4">
              <WifiOff className="h-10 w-10" />
              <p className="text-sm font-medium">WhatsApp Not Connected</p>
              <p className="text-xs text-center">Go to the home page to scan the QR code and connect WhatsApp.</p>
            </div>
          ) : chatsLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <MessageCircle className="h-10 w-10" />
              <p className="text-sm">
                {searchTerm ? 'No chats found' : 'No conversations yet'}
              </p>
            </div>
          ) : (
            chats.map(chat => {
              return (
                <ChatListItem
                  key={chat.id}
                  chat={chat}
                  isSelected={chat.id === selectedChatId}
                  onClick={() => openChat(chat.id)}
                  botState={botStateForChat(chat)}
                />
              )
            })
          )}
        </div>
      </div>

      {/* ── Message area ── */}
      <div
        className={`${
          selectedChatId ? 'flex' : 'hidden md:flex'
        } flex-col flex-1 bg-background min-w-0`}
      >
        {!selectedChatId ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <MessageCircle className="h-10 w-10" />
            </div>
            <h2 className="text-lg font-medium">Select a conversation</h2>
            <p className="text-sm">Choose a chat from the sidebar to start messaging</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-background flex-shrink-0">
              <button
                onClick={() => openChat(null)}
                className="md:hidden p-1 rounded hover:bg-muted"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                selectedChat?.isGroup ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {selectedChat?.isGroup ? <Users className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold truncate">{selectedChat?.name || 'Chat'}</h2>
                <p className="text-xs text-muted-foreground">
                  {selectedChat?.isGroup ? 'Group' : 'Direct message'}
                </p>
              </div>

              {selectedChat?.isGroup && selectedChatId && (
                <Button asChild size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 px-2.5 text-xs">
                  <Link href={`/groups/${encodeURIComponent(selectedChatId)}`}>
                    <Users className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Open group</span>
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </Link>
                </Button>
              )}

              {/* Bot pause/resume — only for individual chats, only when the
                  bot has ever seen this thread (or is enabled and this
                  is a non-group chat). */}
              {!selectedChat?.isGroup && selectedPhone && botStatus?.enabled && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {selectedBotState?.paused ? (
                    <>
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                        <Pause className="h-2.5 w-2.5 mr-1" />
                        Bot paused
                        {selectedBotState.pausedUntil && (
                          <span className="ml-1 opacity-70">· {fmtPauseRemaining(selectedBotState.pausedUntil)} left</span>
                        )}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => botToggle.mutate({ phone: selectedPhone, action: 'resume' })}
                        disabled={botToggle.isPending}
                      >
                        <Play className="h-3 w-3 mr-1" /> Resume bot
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                        <Bot className="h-2.5 w-2.5 mr-1" />
                        Bot active
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => botToggle.mutate({ phone: selectedPhone, action: 'pause' })}
                        disabled={botToggle.isPending}
                      >
                        <Pause className="h-3 w-3 mr-1" /> Pause bot
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Messages */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto px-3 md:px-6 py-3 bg-[#EFEAE2] dark:bg-neutral-900"
            >
              {messagesLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p className="text-sm">No messages yet</p>
                </div>
              ) : (
                <>
                  {canLoadOlder && (
                    <div className="flex justify-center py-2">
                      <button
                        onClick={loadOlder}
                        className="text-xs text-neutral-600 dark:text-neutral-300 bg-white/85 dark:bg-neutral-800/90 border border-black/5 dark:border-white/10 rounded-full px-4 py-1.5 hover:bg-white transition-colors"
                        disabled={messagesLoading}
                      >
                        {messagesLoading ? 'Loading…' : 'Load older messages'}
                      </button>
                    </div>
                  )}
                  {messages.map((msg, idx) => {
                    const prevMsg = idx > 0 ? messages[idx - 1] : null
                    const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null
                    const showDate = !prevMsg || getDateKey(msg.timestamp) !== getDateKey(prevMsg.timestamp)
                    // A message starts a new "run" when the previous one is
                    // from the other side, from a different group sender,
                    // >5 min older, or across a date separator. Same rules for
                    // the last-in-run boundary against the next message.
                    const runBreak = (a: Message | null, b: Message | null): boolean => {
                      if (!a || !b) return true
                      if (a.fromMe !== b.fromMe) return true
                      if ((a.systemKind || '') !== (b.systemKind || '')) return true
                      if (a.systemKind || b.systemKind || a.isReminder || b.isReminder) return true
                      if (!!a.isAiReply !== !!b.isAiReply) return true
                      if ((a.senderName || '') !== (b.senderName || '')) return true
                      const gap = Math.abs((b.timestamp || 0) - (a.timestamp || 0))
                      if (gap > 5 * 60) return true
                      return false
                    }
                    const isFirstInRun = showDate || runBreak(prevMsg, msg)
                    const isLastInRun = runBreak(msg, nextMsg) || (nextMsg ? getDateKey(msg.timestamp) !== getDateKey(nextMsg.timestamp) : true)
                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <DateSeparator label={formatDateSeparator(msg.timestamp)} />
                        )}
                        <MessageBubble
                          message={msg}
                          isGroup={selectedChat?.isGroup || false}
                          isFirstInRun={isFirstInRun}
                          isLastInRun={isLastInRun}
                          onSystemMessageClick={setSelectedSystemMessage}
                          onOpenImage={(url, name) => setOpenImage({ url, name })}
                        />
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Message input */}
            <div className="border-t px-4 py-2.5 bg-background flex-shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                className="hidden"
                onChange={event => chooseAttachment(event.target.files?.[0] || null)}
              />
              {attachment && (
                <div className="mx-auto mb-2 flex max-w-3xl items-center gap-3 rounded-xl border bg-muted/40 p-2.5">
                  {attachment.type.startsWith('image/') && attachmentPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={attachmentPreview} alt="Attachment preview" className="h-14 w-14 rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-background shadow-sm">
                      <Paperclip className="h-5 w-5 text-muted-foreground" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{attachment.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(attachment.size / 1024 / 1024).toFixed(attachment.size > 1024 * 1024 ? 1 : 2)} MB · ready to send
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearAttachment}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label="Remove attachment"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {attachmentError && (
                <p className="mx-auto mb-2 max-w-3xl text-xs text-red-500">{attachmentError}</p>
              )}
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sendMutation.isPending}
                  className="h-9 w-9 rounded-full flex-shrink-0 text-muted-foreground"
                  aria-label="Attach a photo or file"
                  title="Attach a photo or file"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <textarea
                  ref={textareaRef}
                  value={messageInput}
                  onChange={handleTextareaInput}
                  onPaste={handlePaste}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  rows={1}
                  className="flex-1 resize-none rounded-lg border bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  style={{ maxHeight: '120px' }}
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={(!messageInput.trim() && !attachment) || sendMutation.isPending}
                  className="h-9 w-9 rounded-full flex-shrink-0"
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {sendMutation.isError && (
                <p className="text-xs text-red-500 mt-1">
                  Failed to send: {sendMutation.error?.message}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <Dialog open={!!openImage} onOpenChange={(open) => !open && setOpenImage(null)}>
        <DialogContent className="max-w-5xl overflow-hidden border-neutral-800 bg-neutral-950 p-0 text-white">
          <DialogHeader className="sr-only">
            <DialogTitle>{openImage?.name || 'WhatsApp photo'}</DialogTitle>
            <DialogDescription>Full-size WhatsApp attachment preview</DialogDescription>
          </DialogHeader>
          {openImage && (
            <div className="flex max-h-[88vh] min-h-72 flex-col">
              <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-3 sm:p-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={openImage.url}
                  alt={openImage.name}
                  className="max-h-[76vh] max-w-full object-contain"
                />
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
                <span className="min-w-0 truncate text-sm text-neutral-300">{openImage.name}</span>
                <a
                  href={`${openImage.url}${openImage.url.includes('?') ? '&' : '?'}download=1`}
                  download={openImage.name}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!selectedSystemMessage}
        onOpenChange={(open) => !open && setSelectedSystemMessage(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{systemDialogTitle}</DialogTitle>
            <DialogDescription>
              Open the school calendar or start booking another class for {bookingName}.
            </DialogDescription>
          </DialogHeader>

          {selectedSystemMessage?.body && (
            <div className="rounded-lg bg-muted/60 p-3 text-sm leading-relaxed text-muted-foreground">
              {selectedSystemMessage.body.replace(/^\s*(Reminder|Schedule update|Class cancelled)\s*:\s*/i, '')}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild className="justify-between">
              <Link href="/scheduling" onClick={() => setSelectedSystemMessage(null)}>
                Open calendar
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
            {!selectedChat?.isGroup && (
              <Button variant="outline" asChild className="justify-between">
                <Link
                  href={`/scheduling?${bookingParams.toString()}`}
                  onClick={() => setSelectedSystemMessage(null)}
                >
                  Book another class
                  <CalendarPlus className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
