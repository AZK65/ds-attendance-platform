import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const BASE_URL = 'https://api.teamup.com'

interface ClassInfo {
  lastClass: { date: string; title: string } | null
  nextClass: { date: string; title: string } | null
  certificate: {
    generatedAt: string
    certificateType: string
    contractNumber: string | null
    attestationNumber: string | null
  } | null
}

interface MatchedRecord {
  whatsappName: string
  whatsappPhone: string
  zoomName: string
  duration: number
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''

    const { phones } = await request.json() as { phones: string[] }

    if (!phones || phones.length === 0) {
      return NextResponse.json({ results: {} })
    }

    const today = new Date()
    const nowTime = today.getTime()
    const formatDate = (d: Date) => d.toISOString().split('T')[0]

    // Fetch all Teamup events in a wide range (3 months back, 3 months forward)
    const startDate = new Date(today)
    startDate.setMonth(startDate.getMonth() - 3)
    const endDate = new Date(today)
    endDate.setMonth(endDate.getMonth() + 3)

    let allEvents: Array<{ id: string; title?: string; notes?: string; start_dt: string }> = []
    try {
      const url = `${BASE_URL}/${calendarKey}/events?startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}`
      const res = await fetch(url, { headers: { 'Teamup-Token': apiKey } })
      if (res.ok) {
        const data = await res.json()
        allEvents = data.events || []
      } else {
        console.warn('[batch-classes] Teamup API non-OK:', res.status)
      }
    } catch (err) {
      // Don't fail the whole endpoint just because Teamup is down — Zoom and
      // certificate info still come back from the local DB.
      console.warn('[batch-classes] Teamup fetch failed:', err)
    }

    // Pull Zoom theory class records for the same window so we can include
    // Zoom-only sessions in the Last Class column. Filter to ones with at
    // least matchedRecords data; meeting topic is decorative here.
    const sixMonthsAgo = new Date(today)
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const zoomRecords = await prisma.zoomAttendance.findMany({
      where: { meetingDate: { gte: sixMonthsAgo } },
      orderBy: { meetingDate: 'desc' },
      select: { meetingDate: true, moduleNumber: true, matchedRecords: true },
    })

    // Pre-parse the matched records once
    const parsedZoom = zoomRecords.map(rec => {
      let matched: MatchedRecord[] = []
      try { matched = JSON.parse(rec.matchedRecords) } catch {}
      const phoneDigitsByRecord = matched.map(m => (m.whatsappPhone || '').replace(/\D/g, ''))
      return {
        meetingDate: rec.meetingDate,
        moduleNumber: rec.moduleNumber,
        phoneDigits: phoneDigitsByRecord,
      }
    })

    // Pull local Student rows with at least one Certificate. Used both for
    // the new Certificate column and to surface "passed" status quickly.
    const studentsWithCerts = await prisma.student.findMany({
      where: { certificates: { some: {} } },
      select: {
        phone: true,
        certificates: {
          orderBy: { generatedAt: 'desc' },
          take: 1,
          select: {
            generatedAt: true,
            certificateType: true,
            contractNumber: true,
            attestationNumber: true,
          },
        },
      },
    })
    const certByPhoneSuffix = new Map<string, ClassInfo['certificate']>()
    for (const s of studentsWithCerts) {
      const digits = (s.phone || '').replace(/\D/g, '')
      const suffix = digits.length >= 10 ? digits.slice(-10) : digits
      if (suffix.length < 7) continue
      const cert = s.certificates[0]
      if (!cert) continue
      certByPhoneSuffix.set(suffix, {
        generatedAt: cert.generatedAt.toISOString(),
        certificateType: cert.certificateType,
        contractNumber: cert.contractNumber,
        attestationNumber: cert.attestationNumber,
      })
    }

    const results: Record<string, ClassInfo> = {}

    for (const phone of phones) {
      const cleanPhone = phone.replace(/\D/g, '')
      if (!cleanPhone) continue
      const phoneSuffix = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone

      // Teamup matches: events whose notes mention "Phone: <digits>"
      const matchingEvents = allEvents.filter((event) => {
        const notes = event.notes || ''
        const phoneMatch = notes.match(/Phone:\s*(\d+)/)
        if (phoneMatch) return phoneMatch[1] === cleanPhone
        return false
      })
      matchingEvents.sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime())

      let lastClass: ClassInfo['lastClass'] = null
      let nextClass: ClassInfo['nextClass'] = null
      for (const event of matchingEvents) {
        const eventTime = new Date(event.start_dt).getTime()
        if (eventTime <= nowTime) {
          lastClass = { date: event.start_dt, title: event.title || 'Class' }
        } else if (!nextClass) {
          nextClass = { date: event.start_dt, title: event.title || 'Class' }
        }
      }

      // Zoom matches: any record where matchedRecords contains a phone with
      // the same last-10-digit suffix.
      if (phoneSuffix.length >= 7) {
        for (const rec of parsedZoom) {
          const hit = rec.phoneDigits.some(d => {
            return d.includes(phoneSuffix) || phoneSuffix.includes(d.slice(-10))
          })
          if (!hit) continue
          const zoomTitle = rec.moduleNumber
            ? `Module ${rec.moduleNumber} (Zoom)`
            : 'Theory Class (Zoom)'
          const zoomTime = rec.meetingDate.getTime()
          if (zoomTime <= nowTime) {
            // Use zoom only if it's more recent than current lastClass
            const currentLastTime = lastClass ? new Date(lastClass.date).getTime() : 0
            if (!lastClass || zoomTime > currentLastTime) {
              lastClass = { date: rec.meetingDate.toISOString(), title: zoomTitle }
            }
          }
          // We only need the most-recent zoom record per phone; records are
          // sorted desc, so we can break after the first hit.
          break
        }
      }

      results[phone] = {
        lastClass,
        nextClass,
        certificate: phoneSuffix.length >= 7 ? (certByPhoneSuffix.get(phoneSuffix) || null) : null,
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Failed to fetch batch classes:', error)
    return NextResponse.json(
      { error: 'Failed to fetch batch classes' },
      { status: 500 }
    )
  }
}
