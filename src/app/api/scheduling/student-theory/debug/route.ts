import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface MatchedRecord { whatsappName: string; whatsappPhone: string; zoomName: string; duration: number }
interface AbsentRecord { name: string; phone: string }
interface UnmatchedZoom { name: string; duration: number }

// GET /api/scheduling/student-theory/debug?phone=14388331055
// Returns a per-meeting breakdown of where this student appears
// (matched, absent, unmatched, or absent-from-record).
// Useful when the user expects N theory classes but only sees fewer.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone') || ''
  const name = searchParams.get('name') || ''

  if (!phone && !name) {
    return NextResponse.json({ error: 'phone or name is required' }, { status: 400 })
  }

  const phoneDigits = phone.replace(/\D/g, '')
  const phoneSuffix = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits
  const cleanName = name.replace(/\s*#\d+\s*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

  const phoneMatches = (testPhone: string): boolean => {
    const mPhone = (testPhone || '').replace(/\D/g, '')
    if (phoneSuffix && phoneSuffix.length >= 7) {
      if (mPhone.includes(phoneSuffix) || phoneSuffix.includes(mPhone.slice(-10))) return true
    }
    return false
  }
  const nameMatches = (testName: string): boolean => {
    if (!cleanName || cleanName.length < 2) return false
    const mName = (testName || '').toLowerCase()
    return mName.includes(cleanName) || cleanName.includes(mName)
  }

  const records = await prisma.zoomAttendance.findMany({ orderBy: { meetingDate: 'desc' } })

  const breakdown = records.map(rec => {
    let matched: MatchedRecord[] = []
    let absent: AbsentRecord[] = []
    let unmatched: UnmatchedZoom[] = []
    try { matched = JSON.parse(rec.matchedRecords) } catch {}
    try { absent = JSON.parse(rec.absentRecords) } catch {}
    try { unmatched = JSON.parse(rec.unmatchedZoom) } catch {}

    const matchedHit = matched.find(m => phoneMatches(m.whatsappPhone) || nameMatches(m.whatsappName))
    const absentHit = absent.find(a => phoneMatches(a.phone) || nameMatches(a.name))
    const unmatchedHit = unmatched.find(u => nameMatches(u.name))

    let location: 'matched' | 'absent' | 'unmatched' | 'not-in-record' = 'not-in-record'
    if (matchedHit) location = 'matched'
    else if (absentHit) location = 'absent'
    else if (unmatchedHit) location = 'unmatched'

    return {
      meetingDate: rec.meetingDate.toISOString(),
      groupId: rec.groupId,
      meetingUUID: rec.meetingUUID,
      moduleNumber: rec.moduleNumber,
      location,
      // Sample of names so the user can spot why matching missed
      matchedSample: matched.slice(0, 3).map(m => ({ name: m.whatsappName, phone: m.whatsappPhone })),
      unmatchedNames: unmatched.map(u => u.name),
      hit: matchedHit || absentHit || unmatchedHit || null,
    }
  })

  const summary = {
    queryPhone: phone,
    queryPhoneSuffix: phoneSuffix,
    queryName: name,
    totalRecords: records.length,
    inMatched: breakdown.filter(b => b.location === 'matched').length,
    inAbsent: breakdown.filter(b => b.location === 'absent').length,
    inUnmatched: breakdown.filter(b => b.location === 'unmatched').length,
    notInAny: breakdown.filter(b => b.location === 'not-in-record').length,
  }

  return NextResponse.json({ summary, breakdown })
}
