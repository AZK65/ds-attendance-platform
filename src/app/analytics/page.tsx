'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  MessageCircle, Plus, Trash2, Send, Loader2, BarChart3,
  DollarSign, Users, GraduationCap, CalendarDays, TrendingUp,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

interface ChatSummary {
  id: string
  title: string
  updatedAt: string
  messageCount: number
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  chartData?: string | null
  createdAt: string
}

interface ChartConfig {
  type: 'bar' | 'line' | 'pie'
  title: string
  data: Array<{ name: string; value: number; [key: string]: string | number }>
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

const SUGGESTED_PROMPTS = [
  { icon: DollarSign, label: 'Monthly Revenue', prompt: 'Show me a monthly revenue chart for the past 6 months' },
  { icon: Users, label: 'Student Enrollment', prompt: 'How many new students enrolled this month vs last month?' },
  { icon: TrendingUp, label: 'Business Overview', prompt: 'Give me a full business overview with key metrics' },
  { icon: GraduationCap, label: 'Certificates', prompt: 'How many certificates have we issued? Show breakdown by type' },
  { icon: CalendarDays, label: 'Attendance Rate', prompt: 'What is our overall attendance rate?' },
  { icon: BarChart3, label: 'Unpaid Invoices', prompt: 'How many invoices are unpaid? What is the total outstanding amount?' },
]

function ChartBlock({ config }: { config: ChartConfig }) {
  if (!config?.data?.length) return null

  return (
    <div className="my-3 p-4 border rounded-lg bg-background">
      <p className="text-sm font-medium mb-3">{config.title}</p>
      <ResponsiveContainer width="100%" height={250}>
        {config.type === 'pie' ? (
          <PieChart>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Pie data={config.data} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" label={(props: any) => `${props.name}: ${props.value}`}>
              {config.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        ) : config.type === 'line' ? (
          <LineChart data={config.data}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        ) : (
          <BarChart data={config.data}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'

  // Parse chart from content
  let chartConfig: ChartConfig | null = null
  let displayContent = msg.content

  if (msg.chartData) {
    try {
      chartConfig = JSON.parse(msg.chartData)
    } catch { /* skip */ }
  }

  // Also check inline <chart> tags
  const chartMatch = displayContent.match(/<chart>([\s\S]*?)<\/chart>/)
  if (chartMatch && !chartConfig) {
    try {
      chartConfig = JSON.parse(chartMatch[1].trim())
    } catch { /* skip */ }
  }
  // Remove chart tags from display
  displayContent = displayContent.replace(/<chart>[\s\S]*?<\/chart>/g, '').trim()

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
        isUser
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted'
      }`}>
        <div className="text-sm whitespace-pre-wrap leading-relaxed">{displayContent}</div>
        {chartConfig && <ChartBlock config={chartConfig} />}
      </div>
    </motion.div>
  )
}

export default function AnalyticsPage() {
  const queryClient = useQueryClient()
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Fetch chat list
  const { data: chatListData } = useQuery<{ chats: ChatSummary[] }>({
    queryKey: ['analytics-chats'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/chats')
      return res.json()
    },
  })
  const chats = chatListData?.chats || []

  // Fetch active chat messages
  const { data: chatData, refetch: refetchChat } = useQuery<{ chat: { id: string; title: string; messages: ChatMessage[] } }>({
    queryKey: ['analytics-chat', activeChatId],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/chats/${activeChatId}`)
      return res.json()
    },
    enabled: !!activeChatId,
  })
  const messages = chatData?.chat?.messages || []

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamContent])

  const createChat = useCallback(async () => {
    const res = await fetch('/api/analytics/chats', { method: 'POST' })
    const data = await res.json()
    setActiveChatId(data.chat.id)
    queryClient.invalidateQueries({ queryKey: ['analytics-chats'] })
    return data.chat.id
  }, [queryClient])

  const deleteChat = async (chatId: string) => {
    await fetch(`/api/analytics/chats/${chatId}`, { method: 'DELETE' })
    if (activeChatId === chatId) setActiveChatId(null)
    queryClient.invalidateQueries({ queryKey: ['analytics-chats'] })
  }

  const sendMessage = async (text: string) => {
    if (!text.trim() || streaming) return

    let chatId = activeChatId
    if (!chatId) {
      chatId = await createChat()
    }

    setInput('')
    setStreaming(true)
    setStreamContent('')

    // Optimistically add user message
    queryClient.setQueryData(['analytics-chat', chatId], (old: typeof chatData) => {
      if (!old) return old
      return {
        chat: {
          ...old.chat,
          messages: [...old.chat.messages, {
            id: 'temp-user',
            role: 'user' as const,
            content: text,
            chartData: null,
            createdAt: new Date().toISOString(),
          }],
        },
      }
    })

    try {
      const res = await fetch(`/api/analytics/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })

      const reader = res.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.token) {
              fullContent += data.token
              setStreamContent(fullContent)
            }
            if (data.done) {
              setStreaming(false)
              setStreamContent('')
              refetchChat()
              queryClient.invalidateQueries({ queryKey: ['analytics-chats'] })
            }
            if (data.error) {
              setStreaming(false)
              setStreamContent(`Error: ${data.error}`)
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setStreaming(false)
      setStreamContent('Failed to get response. Check your connection.')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleSuggestedPrompt = (prompt: string) => {
    sendMessage(prompt)
  }

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-r flex flex-col bg-muted/30 overflow-hidden"
          >
            <div className="p-3 border-b">
              <Button className="w-full" size="sm" onClick={() => { setActiveChatId(null); setStreamContent('') }}>
                <Plus className="h-4 w-4 mr-2" /> New Chat
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {chats.map(chat => (
                <div
                  key={chat.id}
                  className={`flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-muted/50 border-b border-muted/50 ${
                    activeChatId === chat.id ? 'bg-muted' : ''
                  }`}
                  onClick={() => { setActiveChatId(chat.id); setStreamContent('') }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{chat.title}</p>
                    <p className="text-xs text-muted-foreground">{timeAgo(chat.updatedAt)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 hover:opacity-100 shrink-0"
                    onClick={(e) => { e.stopPropagation(); deleteChat(chat.id) }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {chats.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">No chats yet</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b px-4 py-2 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <MessageCircle className="h-4 w-4" />
          </Button>
          <h1 className="text-sm font-medium">
            {chatData?.chat?.title || 'Analytics'}
          </h1>
        </div>

        {/* Messages or welcome */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {!activeChatId && messages.length === 0 && !streamContent ? (
            <div className="max-w-2xl mx-auto space-y-8">
              <div className="text-center pt-12">
                <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-2xl font-bold mb-2">Analytics</h2>
                <p className="text-muted-foreground">Ask anything about your business data</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {SUGGESTED_PROMPTS.map((sp, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestedPrompt(sp.prompt)}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                  >
                    <sp.icon className="h-5 w-5 text-muted-foreground shrink-0" />
                    <span className="text-sm">{sp.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              {streamContent && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-muted">
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">{streamContent}</div>
                  </div>
                </motion.div>
              )}
              {streaming && !streamContent && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-4 py-3 bg-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t p-4">
          <div className="max-w-3xl mx-auto flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about revenue, students, attendance..."
              className="flex-1 resize-none rounded-xl border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px] max-h-[120px]"
              rows={1}
              disabled={streaming}
            />
            <Button
              size="icon"
              className="rounded-xl h-[44px] w-[44px] shrink-0"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || streaming}
            >
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
