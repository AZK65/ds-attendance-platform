import { NextRequest, NextResponse } from 'next/server'
import { searchStudents, testConnection } from '@/lib/external-db'

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')

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
