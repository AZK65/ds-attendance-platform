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
    // Search both local SQLite (saved students) and external MySQL (driving school DB) in parallel
    const [localStudents, externalStudents] = await Promise.all([
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
    ])

    // Return both result sets — the frontend can distinguish by the data shape
    return NextResponse.json({
      students: externalStudents,
      localStudents,
    })
  } catch (error) {
    console.error('Student search error:', error)
    return NextResponse.json(
      { error: 'Failed to search students', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
