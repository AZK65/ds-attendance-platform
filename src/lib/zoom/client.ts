// Zoom API Client using Server-to-Server OAuth

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
  attentiveness_score?: string
}

interface ZoomParticipantsResponse {
  page_count: number
  page_size: number
  total_records: number
  next_page_token?: string
  participants: ZoomParticipant[]
}

interface ZoomPastMeeting {
  uuid: string
  id: number
  host_id: string
  topic: string
  start_time: string
  end_time: string
  duration: number
  total_minutes: number
  participants_count: number
}

interface ZoomPastMeetingsResponse {
  page_count: number
  page_size: number
  total_records: number
  next_page_token?: string
  meetings: ZoomPastMeeting[]
}

// Cache for access token
let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID
  const clientId = process.env.ZOOM_CLIENT_ID
  const clientSecret = process.env.ZOOM_CLIENT_SECRET

  if (!accountId || !clientId || !clientSecret) {
    throw new Error('Zoom credentials not configured')
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error('Zoom token error:', error)
    throw new Error(`Failed to get Zoom access token: ${response.status}`)
  }

  const data: ZoomTokenResponse = await response.json()

  // Cache the token (expires_in is in seconds, subtract 60 seconds for safety)
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000
  }

  return data.access_token
}

export async function getMeetingDetails(meetingId: string): Promise<{
  id: number
  topic: string
  status: string // "waiting" | "started" | "finished"
  start_time?: string
  duration?: number
  timezone?: string
}> {
  const token = await getAccessToken()

  const response = await fetch(
    `https://api.zoom.us/v2/meetings/${meetingId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error('Zoom meeting details error:', error)
    throw new Error(`Failed to get meeting details: ${response.status}`)
  }

  return response.json()
}

export async function getZoomMeetingParticipants(meetingId: string): Promise<ZoomParticipant[]> {
  const token = await getAccessToken()

  // First, try to get past meeting instances
  // The meeting ID from the URL is the recurring meeting ID
  // We need to get the most recent instance

  const allParticipants: ZoomParticipant[] = []
  let nextPageToken: string | undefined

  do {
    const url = new URL(`https://api.zoom.us/v2/report/meetings/${meetingId}/participants`)
    url.searchParams.set('page_size', '300')
    if (nextPageToken) {
      url.searchParams.set('next_page_token', nextPageToken)
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Zoom participants error:', error)

      // If meeting not found, try with double-encoded UUID
      if (response.status === 404) {
        throw new Error('Meeting not found or no participants data available yet. Make sure the meeting has ended.')
      }

      throw new Error(`Failed to get Zoom participants: ${response.status}`)
    }

    const data: ZoomParticipantsResponse = await response.json()
    allParticipants.push(...data.participants)
    nextPageToken = data.next_page_token
  } while (nextPageToken)

  return allParticipants
}

export async function getPastMeetingInstances(meetingId: string): Promise<ZoomPastMeeting[]> {
  const token = await getAccessToken()

  const response = await fetch(
    `https://api.zoom.us/v2/past_meetings/${meetingId}/instances`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error('Zoom past meetings error:', error)
    throw new Error(`Failed to get past meeting instances: ${response.status}`)
  }

  const data = await response.json()
  return data.meetings || []
}

export async function getMeetingParticipantsByUUID(meetingUUID: string): Promise<ZoomParticipant[]> {
  const token = await getAccessToken()

  // Always double-encode the UUID as it may contain /, =, + characters
  // Zoom requires double-encoding for UUIDs with special characters
  const encodedUUID = encodeURIComponent(encodeURIComponent(meetingUUID))

  const allParticipants: ZoomParticipant[] = []
  let nextPageToken: string | undefined

  do {
    const url = new URL(`https://api.zoom.us/v2/report/meetings/${encodedUUID}/participants`)
    url.searchParams.set('page_size', '300')
    if (nextPageToken) {
      url.searchParams.set('next_page_token', nextPageToken)
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Zoom participants error:', error)
      throw new Error(`Failed to get Zoom participants: ${response.status}`)
    }

    const data: ZoomParticipantsResponse = await response.json()
    allParticipants.push(...data.participants)
    nextPageToken = data.next_page_token
  } while (nextPageToken)

  return allParticipants
}

