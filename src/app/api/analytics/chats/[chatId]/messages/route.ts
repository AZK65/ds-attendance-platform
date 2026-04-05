import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { buildDataContext, SYSTEM_PROMPT } from '@/lib/analytics-context'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

// POST - send a message and stream AI response
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params
  const { message } = await request.json()

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400 })
  }

  // Save user message
  await prisma.analyticsChatMessage.create({
    data: { chatId, role: 'user', content: message },
  })

  // Update chat title from first message
  const chat = await prisma.analyticsChat.findUnique({
    where: { id: chatId },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 1 } },
  })
  if (chat?.title === 'New Chat') {
    await prisma.analyticsChat.update({
      where: { id: chatId },
      data: { title: message.slice(0, 60) },
    })
  }

  // Get conversation history
  const history = await prisma.analyticsChatMessage.findMany({
    where: { chatId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true },
  })

  // Build data context
  const dataContext = await buildDataContext()

  // Build messages for OpenRouter
  const apiMessages = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}\n\nCurrent data snapshot (${new Date().toLocaleString('en-US', { timeZone: 'America/Montreal' })}):\n${dataContext}`,
    },
    ...history.map(m => ({ role: m.role, content: m.content })),
  ]

  // Stream response from OpenRouter
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
            'X-Title': 'DS Attendance Platform - Analytics',
          },
          body: JSON.stringify({
            model: 'anthropic/claude-sonnet-4',
            messages: apiMessages,
            stream: true,
          }),
        })

        if (!response.ok) {
          const err = await response.text()
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `AI error: ${response.status} ${err}` })}\n\n`))
          controller.close()
          return
        }

        const reader = response.body?.getReader()
        if (!reader) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'No response body' })}\n\n`))
          controller.close()
          return
        }

        let fullContent = ''
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta?.content
              if (delta) {
                fullContent += delta
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: delta })}\n\n`))
              }
            } catch {
              // skip unparseable lines
            }
          }
        }

        // Extract chart data from <chart>...</chart> tags
        let chartData: string | null = null
        const chartMatch = fullContent.match(/<chart>([\s\S]*?)<\/chart>/)
        if (chartMatch) {
          try {
            JSON.parse(chartMatch[1].trim()) // validate JSON
            chartData = chartMatch[1].trim()
          } catch {
            // invalid chart JSON, skip
          }
        }

        // Save assistant message
        await prisma.analyticsChatMessage.create({
          data: { chatId, role: 'assistant', content: fullContent, chartData },
        })

        // Update chat timestamp
        await prisma.analyticsChat.update({
          where: { id: chatId },
          data: { updatedAt: new Date() },
        })

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, chartData })}\n\n`))
        controller.close()
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
