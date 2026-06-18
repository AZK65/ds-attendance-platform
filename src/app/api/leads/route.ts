import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

// GET /api/leads
//   ?status=new|contacted|archived|all   (default: all non-archived)
//   ?q=<search>                          name / email / phone / notes
//   ?countOnly=1                         returns just { newCount } (for the nav badge)
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams

  try {
    const newCount = await prisma.lead.count({ where: { status: 'new', isTest: false } })
    if (sp.get('countOnly') === '1') {
      return NextResponse.json({ newCount })
    }

    const status = sp.get('status') || 'active'
    const q = sp.get('q')?.trim() || ''

    const where: Prisma.LeadWhereInput = {}
    if (status === 'active') where.status = { in: ['new', 'contacted'] }
    else if (status !== 'all') where.status = status
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
        { phone: { contains: q } },
        { notes: { contains: q } },
      ]
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return NextResponse.json({ leads, newCount })
  } catch (error) {
    console.error('Error fetching leads:', error)
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }
}

// POST /api/leads — manually add a lead (phone-in inquiries, old email leads)
// Body: { name?, email?, phone?, notes? }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { name?: string; email?: string; phone?: string; notes?: string }
    const name = body.name?.trim() || null
    const email = body.email?.trim() || null
    const phone = body.phone?.trim() || null
    const notes = body.notes?.trim() || null
    if (!name && !email && !phone) {
      return NextResponse.json({ error: 'Enter at least a name, phone, or email' }, { status: 400 })
    }
    const lead = await prisma.lead.create({
      data: { name, email, phone, notes, source: 'manual' },
    })
    return NextResponse.json({ lead })
  } catch (error) {
    console.error('Error creating lead:', error)
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }
}
