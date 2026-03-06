import { NextRequest, NextResponse } from 'next/server'
import { searchStudentsByPhones, type StudentRecord } from '@/lib/external-db'

// POST /api/students/batch-match
// Takes { phones: string[] }, returns matched MySQL students keyed by phone
export async function POST(request: NextRequest) {
  try {
    const { phones } = await request.json() as { phones: string[] }

    if (!phones || phones.length === 0) {
      return NextResponse.json({ matches: {} })
    }

    const students = await searchStudentsByPhones(phones)

    // Build a map: cleaned phone (last 10 digits) -> student record
    const matches: Record<string, StudentRecord> = {}

    for (const phone of phones) {
      const cleanPhone = phone.replace(/\D/g, '').slice(-10)
      if (cleanPhone.length < 7) continue

      // Find best match for this phone
      const match = students.find(s => {
        const dbPhone = (s.phone_number || '').replace(/\D/g, '')
        return dbPhone.includes(cleanPhone) || cleanPhone.includes(dbPhone.slice(-10))
      })

      if (match) {
        matches[phone] = match
      }
    }

    return NextResponse.json({ matches })
  } catch (error) {
    console.error('Batch match error:', error)
    return NextResponse.json(
      { error: 'Failed to match students', matches: {} },
      { status: 500 }
    )
  }
}
