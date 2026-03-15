import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface MatchedRecord {
  whatsappName: string
  whatsappPhone: string
  zoomName: string
  duration: number
}

// GET /api/scheduling/student-zoom-classes?phone=15145551234&name=Ahmed
// Returns ALL Zoom meetings a student attended (both theory and road/other)
// Records WITHOUT moduleNumber are treated as road/other classes
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone')
  const name = searchParams.get('studentName') || searchParams.get('name')

  if (!phone && !name) {
    return NextResponse.json(
      { error: 'phone or name is required' },
      { status: 400 }
    )
  }

  try {
    // Fetch ALL zoom attendance records (including ones without moduleNumber)
    const records = await prisma.zoomAttendance.findMany({
      where: {
        moduleNumber: null, // Only non-theory (road/other) classes
      },
      orderBy: { meetingDate: 'asc' },
    })

    const phoneDigits = phone?.replace(/\D/g, '') || ''
    const phoneSuffix = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits
    const cleanName = (name || '').replace(/\s*#\d+$/, '').trim().toLowerCase()

    // Look up extra phone suffixes by name
    const extraPhoneSuffixes: string[] = []
    if (cleanName && cleanName.length >= 2) {
      const contacts = await prisma.contact.findMany({
        where: {
          OR: [
            { name: { contains: cleanName } },
            { pushName: { contains: cleanName } },
          ],
        },
        select: { phone: true },
        take: 5,
      })
      for (const c of contacts) {
        const digits = c.phone.replace(/\D/g, '')
        const suffix = digits.length > 10 ? digits.slice(-10) : digits
        if (suffix.length >= 7 && suffix !== phoneSuffix) {
          extraPhoneSuffixes.push(suffix)
        }
      }
    }

    const phoneMatches = (testPhone: string): boolean => {
      const mPhone = testPhone.replace(/\D/g, '')
      if (phoneSuffix && phoneSuffix.length >= 7) {
        if (mPhone.includes(phoneSuffix) || phoneSuffix.includes(mPhone.slice(-10))) {
          return true
        }
      }
      for (const extra of extraPhoneSuffixes) {
        if (mPhone.includes(extra) || extra.includes(mPhone.slice(-10))) {
          return true
        }
      }
      return false
    }

    const nameMatches = (testName: string): boolean => {
      if (cleanName && cleanName.length >= 2) {
        const mName = testName.toLowerCase()
        if (mName.includes(cleanName) || cleanName.includes(mName)) {
          return true
        }
      }
      return false
    }

    interface ZoomClass {
      date: string
      meetingUUID: string
      zoomName: string
      duration: number
      status: 'present'
    }

    const zoomClasses: ZoomClass[] = []

    for (const record of records) {
      try {
        const matched: MatchedRecord[] = JSON.parse(record.matchedRecords)
        const studentMatch = matched.find(m =>
          phoneMatches(m.whatsappPhone) || nameMatches(m.whatsappName)
        )

        if (studentMatch) {
          zoomClasses.push({
            date: record.meetingDate.toISOString(),
            meetingUUID: record.meetingUUID,
            zoomName: studentMatch.zoomName,
            duration: studentMatch.duration,
            status: 'present',
          })
        }
      } catch {
        // Skip malformed records
      }
    }

    // Deduplicate by meetingUUID (keep most recent)
    const byUUID = new Map<string, ZoomClass>()
    for (const zc of zoomClasses) {
      const existing = byUUID.get(zc.meetingUUID)
      if (!existing || new Date(zc.date) > new Date(existing.date)) {
        byUUID.set(zc.meetingUUID, zc)
      }
    }

    const result = Array.from(byUUID.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to fetch student zoom classes:', error)
    return NextResponse.json(
      { error: 'Failed to fetch zoom classes' },
      { status: 500 }
    )
  }
}