// Get recent meetings for a user (to find meeting instances)
export async function getRecentMeetings(userId: string = 'me'): Promise<ZoomPastMeeting[]> {
  const token = await getAccessToken()

  // Get meetings from the last 30 days
  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - 30)

  const response = await fetch(
    `https://api.zoom.us/v2/report/users/${userId}/meetings?from=${fromDate.toISOString().split('T')[0]}&to=${new Date().toISOString().split('T')[0]}&page_size=30`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error('Zoom recent meetings error:', error)
    throw new Error(`Failed to get recent meetings: ${response.status}`)
  }

  const data: ZoomPastMeetingsResponse = await response.json()
  return data.meetings || []
}

export interface ZoomAttendanceResult {
  zoomParticipants: ZoomParticipant[]
  matched: Array<{
    whatsappName: string
    whatsappPhone: string
    zoomName: string
    duration: number
    joinTime: string
    leaveTime: string
  }>
  absent: Array<{
    name: string
    phone: string
  }>
  unmatchedZoom: Array<{
    name: string
    duration: number
  }>
}

// Common name variations mapping (all lowercase)
const NAME_VARIATIONS: Record<string, string> = {
  // Muhammad variations
  'mohammed': 'muhammad',
  'mohammad': 'muhammad',
  'muhammed': 'muhammad',
  'mohamed': 'muhammad',
  'mohamad': 'muhammad',
  // Other common variations
  'mike': 'michael',
  'mick': 'michael',
  'bob': 'robert',
  'rob': 'robert',
  'bill': 'william',
  'will': 'william',
  'jim': 'james',
  'jimmy': 'james',
  'joe': 'joseph',
  'joey': 'joseph',
  'tom': 'thomas',
  'tommy': 'thomas',
  'nick': 'nicholas',
  'alex': 'alexander',
  'sam': 'samuel',
  'sammy': 'samuel',
  'dave': 'david',
  'dan': 'daniel',
  'danny': 'daniel',
  'chris': 'christopher',
  'matt': 'matthew',
  'steve': 'steven',
  'stephen': 'steven',
  'jon': 'jonathan',
  'tony': 'anthony',
  'andy': 'andrew',
  'drew': 'andrew',
  'ben': 'benjamin',
  'benny': 'benjamin',
  'ed': 'edward',
  'eddie': 'edward',
  'ted': 'theodore',
  'rick': 'richard',
  'dick': 'richard',
  'rich': 'richard',
  'harry': 'henry',
  'hank': 'henry',
  'jack': 'john',
  'johnny': 'john',
  'jen': 'jennifer',
  'jenny': 'jennifer',
  'kate': 'katherine',
  'katie': 'katherine',
  'kathy': 'katherine',
  'liz': 'elizabeth',
  'beth': 'elizabeth',
  'betty': 'elizabeth',
  'meg': 'margaret',
  'maggie': 'margaret',
  'peggy': 'margaret',
  'sue': 'susan',
  'suzy': 'susan',
  'susie': 'susan',
  'pam': 'pamela',
  'pat': 'patricia',
  'patty': 'patricia',
  'trish': 'patricia',
  'deb': 'deborah',
  'debbie': 'deborah',
  'becky': 'rebecca',
  'becca': 'rebecca',
  'mandy': 'amanda',
  'cindy': 'cynthia',
  'vicky': 'victoria',
  'tori': 'victoria',
}

// Normalize a single name part (handles variations)
function normalizeNamePart(part: string): string {
  return NAME_VARIATIONS[part] || part
}

// Device/generic words to strip from names during normalization
const DEVICE_WORDS = new Set([
  'iphone', 'ipad', 'android', 'samsung', 'pixel', 'galaxy',
  'phone', 'tablet', 'device', 'mobile', 'macbook', 'laptop'
])

