'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Search, Send, ArrowLeft, Users, User, Wifi, WifiOff,
  Loader2, MessageCircle, ImageIcon, FileText, Mic, Video,
  Bot, Pause, Play, AlertCircle
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
}

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
  const isBotActive = !chat.isGroup && !isPaused
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
            {chat.lastMessage?.fromMe && <span className="text-primary">You: </span>}
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

function MessageBubble({
  message,
  isGroup,
  isFirstInRun,
  isLastInRun,
}: {
  message: Message
  isGroup: boolean
  isFirstInRun: boolean
  isLastInRun: boolean
}) {
  const isNonText = message.type !== 'chat' && message.type !== 'e2e_notification' && message.type !== 'notification_template'
  const media = isNonText ? mediaPlaceholder(message.type) : null
  const MediaIcon = media?.icon
  const mine = message.fromMe

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
        className={`
          max-w-[85%] md:max-w-[70%] px-3.5 py-2 shadow-sm ${cornerCls}
          ${mine
            ? 'bg-[#DCF8C6] text-neutral-900 dark:bg-emerald-800 dark:text-neutral-50'
            : 'bg-white text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100 border border-black/[0.03] dark:border-white/5'
          }
        `}
      >
        {/* Sender name for group received messages — only on first-in-run so it
            isn't repeated on every bubble of the same sender's stack. */}
        {isGroup && !mine && message.senderName && isFirstInRun && (
          <p className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-400 mb-0.5 truncate">
            {message.senderName}
          </p>
        )}

        {/* Media placeholder */}
        {media && MediaIcon && (
          <div className={`flex items-center gap-1.5 text-[13px] mb-1 ${mine ? 'text-neutral-700/80 dark:text-neutral-100/80' : 'text-neutral-500 dark:text-neutral-400'}`}>
            <MediaIcon className="h-3.5 w-3.5" />
            <span className="italic">{media.label}</span>
          </div>
        )}

        {/* Message body */}
        {message.body && (
          <p className="text-[14.5px] leading-[1.4] whitespace-pre-wrap break-words">{message.body}</p>
        )}

        {/* Timestamp — right-aligned, inline with last line via flex-end.
            Only on the last message of a run to reduce visual noise. */}
        {isLastInRun && (
          <div className={`flex justify-end mt-1 text-[10.5px] tabular-nums ${mine ? 'text-neutral-500 dark:text-neutral-300/70' : 'text-neutral-400 dark:text-neutral-400'}`}>
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
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [messageInput, setMessageInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
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

  const {
    data: messageData,
    isLoading: messagesLoading
  } = useQuery({
    queryKey: ['inbox-messages', selectedChatId, currentLimit],
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
  const botByPhone = new Map((botStatus?.conversations || []).map(c => [c.phone, c]))
  const selectedPhone = chatIdToPhone(selectedChatId)
  const selectedBotState = selectedPhone ? botByPhone.get(selectedPhone) || null : null

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
    mutationFn: async (message: string) => {
      if (!selectedChatId) throw new Error('No chat selected')
      const res = await fetch(`/api/inbox/chats/${encodeURIComponent(selectedChatId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to send message')
      }
      return res.json()
    },
    onMutate: async (message) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['inbox-messages', selectedChatId] })
      const previousMessages = queryClient.getQueryData(['inbox-messages', selectedChatId])

      queryClient.setQueryData(['inbox-messages', selectedChatId], (old: { messages: Message[]; connected: boolean } | undefined) => {
        const optimistic: Message = {
          id: `optimistic-${Date.now()}`,
          body: message,
          timestamp: Math.floor(Date.now() / 1000),
          fromMe: true,
          senderName: null,
          type: 'chat',
          hasMedia: false
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
        queryClient.setQueryData(['inbox-messages', selectedChatId], context.previousMessages)
      }
    },
    onSettled: () => {
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

  const handleSend = () => {
    const text = messageInput.trim()
    if (!text || sendMutation.isPending) return
    sendMutation.mutate(text)
    setMessageInput('')
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

  // ── Derived state ──────────────────────────────────────────

  const chats = chatData?.chats || []
  const connected = chatData?.connected ?? true
  const messages = messageData?.messages || []
  const selectedChat = chats.find(c => c.id === selectedChatId)

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
              const phone = chatIdToPhone(chat.id)
              return (
                <ChatListItem
                  key={chat.id}
                  chat={chat}
                  isSelected={chat.id === selectedChatId}
                  onClick={() => setSelectedChatId(chat.id)}
                  botState={phone ? botByPhone.get(phone) : null}
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
                onClick={() => setSelectedChatId(null)}
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
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={messageInput}
                  onChange={handleTextareaInput}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  rows={1}
                  className="flex-1 resize-none rounded-lg border bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  style={{ maxHeight: '120px' }}
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!messageInput.trim() || sendMutation.isPending}
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
    </div>
  )
}
