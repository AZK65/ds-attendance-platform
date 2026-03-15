/**
 * Backfill script: pulls past Zoom meetings from the last 3 months,
 * fetches participants for each, matches against WhatsApp group members,
 * and creates ZoomAttendance records.
 *
 * Run on server: npx tsx scripts/backfill-zoom-attendance.ts
 *
 * Requires: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET in .env
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── Zoom API helpers (inlined to avoid import issues with tsx) ──

interface ZoomTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface ZoomParticipant {
  id: string
  name: string
  user_email?: string
  join_time: string
  leave_time: string
  duration: number
}

interface ZoomPastMeeting {
  uuid: string
  id: number
  topic: string
  start_time: string
  end_time: string
  duration: number
  participants_count: number
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID
  const clientId = process.env.ZOOM_CLIENT_ID
  const clientSecret = process.env.ZOOM_CLIENT_SECRET

  if (!accountId || !clientId || !clientSecret) {
    throw new Error('Zoom credentials not configured. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET in .env')
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get Zoom token: ${response.status} - ${error}`)
  }

  const data: ZoomTokenResponse = await response.json()
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return data.access_token
}

async function getPastMeetingInstances(meetingId: string): Promise<ZoomPastMeeting[]> {
  const token = await getAccessToken()
  const response = await fetch(
    `https://api.zoom.us/v2/past_meetings/${meetingId}/instances`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!response.ok) {
    console.error(`Failed to get past meetings: ${response.status}`)
    return []
  }
  const data = await response.json()
  return data.meetings || []
}

async function getMeetingParticipants(meetingUUID: string): Promise<ZoomParticipant[]> {
  const token = await getAccessToken()
  const encodedUUID = encodeURIComponent(encodeURIComponent(meetingUUID))
  const allParticipants: ZoomParticipant[] = []
  let nextPageToken: string | undefined

  do {
    const url = new URL(`https://api.zoom.us/v2/report/meetings/${encodedUUID}/participants`)
    url.searchParams.set('page_size', '300')
    if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken)

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      console.error(`Failed to get participants for ${meetingUUID}: ${response.status}`)
      return []
    }

    const data = await response.json()
    allParticipants.push(...(data.participants || []))
    nextPageToken = data.next_page_token
  } while (nextPageToken)

  return allParticipants
}

// Also fetch meetings by date range (for non-recurring or if instances API fails)
async function getReportMeetings(userId: string, from: string, to: string): Promise<ZoomPastMeeting[]> {
  const token = await getAccessToken()
  const allMeetings: ZoomPastMeeting[] = []
  let nextPageToken: string | undefined

  do {
    const url = new URL(`https://api.zoom.us/v2/report/users/${userId}/meetings`)
    url.searchParams.set('from', from)
    url.searchParams.set('to', to)
    url.searchParams.set('page_size', '30')
    if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken)

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      console.error(`Failed to get report meetings: ${response.status}`)
      return allMeetings
    }

    const data = await response.json()
    allMeetings.push(...(data.meetings || []))
    nextPageToken = data.next_page_token
  } while (nextPageToken)

  return allMeetings
}

// ── Name matching (simplified from zoom/client.ts) ──

const NAME_VARIATIONS: Record<string, string> = {
  mohammed: 'muhammad', mohammad: 'muhammad', muhammed: 'muhammad',
  mohamed: 'muhammad', mohamad: 'muhammad',
  mike: 'michael', bob: 'robert', bill: 'william', jim: 'james',
  joe: 'joseph', tom: 'thomas', alex: 'alexander', sam: 'samuel',
  dave: 'david', dan: 'daniel', chris: 'christopher', matt: 'matthew',
  steve: 'steven', stephen: 'steven', nick: 'nicholas', ben: 'benjamin',
  tony: 'anthony', andy: 'andrew', jon: 'jonathan',
}

const DEVICE_WORDS = new Set([
  'iphone', 'ipad', 'android', 'samsung', 'pixel', 'galaxy',
  'phone', 'tablet', 'device', 'mobile', 'macbook', 'laptop',
])

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s*#\d+/g, '')
    .replace(/\s*[\(\[]?\d+[\)\]]?\s*$/, '')
    .replace(/['']s\b/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => !DEVICE_WORDS.has(w))
    .map(w => NAME_VARIATIONS[w] || w)
    .join(' ')
    .trim()
}

function editDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const matrix: number[][] = []
  for (let i = 0; i <= a.length; i++) matrix[i] = [i]
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }
  return matrix[a.length][b.length]
}

function partsMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true
  if (a.length >= 4 && b.length >= 4 && editDistance(a, b) <= 1) return true
  return false
}

function namesMatch(name1: string, name2: string): boolean {
  const n1 = normalizeName(name1)
  const n2 = normalizeName(name2)
  if (n1 === n2) return true

  const parts1 = n1.split(' ').filter(p => p.length > 1)
  const parts2 = n2.split(' ').filter(p => p.length > 1)
  if (parts1.length === 0 || parts2.length === 0) return false

  const sorted1 = [...parts1].sort().join(' ')
  const sorted2 = [...parts2].sort().join(' ')
  if (sorted1 === sorted2) return true

  if (parts1.length > 1 && parts2.length > 1) {
    let matchCount = 0
    const used = new Set<number>()
    for (const p1 of parts1) {
      for (let i = 0; i < parts2.length; i++) {
        if (used.has(i)) continue
        if (partsMatch(p1, parts2[i])) { matchCount++; used.add(i); break }
      }
    }
    const minParts = Math.min(parts1.length, parts2.length)
    const maxParts = Math.max(parts1.length, parts2.length)
    const required = minParts <= 2 ? minParts : Math.max(2, Math.ceil(maxParts * 0.6))
    return matchCount >= required
  }

  const singlePart = parts1.length === 1 ? parts1[0] : parts2[0]
  const multiParts = parts1.length === 1 ? parts2 : parts1
  return partsMatch(singlePart, multiParts[0])
}

// ── Match Zoom participants to WhatsApp members ──

function matchParticipants(
  zoomParticipants: ZoomParticipant[],
  members: Array<{ name: string; phone: string }>,
  learnedMatches: Array<{ zoomName: string; whatsappPhone: string }> = []
) {
  const matched: Array<{ whatsappName: string; whatsappPhone: string; zoomName: string; duration: number }> = []
  const absent: Array<{ name: string; phone: string }> = []
  const unmatchedZoom: Array<{ name: string; duration: number }> = []

  const matchedPhones = new Set<string>()
  const matchedZoomNames = new Set<string>()

  // Aggregate zoom participants (same person may join multiple times)
  const aggregated = new Map<string, ZoomParticipant>()
  for (const zp of zoomParticipants) {
    const norm = normalizeName(zp.name)
    const existing = aggregated.get(norm)
    if (existing) {
      aggregated.set(norm, { ...existing, duration: existing.duration + zp.duration })
    } else {
      aggregated.set(norm, { ...zp })
    }
  }

  // Phase 1: Learned matches
  const learnedByZoom = new Map<string, string>()
  for (const lm of learnedMatches) {
    learnedByZoom.set(lm.zoomName.toLowerCase(), lm.whatsappPhone)
    learnedByZoom.set(normalizeName(lm.zoomName), lm.whatsappPhone)
  }
  const memberByPhone = new Map(members.map(m => [m.phone, m]))

  for (const [norm, zp] of aggregated) {
    const learnedPhone = learnedByZoom.get(zp.name.toLowerCase()) || learnedByZoom.get(norm)
    if (!learnedPhone) continue
    const member = memberByPhone.get(learnedPhone)
    if (!member || matchedPhones.has(learnedPhone) || matchedZoomNames.has(norm)) continue
    matched.push({ whatsappName: member.name, whatsappPhone: member.phone, zoomName: zp.name, duration: zp.duration })
    matchedPhones.add(member.phone)
    matchedZoomNames.add(norm)
  }

  // Phase 2: Fuzzy match
  for (const member of members) {
    if (matchedPhones.has(member.phone)) continue
    if (!member.name) { absent.push({ name: member.phone, phone: member.phone }); continue }

    let found = false
    for (const [norm, zp] of aggregated) {
      if (matchedZoomNames.has(norm)) continue
      if (namesMatch(member.name, zp.name)) {
        matched.push({ whatsappName: member.name, whatsappPhone: member.phone, zoomName: zp.name, duration: zp.duration })
        matchedPhones.add(member.phone)
        matchedZoomNames.add(norm)
        found = true
        break
      }
    }
    if (!found) absent.push({ name: member.name, phone: member.phone })
  }

  // Unmatched Zoom
  for (const [norm, zp] of aggregated) {
    if (!matchedZoomNames.has(norm)) {
      unmatchedZoom.push({ name: zp.name, duration: zp.duration })
    }
  }

  return { matched, absent, unmatchedZoom }
}

// ── Main backfill logic ──

const ZOOM_MEETING_ID = '4171672829' // Default recurring meeting ID

async function main() {
  console.log('\n🔄 ZOOM ATTENDANCE BACKFILL')
  console.log('═'.repeat(60))

  // 1. Get all WhatsApp groups with a moduleNumber (theory groups)
  const groups = await prisma.group.findMany({
    where: { moduleNumber: { not: null } },
    include: {
      members: {
        include: { contact: true },
      },
    },
    orderBy: { moduleNumber: 'asc' },
  })

  console.log(`\n📋 Found ${groups.length} theory groups:`)
  for (const g of groups) {
    console.log(`   M${g.moduleNumber} - ${g.name} (${g.members.length} members)`)
  }

  if (groups.length === 0) {
    console.log('\n❌ No theory groups found. Make sure groups have moduleNumber set.')
    return
  }

  // 2. Get learned matches
  const learnedMatches = await prisma.zoomNameMatch.findMany()
  console.log(`\n🧠 Loaded ${learnedMatches.length} learned name matches`)

  // 3. Fetch past meetings from Zoom
  console.log(`\n🔍 Fetching past meeting instances for meeting ID: ${ZOOM_MEETING_ID}...`)

  let meetings: ZoomPastMeeting[] = []

  // Try past_meetings instances first
  meetings = await getPastMeetingInstances(ZOOM_MEETING_ID)
  console.log(`   Found ${meetings.length} instances from past_meetings API`)

  // If that returned nothing, try the report API with date ranges
  if (meetings.length === 0) {
    console.log('   Trying report API with date ranges...')
    const now = new Date()
    // Zoom report API only allows 30-day windows, so we need to make multiple calls
    for (let i = 0; i < 3; i++) {
      const to = new Date(now.getTime() - i * 30 * 24 * 60 * 60 * 1000)
      const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)
      const fromStr = from.toISOString().split('T')[0]
      const toStr = to.toISOString().split('T')[0]
      console.log(`   Fetching ${fromStr} to ${toStr}...`)

      const monthMeetings = await getReportMeetings('me', fromStr, toStr)
      // Filter to our meeting ID
      const relevant = monthMeetings.filter(m => String(m.id) === ZOOM_MEETING_ID)
      console.log(`   Found ${relevant.length} relevant meetings (of ${monthMeetings.length} total)`)
      meetings.push(...relevant)
    }
  }

  // Filter to last 3 months
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  meetings = meetings.filter(m => new Date(m.start_time) >= threeMonthsAgo)
  meetings.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  console.log(`\n📅 ${meetings.length} meetings in the last 3 months:`)
  for (const m of meetings) {
    const date = new Date(m.start_time).toLocaleDateString('en-CA')
    console.log(`   ${date} - ${m.topic || 'Untitled'} (${m.participants_count || '?'} participants) UUID: ${m.uuid}`)
  }

  if (meetings.length === 0) {
    console.log('\n❌ No meetings found in the last 3 months.')
    return
  }

  // 4. For each meeting, fetch participants and match against EACH group
  let totalCreated = 0
  let totalSkipped = 0

  for (const meeting of meetings) {
    const meetingDate = new Date(meeting.start_time)
    const dateStr = meetingDate.toLocaleDateString('en-CA')
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`📅 Processing: ${dateStr} - ${meeting.topic || 'Untitled'}`)

    // Check which groups already have this meeting saved
    const existingRecords = await prisma.zoomAttendance.findMany({
      where: { meetingUUID: meeting.uuid },
    })
    const existingGroupIds = new Set(existingRecords.map(r => r.groupId))

    // Fetch participants
    console.log(`   Fetching participants...`)
    const participants = await getMeetingParticipants(meeting.uuid)
    if (participants.length === 0) {
      console.log(`   ⚠️  No participants data — skipping`)
      continue
    }
    console.log(`   Got ${participants.length} participants`)

    // Match against each theory group
    for (const group of groups) {
      if (existingGroupIds.has(group.id)) {
        console.log(`   ⏭️  M${group.moduleNumber} (${group.name.slice(0, 30)}...): already saved`)
        totalSkipped++
        continue
      }

      const members = group.members.map(gm => ({
        name: gm.contact.name || gm.contact.pushName || gm.phone,
        phone: gm.phone,
      }))

      const result = matchParticipants(
        participants,
        members,
        learnedMatches.map(lm => ({ zoomName: lm.zoomName, whatsappPhone: lm.whatsappPhone }))
      )

      // Only save if there are actual matches (otherwise this meeting wasn't for this group)
      if (result.matched.length === 0) {
        console.log(`   ⏭️  M${group.moduleNumber} (${group.name.slice(0, 30)}...): 0 matches — skipping`)
        continue
      }

      // Save the attendance record
      await prisma.zoomAttendance.create({
        data: {
          groupId: group.id,
          meetingUUID: meeting.uuid,
          meetingDate,
          moduleNumber: group.moduleNumber,
          matchedRecords: JSON.stringify(result.matched),
          absentRecords: JSON.stringify(result.absent),
          unmatchedZoom: JSON.stringify(result.unmatchedZoom),
        },
      })

      console.log(`   ✅ M${group.moduleNumber} (${group.name.slice(0, 30)}...): ${result.matched.length} present, ${result.absent.length} absent`)
      totalCreated++
    }

    // Rate limit: Zoom API has limits
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`📊 BACKFILL COMPLETE`)
  console.log(`   Records created: ${totalCreated}`)
  console.log(`   Records skipped (already existed): ${totalSkipped}`)
  console.log(`   Meetings processed: ${meetings.length}`)

  // Now run the summary
  const allRecords = await prisma.zoomAttendance.findMany({ orderBy: { meetingDate: 'desc' } })
  console.log(`\n   Total ZoomAttendance records now: ${allRecords.length}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
