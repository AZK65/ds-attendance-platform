import { NextRequest, NextResponse } from 'next/server'
import { searchStudents, testConnection, countStudentsByDateRange, monthlyBreakdown } from '@/lib/external-db'

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')
  const stats = request.nextUrl.searchParams.get('stats')

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
  if (!query) {
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

  if (query.length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 })
  }

  try {
    console.log(`[Students Search] Searching for: ${query}`)
    const students = await searchStudents(query)
    console.log(`[Students Search] Found ${students.length} results`)
    return NextResponse.json({ students })
  } catch (error) {
    console.error('[Students Search] Error:', error instanceof Error ? error.stack : error)
    return NextResponse.json(
      { error: 'Failed to search students', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
