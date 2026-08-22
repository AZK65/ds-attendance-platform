import { prisma } from '@/lib/db'
import { buildSystemPrompt } from './persona'
import { buildBotStudentContext } from './student-context'

// One handler function called from the WhatsApp client's 'message' event.
// Returns the reply text to send, or null if the bot decided to stay silent
// (defer, paused, not-yet-enabled, or LLM error). Never throws — a bot
// failure must never crash the WA event loop.

const CONTEXT_MESSAGES = 12 // last N messages fed back as chat context
const MAX_INBOUND_LEN = 2000 // truncate absurd inbound (docs pasted, etc.)
const MAX_REPLY_LEN = 900 // WhatsApp UX ceiling — anything longer feels wrong
const DEFER_TOKEN = '[DEFER]'

// OpenRouter model. Haiku 4.5 is fast, cheap (~$0.001/msg), and has the
// instruction-following we need for the strict persona. Override via env.
const MODEL = process.env.BOT_MODEL || 'anthropic/claude-haiku-4.5'

type LlmMsg = { role: 'system' | 'user' | 'assistant'; content: string }

export interface InboundContext {
  fromPhone: string // digits only, incl. country code (e.g. 15145551234)
  fromJid: string   // full WA JID as received on the inbound (e.g. '15145551234@c.us' or '123456789@lid')
                    // — the outbound MUST reply to this exact JID; deriving one via phoneToJid
                    // breaks for @lid contacts (WhatsApp errors 'No LID for user').
  fromName?: string // pushname from WA if available
  body: string
}

export interface BotResult {
  reply: string | null // null = don't send anything
  deferred: boolean
  conversationId: string
  fromJid: string // the WA JID to reply to (echoed back so caller doesn't
                  // have to reconstruct it — critical for @lid contacts)
}

export async function handleInboundMessage(ctx: InboundContext): Promise<BotResult> {
  const body = ctx.body.slice(0, MAX_INBOUND_LEN).trim()

  // Global kill switch. Set BOT_ENABLED=false to silence the bot in prod
  // without a code deploy while debugging.
  if (process.env.BOT_ENABLED === 'false') {
    const conv = await upsertConversation(ctx)
    await logMessage(conv.id, 'user', body)
    return { reply: null, deferred: true, conversationId: conv.id, fromJid: ctx.fromJid }
  }

  // Empty / non-text messages we can't do anything with (image, sticker, etc.)
  if (!body) {
    const conv = await upsertConversation(ctx)
    return { reply: null, deferred: true, conversationId: conv.id, fromJid: ctx.fromJid }
  }

  // Per-phone pause check. Set by admin manual reply or /whatsapp toggle.
  const paused = await isPaused(ctx.fromPhone, ctx.fromJid)
  if (paused) {
    const conv = await upsertConversation(ctx)
    await logMessage(conv.id, 'user', body)
    return { reply: null, deferred: true, conversationId: conv.id, fromJid: ctx.fromJid }
  }

  const studentContext = await buildBotStudentContext(ctx.fromPhone).catch(err => {
    console.error('[bot] Student context lookup failed:', err)
    return null
  })
  const conv = await upsertConversation(ctx, studentContext?.studentId)
  await logMessage(conv.id, 'user', body)

  // Pull last N messages for chat context. Reverse order — Prisma returns
  // newest-first but the LLM wants oldest-first.
  const history = await prisma.botMessage.findMany({
    where: { conversationId: conv.id, status: 'sent' },
    orderBy: { createdAt: 'desc' },
    take: CONTEXT_MESSAGES,
  })
  history.reverse()

  // Old WhatsApp duplicate events left identical adjacent transcript rows.
  // Collapse them before sending context to the model so it doesn't imitate
  // duplicated replies or think the customer repeated every sentence.
  const cleanHistory = history.filter((message, index) => {
    const previous = history[index - 1]
    return !previous || previous.role !== message.role || previous.body !== message.body
  })

  const messages: LlmMsg[] = [
    { role: 'system', content: buildSystemPrompt(studentContext?.prompt) },
    ...cleanHistory.map(m => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.body,
    })),
  ]
  // The just-logged inbound is already in `history` (we wrote it before the
  // fetch), so we don't append it again — that would duplicate it.

  let raw: string
  try {
    raw = await callOpenRouter(messages)
  } catch (err) {
    console.error('[bot] LLM call failed:', err)
    return { reply: null, deferred: true, conversationId: conv.id, fromJid: ctx.fromJid }
  }

  const reply = interpretReply(raw)
  if (reply === null) {
    await logMessage(conv.id, 'assistant', raw.slice(0, 400), 'deferred')
    return { reply: null, deferred: true, conversationId: conv.id, fromJid: ctx.fromJid }
  }

  const truncated = reply.length > MAX_REPLY_LEN ? reply.slice(0, MAX_REPLY_LEN) : reply
  // NOTE: we do NOT log-as-sent here anymore. The transcript row is
  // written by the WA client only after client.sendMessage actually
  // resolves — otherwise a silent send failure would leave the DB
  // claiming a message was delivered when it never left the server.
  // See logBotSendSuccess / logBotSendFailure below.
  return { reply: truncated, deferred: false, conversationId: conv.id, fromJid: ctx.fromJid }
}

// Called from the WhatsApp client after the outbound has actually left
// the client (client.sendMessage resolved successfully). Split from
// handleInboundMessage so we only claim "sent" when it truly went out.
export async function logBotSendSuccess(
  conversationId: string,
  body: string,
  waMessageId?: string,
): Promise<void> {
  await logMessage(conversationId, 'assistant', body, 'sent', waMessageId)
}