// Normalize name for matching
function normalizeName(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')      // Remove (iPhone), (Android), etc. in parentheses
    .replace(/\s*\[[^\]]*\]/g, '')     // Remove [anything] in brackets
    .replace(/\s*#\d+/g, '')           // Remove #123 patterns
    .replace(/\s*[\(\[]?\d+[\)\]]?\s*$/, '')  // Remove trailing numbers
    .replace(/['']s\b/g, '')            // Remove possessive 's before stripping non-letters
    .replace(/[^a-z\s]/g, '')          // Remove non-letters (apostrophes, etc.)
    .replace(/\s+/g, ' ')              // Normalize spaces
    .trim()
    .split(' ')
    .filter(word => !DEVICE_WORDS.has(word))  // Remove device words like "iphone", "android"
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Apply name variations to each part
  return normalized
    .split(' ')
    .map(part => normalizeNamePart(part))
    .join(' ')
}

// Calculate similarity between two strings (Levenshtein distance based)
function stringSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1
  if (s1.length === 0 || s2.length === 0) return 0

  const longer = s1.length > s2.length ? s1 : s2
  const shorter = s1.length > s2.length ? s2 : s1

  // If one contains the other, high similarity
  if (longer.includes(shorter)) {
    return shorter.length / longer.length
  }

  // Simple character overlap similarity
  const chars1 = new Set(s1.split(''))
  const chars2 = new Set(s2.split(''))
  const intersection = [...chars1].filter(c => chars2.has(c)).length
  const union = new Set([...chars1, ...chars2]).size
  return intersection / union
}

// Check if two names match (fuzzy matching)
function namesMatch(name1: string, name2: string, debug = false): boolean {
  const n1 = normalizeName(name1)
  const n2 = normalizeName(name2)

  if (debug) {
    console.log(`[namesMatch] Comparing "${name1}" (norm: "${n1}") vs "${name2}" (norm: "${n2}")`)
  }

  // Exact match
  if (n1 === n2) {
    if (debug) console.log(`  -> MATCH: exact`)
    return true
  }

  // One contains the other
  if (n1.includes(n2) || n2.includes(n1)) {
    if (debug) console.log(`  -> MATCH: contains`)
    return true
  }

  // Split into parts and check overlap
  const parts1 = n1.split(' ').filter(p => p.length > 1)
  const parts2 = n2.split(' ').filter(p => p.length > 1)

  if (debug) {
    console.log(`  parts1: [${parts1.join(', ')}], parts2: [${parts2.join(', ')}]`)
  }

  // If either has no valid parts, can't match
  if (parts1.length === 0 || parts2.length === 0) {
    if (debug) console.log(`  -> NO MATCH: no valid parts`)
    return false
  }

  // Check if sorted parts are identical (handles reversed names like "Rahman Mohima" vs "Mohima Rahman")
  const sorted1 = [...parts1].sort().join(' ')
  const sorted2 = [...parts2].sort().join(' ')
  if (sorted1 === sorted2) {
    if (debug) console.log(`  -> MATCH: same parts in different order`)
    return true
  }

  // If BOTH names have 2+ parts (first and last name), be strict about matching
  // We need FIRST NAMES to match (or be reversed), not just any random parts
  if (parts1.length >= 2 && parts2.length >= 2) {
    const first1 = parts1[0]
    const last1 = parts1[parts1.length - 1]
    const first2 = parts2[0]
    const last2 = parts2[parts2.length - 1]

    // Helper to check if two name parts match (exact or prefix for longer names)
    const partsMatch = (a: string, b: string): boolean => {
      if (a === b) return true
      if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true
      return false
    }

    // Case 1: First names match AND (last names match OR one contains the other)
    if (partsMatch(first1, first2)) {
      // First names match - now check if last names are compatible
      if (partsMatch(last1, last2)) {
        if (debug) console.log(`  -> MATCH: first + last name match`)
        return true
      }
      // For 3-part names, check if any middle/last parts match
      if (parts1.length > 2 || parts2.length > 2) {
        // Check if last1 appears anywhere in parts2, or last2 appears anywhere in parts1
        const last1InParts2 = parts2.some(p => partsMatch(p, last1))
        const last2InParts1 = parts1.some(p => partsMatch(p, last2))
        if (last1InParts2 || last2InParts1) {
          if (debug) console.log(`  -> MATCH: first name + partial last name`)
          return true
        }
      }
      if (debug) console.log(`  -> NO MATCH: first names match but last names differ (${last1} vs ${last2})`)
      return false
    }

    // Case 2: Names are FULLY reversed (first1=last2 AND last1=first2)
    // This handles "Musa Gaku" matching "Gaku Musa"
    if (partsMatch(first1, last2) && partsMatch(last1, first2)) {
      if (debug) console.log(`  -> MATCH: names fully reversed`)
      return true
    }

    // Case 3: For 3+ part names, check if first name matches any part AND last name matches any part
    if (parts1.length >= 3 || parts2.length >= 3) {
      const first1MatchesAny = parts2.some(p => partsMatch(first1, p))
      const last1MatchesAny = parts2.some(p => partsMatch(last1, p))
      if (first1MatchesAny && last1MatchesAny) {
        if (debug) console.log(`  -> MATCH: first and last found in other name parts`)
        return true
      }
    }

    if (debug) console.log(`  -> NO MATCH: first names don't match (${first1} vs ${first2})`)
    return false
  }

  // If one name has only 1 part (e.g., "Sapna"), be more lenient
  if (parts1.length === 1 || parts2.length === 1) {
    const singlePart = parts1.length === 1 ? parts1[0] : parts2[0]
    const multiParts = parts1.length === 1 ? parts2 : parts1

    // Check if single part matches any part of the multi-part name
    for (const p of multiParts) {
      if (singlePart === p || (singlePart.length >= 3 && p.length >= 3 &&
          (singlePart.startsWith(p) || p.startsWith(singlePart)))) {
        if (debug) console.log(`  -> MATCH: single name "${singlePart}" matches part "${p}"`)
        return true
      }
    }
  }

  if (debug) console.log(`  -> NO MATCH`)
  return false
}

