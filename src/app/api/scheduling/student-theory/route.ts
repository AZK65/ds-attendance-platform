import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface MatchedRecord {
  whatsappName: string
  whatsappPhone: string
  zoomName: string
  duration: number
}

interface AbsentRecord {
  name: string
  phone: string
}

// GET /api/scheduling/student-theory?phone=15145551234&name=Ahmed
// Fetches theory module dates from saved Zoom attendance records
// Returns: [{ moduleNumber, date, groupName }]
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

    // Also look up WhatsApp contact phones by name (the external DB may have a different phone)
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

    // Helper to check if a phone matches
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

    // Helper to check if a name matches
    const nameMatches = (testName: string): boolean => {
      if (cleanName && cleanName.length >= 2) {
        const mName = testName.toLowerCase()
        if (mName.includes(cleanName) || cleanName.includes(mName)) {
          return true
        }
      }
      return false
    }

    interface TheoryClass {
      moduleNumber: number
      date: string
      groupId: string
      meetingUUID: string
      zoomName: string
      status: 'present' | 'absent'
    }

    const theoryClasses: TheoryClass[] = []

    for (const record of records) {
      if (!record.moduleNumber) continue

      try {
        // Check if student was present (in matchedRecords)
        const matched: MatchedRecord[] = JSON.parse(record.matchedRecords)
        const studentMatch = matched.find(m =>
          phoneMatches(m.whatsappPhone) || nameMatches(m.whatsappName)
        )

        if (studentMatch) {
          theoryClasses.push({
            moduleNumber: record.moduleNumber,
            date: record.meetingDate.toISOString(),
            groupId: record.groupId,
            meetingUUID: record.meetingUUID,
            zoomName: studentMatch.zoomName,
            status: 'present',
          })
          continue
        }

        // Check if student was absent (in absentRecords)
        if (record.absentRecords) {
          const absent: AbsentRecord[] = JSON.parse(record.absentRecords)
          const absentMatch = absent.find(a =>
            phoneMatches(a.phone) || nameMatches(a.name)
          )
          if (absentMatch) {
            theoryClasses.push({
              moduleNumber: record.moduleNumber,
              date: record.meetingDate.toISOString(),
              groupId: record.groupId,
              meetingUUID: record.meetingUUID,
              zoomName: absentMatch.name,
              status: 'absent',
            })
          }
        }
      } catch {
        // Skip records with malformed JSON
      }
    }

    // Deduplicate: if same module number appears multiple times, keep the most recent
    // But keep both present and absent entries for different modules
    const byModule = new Map<number, TheoryClass>()
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