// Called when client.sendMessage throws. Status 'deferred' so the
// admin UI shows it clearly (with the error text) instead of an
// invisible failure that surfaces later as "why didn't the customer
// get my reply".
export async function logBotSendFailure(
  conversationId: string,
  body: string,
  error: string,
): Promise<void> {
  const detail = `[send failed] ${error.slice(0, 200)}\n\n${body}`
  await logMessage(conversationId, 'assistant', detail, 'deferred')
}

// ── Reply interpretation ────────────────────────────────────────

function interpretReply(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Exact defer token — the persona instructs the model to reply with just
  // "[DEFER]" and nothing else when it can't respond confidently.
  if (trimmed === DEFER_TOKEN) return null
  // Sometimes the model wraps the token in extra whitespace/quotes. Catch
  // "[DEFER]", '[DEFER]', "[defer]" etc.
  if (/^["'\s]*\[?\s*defer\s*\]?["'\s]*$/i.test(trimmed)) return null
  // Also treat any reply that contains DEFER by itself on a line as a defer.
  if (/^\s*\[?\s*defer\s*\]?\s*$/im.test(trimmed) && trimmed.length < 20) return null
  // Defensive: strip common AI-tell openings that would blow the persona
  // (rare but has been observed with Haiku when it "helps too much").
  const openings = /^(sure!?|absolutely!?|of course!?|great question!?|certainly!?|happy to help[!.]?|i'd be happy to help[!.]?|as an ai|as a language model)[,\s]/i
  if (openings.test(trimmed)) {
    // Rather than send something starting with an AI tell, defer.
    console.warn('[bot] Reply started with AI-tell opening; deferring:', trimmed.slice(0, 80))
    return null
  }
  // Same for AI-tell endings.
  const endings = /(let me know if|feel free to (ask|reach|contact)|hope (this|that) helps|is there anything else)[!.?]?\s*$/i
  if (endings.test(trimmed)) {
    console.warn('[bot] Reply ended with AI-tell; deferring:', trimmed.slice(-80))
    return null
  }
  // Reject replies that mention being an AI/bot/assistant regardless of position.
  const aiWords = /\b(as an ai|i am an ai|i'm an ai|language model|chatbot|virtual assistant|automated (system|reply)|as a bot)\b/i
  if (aiWords.test(trimmed)) {
    console.warn('[bot] Reply broke the persona; deferring:', trimmed.slice(0, 120))
    return null
  }
  return trimmed
}

// ── OpenRouter call ─────────────────────────────────────────────

async function callOpenRouter(messages: LlmMsg[]): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY not set')

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://qazidrivingschool.ca',
      'X-Title': 'Qazi WhatsApp Bot',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.4, // low but not zero — small variation on wording
      max_tokens: 400,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`OpenRouter ${res.status}: ${detail.slice(0, 200)}`)
  }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('OpenRouter returned no content')
  return content
}

// ── Persistence helpers ─────────────────────────────────────────

async function upsertConversation(ctx: InboundContext, resolvedStudentId?: string | null) {
  // Look up matching Student so admin UI can show it. Match by suffix
  // (last 10 digits) — same rule the register flow uses on phone.
  let studentId: string | undefined = resolvedStudentId || undefined
  const suffix = ctx.fromPhone.replace(/\D/g, '').slice(-10)
  if (!studentId && suffix.length >= 7) {
    const student = await prisma.student.findFirst({
      where: { phone: { contains: suffix } },
      select: { id: true },
    })
    studentId = student?.id
  }

  return prisma.botConversation.upsert({
    where: { phone: ctx.fromPhone },
    create: {
      phone: ctx.fromPhone,
      displayName: ctx.fromName || null,
      studentId: studentId ?? null,
    },
    update: {
      ...(ctx.fromName ? { displayName: ctx.fromName } : {}),
      ...(studentId ? { studentId } : {}),
    },
  })
}

async function logMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'admin',
  body: string,
  status: 'sent' | 'deferred' = 'sent',
  waMessageId?: string,
) {
  return prisma.botMessage.create({
    data: { conversationId, role, body, status, waMessageId: waMessageId || null },
  })
}

// ── Pause helpers ───────────────────────────────────────────────

async function isPaused(phone: string, fromJid?: string): Promise<boolean> {
  const legacyLid = fromJid?.endsWith('@lid') ? fromJid.split('@')[0]?.replace(/\D/g, '') : ''
  const rows = await prisma.botPause.findMany({
    where: { phone: { in: [phone, legacyLid].filter(Boolean) } },
  })
  return rows.some(row => row.pausedUntil.getTime() > Date.now())
}

// Auto-pause after admin sends a manual outbound message. 24h window means
// the bot stays out of the way while a real conversation is happening, and
// naturally re-engages if the customer messages again the next day with
// no admin follow-up. Extended on every subsequent admin message.
const ADMIN_PAUSE_HOURS = 24

export async function pauseForAdminReply(phone: string): Promise<void> {
  const until = new Date(Date.now() + ADMIN_PAUSE_HOURS * 60 * 60 * 1000)
  await prisma.botPause.upsert({
    where: { phone },
    create: { phone, pausedUntil: until, reason: 'admin-reply' },
    update: { pausedUntil: until, reason: 'admin-reply' },
  })
  // Also log the admin's message onto the conversation transcript so the
  // bot's context stays coherent if the pause later expires.
  // (The message body itself is logged by the caller in client.ts.)
}

// Also expose the raw log so client.ts can log admin messages without
// re-implementing the schema.
export async function logAdminMessage(phone: string, body: string, waMessageId?: string) {
  const conv = await prisma.botConversation.findUnique({ where: { phone } })
  if (!conv) return
  await logMessage(conv.id, 'admin', body, 'sent', waMessageId)
}
