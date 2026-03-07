import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { searchStudents, testConnection, countStudentsByDateRange, monthlyBreakdown } from '@/lib/external-db'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const search = searchParams.get('q') || ''
  const stats = searchParams.get('stats')

  // Stats mode: ?stats=2024-01-01,2025-01-01
  if (stats) {
    try {
      const [start, end] = stats.split(',')
      const [countRows, monthlyRows] = await Promise.all([
        countStudentsByDateRange(start, end),
        monthlyBreakdown(start, end),
      ])
      return NextResponse.json({ total: countRows[0], monthly: monthlyRows })
    } catch (error) {
      console.error('[Students Stats] Error:', error)
      return NextResponse.json({ error: 'Stats query failed' }, { status: 500 })
    }
  }

  // If no query, test the connection
  if (!search) {
    try {
      const result = await testConnection()
      return NextResponse.json(result)
    } catch (error) {
      console.error('[Students Search] Connection test error:', error)
      return NextResponse.json(
        { success: false, error: 'Connection test failed', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      )
    }
  }

  if (search.length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 })
  }

  try {
    // Search local SQLite (saved students), external MySQL (driving school DB), and WhatsApp contacts in parallel
    const [localStudents, externalStudents, whatsappContacts] = await Promise.all([
      prisma.student.findMany({
        where: {
          OR: [
            { name: { contains: search } },
            { phone: { contains: search } },
            { licenceNumber: { contains: search } },
          ],
        },
        include: {
          certificates: {
            orderBy: { generatedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }).catch((err) => {
        console.error('Local student search error:', err)
        return []
      }),
      searchStudents(search).catch((err) => {
        console.error('External DB search error:', err)
        return []
      }),
      // Search WhatsApp contacts (synced from group attendance)
      prisma.contact.findMany({
        where: {
          OR: [
            { name: { contains: search } },
            { pushName: { contains: search } },
            { phone: { contains: search } },
          ],
        },
        include: {
          records: {
            include: {
              attendanceSheet: {
                include: {
                  group: { select: { name: true, id: true } },
                },
              },
            },
            orderBy: { date: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }).catch((err) => {
        console.error('WhatsApp contact search error:', err)
        return [] as Awaited<ReturnType<typeof prisma.contact.findMany<{
          include: { records: { include: { attendanceSheet: { include: { group: { select: { name: true; id: true } } } } } } }
        }>>>
      }),
    ])

    // Filter out WhatsApp contacts that already exist in localStudents (by phone match)
    const localPhones = new Set(localStudents.map(s => s.phone).filter(Boolean))
    const externalPhones = new Set(externalStudents.map((s: { phone_number?: string }) => s.phone_number).filter(Boolean))

    const filteredContacts = whatsappContacts.filter(c => {
      // Don't show if already in local Student table or external DB
      if (localPhones.has(c.phone)) return false
      if (externalPhones.has(c.phone)) return false
      return true
    }).map(c => ({
      id: c.id,
      phone: c.phone,
      name: c.name || c.pushName || null,
      pushName: c.pushName || null,
      groupName: c.records[0]?.attendanceSheet?.group?.name || null,
      groupId: c.records[0]?.attendanceSheet?.group?.id || null,
    }))

    // Return all three result sets
    return NextResponse.json({
      students: externalStudents,
      localStudents,
      whatsappContacts: filteredContacts,
    })
  } catch (error) {
    console.error('Student search error:', error)
    return NextResponse.json(
      { error: 'Failed to search students', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
