import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface MatchedRecord {
  whatsappName: string
  whatsappPhone: string
  zoomName: string
  duration: number
}

// GET /api/scheduling/student-theory?phone=15145551234&name=Ahmed
// Fetches theory module dates from saved Zoom attendance records
// Returns: [{ moduleNumber, date, groupName }]
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone')
  const name = searchParams.get('name')

  if (!phone && !name) {
    return NextResponse.json(
      { error: 'phone or name is required' },
      { status: 400 }
    )
  }

  try {
    // Fetch all zoom attendance records that have a module number
    const records = await prisma.zoomAttendance.findMany({
      where: {
        moduleNumber: { not: null },
      },
      orderBy: { meetingDate: 'asc' },
    })

    // Filter to records where this student was marked present (in matchedRecords)
    const phoneDigits = phone?.replace(/\D/g, '') || ''
    const phoneSuffix = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits
    const cleanName = (name || '').replace(/\s*#\d+$/, '').trim().toLowerCase()

    const theoryClasses: {
      moduleNumber: number
      date: string
      groupId: string
      meetingUUID: string
      zoomName: string
    }[] = []

    for (const record of records) {
      if (!record.moduleNumber) continue

      try {
        const matched: MatchedRecord[] = JSON.parse(record.matchedRecords)

        const studentMatch = matched.find(m => {
          // Match by phone
          if (phoneSuffix && phoneSuffix.length >= 7) {
            const mPhone = m.whatsappPhone.replace(/\D/g, '')
            if (mPhone.includes(phoneSuffix) || phoneSuffix.includes(mPhone.slice(-10))) {
              return true
            }
          }
          // Match by name
          if (cleanName && cleanName.length >= 2) {
            const mName = m.whatsappName.toLowerCase()
            if (mName.includes(cleanName) || cleanName.includes(mName)) {
              return true
            }
          }
          return false
        })

        if (studentMatch) {
          theoryClasses.push({
            moduleNumber: record.moduleNumber,
            date: record.meetingDate.toISOString(),
            groupId: record.groupId,
            meetingUUID: record.meetingUUID,
            zoomName: studentMatch.zoomName,
          })
        }
      } catch {
        // Skip records with malformed JSON
      }
    }

    // Deduplicate: if same module number appears multiple times, keep the most recent
    const byModule = new Map<number, typeof theoryClasses[0]>()
    for (const tc of theoryClasses) {
      const existing = byModule.get(tc.moduleNumber)
      if (!existing || new Date(tc.date) > new Date(existing.date)) {
        byModule.set(tc.moduleNumber, tc)
      }
    }

    const result = Array.from(byModule.values()).sort((a, b) => a.moduleNumber - b.moduleNumber)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to fetch student theory classes:', error)
    return NextResponse.json(
      { error: 'Failed to fetch theory classes' },
      { status: 500 }
    )
  }
}