export interface LearnedMatch {
  zoomName: string
  whatsappPhone: string
  whatsappName: string
}

export function matchZoomToWhatsApp(
  zoomParticipants: ZoomParticipant[],
  whatsappMembers: Array<{ name: string | null; pushName: string | null; phone: string }>,
  learnedMatches: LearnedMatch[] = []
): ZoomAttendanceResult {
  const matched: ZoomAttendanceResult['matched'] = []
  const absent: ZoomAttendanceResult['absent'] = []
  const unmatchedZoom: ZoomAttendanceResult['unmatchedZoom'] = []

  const matchedWhatsAppPhones = new Set<string>()
  const matchedZoomNames = new Set<string>()  // Track by normalized name, not ID

  // Aggregate Zoom participants (same person might join multiple times)
  const aggregatedZoom = new Map<string, ZoomParticipant>()
  for (const zp of zoomParticipants) {
    const normalized = normalizeName(zp.name)
    const existing = aggregatedZoom.get(normalized)
    if (existing) {
      // Sum up duration, keep earliest join and latest leave
      aggregatedZoom.set(normalized, {
        ...existing,
        duration: existing.duration + zp.duration,
        join_time: new Date(zp.join_time) < new Date(existing.join_time) ? zp.join_time : existing.join_time,
        leave_time: new Date(zp.leave_time) > new Date(existing.leave_time) ? zp.leave_time : existing.leave_time
      })
    } else {
      aggregatedZoom.set(normalized, { ...zp })
    }
  }

  // Build a list of all Zoom names for debugging
  const zoomNames = [...aggregatedZoom.values()].map(zp => zp.name)
  console.log('[Zoom Match] Zoom participants:', zoomNames)
  console.log('[Zoom Match] Learned matches available:', learnedMatches.length)

  // Build lookup from learned matches: zoomName (lowercase) -> whatsappPhone
  // Store both the raw lowercase name and the normalized name for matching
  const learnedByZoomName = new Map<string, string>()
  for (const lm of learnedMatches) {
    learnedByZoomName.set(lm.zoomName.toLowerCase(), lm.whatsappPhone)
    // Also store by normalized name so "Ahmed (iPhone)" matches learned "Ahmed"
    const normalizedLearned = normalizeName(lm.zoomName)
    if (normalizedLearned && !learnedByZoomName.has(normalizedLearned)) {
      learnedByZoomName.set(normalizedLearned, lm.whatsappPhone)
    }
  }

  // Build lookup from whatsappPhone -> member info
  const memberByPhone = new Map<string, { name: string; phone: string }>()
  for (const wa of whatsappMembers) {
    memberByPhone.set(wa.phone, {
      name: wa.name || wa.pushName || wa.phone,
      phone: wa.phone
    })
  }

  // Phase 1: Apply learned matches first
  for (const [normalizedZoom, zp] of aggregatedZoom) {
    // Try raw name first, then normalized name (handles "Ahmed (iPhone)" matching learned "Ahmed")
    const learnedPhone = learnedByZoomName.get(zp.name.toLowerCase()) || learnedByZoomName.get(normalizedZoom)
    if (!learnedPhone) continue

    const member = memberByPhone.get(learnedPhone)
    if (!member) continue
    if (matchedWhatsAppPhones.has(learnedPhone)) continue
    if (matchedZoomNames.has(normalizedZoom)) continue

    matched.push({
      whatsappName: member.name,
      whatsappPhone: member.phone,
      zoomName: zp.name,
      duration: zp.duration,
      joinTime: zp.join_time,
      leaveTime: zp.leave_time
    })
    matchedWhatsAppPhones.add(member.phone)
    matchedZoomNames.add(normalizedZoom)
    console.log(`[Zoom Match] ✓ LEARNED MATCH: "${zp.name}" -> "${member.name}" (+${member.phone})`)
  }

  // Phase 2: Fuzzy match remaining members
  for (const wa of whatsappMembers) {
    if (matchedWhatsAppPhones.has(wa.phone)) continue

    const waName = wa.name || wa.pushName || ''
    if (!waName) {
      absent.push({ name: wa.phone, phone: wa.phone })
      continue
    }

    let foundMatch = false
    let bestMatch: { zp: ZoomParticipant; normalized: string } | null = null

    console.log(`\n[Zoom Match] Trying to match WhatsApp: "${waName}"`)

    for (const [normalizedZoom, zp] of aggregatedZoom) {
      if (matchedZoomNames.has(normalizedZoom)) {
        continue
      }

      const isMatch = namesMatch(waName, zp.name, true)
      if (isMatch) {
        bestMatch = { zp, normalized: normalizedZoom }
        break
      }
    }

    if (bestMatch) {
      const { zp } = bestMatch
      matched.push({
        whatsappName: waName,
        whatsappPhone: wa.phone,
        zoomName: zp.name,
        duration: zp.duration,
        joinTime: zp.join_time,
        leaveTime: zp.leave_time
      })
      matchedWhatsAppPhones.add(wa.phone)
      matchedZoomNames.add(bestMatch.normalized)
      foundMatch = true
      console.log(`[Zoom Match] ✓ MATCHED: "${waName}" -> "${zp.name}"`)
    }

    if (!foundMatch) {
      console.log(`[Zoom Match] ✗ NO MATCH for: "${waName}"`)
      absent.push({ name: waName, phone: wa.phone })
    }
  }

  // Find unmatched Zoom participants
  for (const [normalizedZoom, zp] of aggregatedZoom) {
    if (!matchedZoomNames.has(normalizedZoom)) {
      unmatchedZoom.push({
        name: zp.name,
        duration: zp.duration
      })
    }
  }

  return {
    zoomParticipants,
    matched,
    absent,
    unmatchedZoom
  }
}
