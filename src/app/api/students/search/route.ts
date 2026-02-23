import { NextRequest, NextResponse } from 'next/server'
import { searchStudents, testConnection } from '@/lib/external-db'

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')

  // If no query, test the connection
  if (!query) {
    const result = await testConnection()
    return NextResponse.json(result)
  }

  if (query.length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 })
  }

  try {
    const students = await searchStudents(query)
    return NextResponse.json({ students })
  } catch (error) {
    console.error('[Students Search] Error:', error)
    return NextResponse.json(
      { error: 'Failed to search students', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
