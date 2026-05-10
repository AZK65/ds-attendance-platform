// In-memory store for live Zoom meeting participants + change notification

interface LiveParticipant {
  user_name: string
  user_id: string
  join_time: string
  email?: string
}

export interface ManualOverride {
  phone: string
  zoomName: string
  setBy: string
  setAt: string
}

interface LiveMeetingState {
  meetingId: string
  meetingUUID: string
  topic: string
  startTime: string
  participants: Map<string, LiveParticipant>
  isLive: boolean
}

export type StateChangeListener = () => void

// Module-level singleton
let currentMeeting: LiveMeetingState | null = null

// Listeners notified on every state change
const listeners: Set<StateChangeListener> = new Set()

// Manual overrides keyed by groupId → phone → override
const manualOverrides: Map<string, Map<string, ManualOverride>> = new Map()

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      listeners.delete(listener)
    }
  }
}

function getParticipantsList(): Array<{ user_name: string; user_id: string; join_time: string }> {
  if (!currentMeeting) return []
  return Array.from(currentMeeting.participants.values())
}

export function handleMeetingStarted(payload: {
  object: {
    id: string | number
    uuid: string
    topic: string
    start_time: string
  }
}) {
  const { object } = payload
  currentMeeting = {
    meetingId: String(object.id),
    meetingUUID: object.uuid,
    topic: object.topic || 'Zoom Meeting',
    startTime: object.start_time,
    participants: new Map(),
    isLive: true
  }
  console.log(`[Live Store] Meeting started: ${object.topic} (${object.id})`)
  notifyListeners()
}

export function handleMeetingEnded(payload: {
  object: {
    id: string | number
    uuid: string
  }
}) {
  if (currentMeeting) {
    currentMeeting.isLive = false
    console.log(`[Live Store] Meeting ended: ${currentMeeting.topic}`)
    notifyListeners()
    // Keep the participant list around for 15 minutes after meeting.ended.
    // Zoom occasionally fires a stray meeting.ended during quiet periods or
    // brief connectivity blips — clearing immediately wipes all participant
    // data and tips the UI into "everyone absent". 15 min is long enough to
    // ride through a transient signal but short enough not to bleed into
    // the next class.
    setTimeout(() => {
      currentMeeting = null
      manualOverrides.clear()
      console.log('[Live Store] Cleared meeting state (15-min post-end timeout)')
    }, 15 * 60 * 1000)
  }
}

export function handleParticipantJoined(payload: {
  object: {
    id: string | number
    uuid: string
    participant: {
      user_id: string
      user_name: string
      id?: string
      join_time: string
      email?: string
    }
  }
}) {
  const { object } = payload
  const { participant } = object

  // Initialize meeting state if we missed the meeting.started event
  if (!currentMeeting) {
    currentMeeting = {
      meetingId: String(object.id),
      meetingUUID: object.uuid,
      topic: 'Zoom Meeting',
      startTime: new Date().toISOString(),
      participants: new Map(),
      isLive: true
    }
  }

  // Previously we skipped any participant with an email, assuming only
  // hosts/licensed users have one — but every student who joins Zoom
  // signed into their own account also has an email, so that filter was
  // marking every account-using student as absent. Only skip when the
  // email matches a configured host address (school admin / teacher).
  const hostEmails = (process.env.ZOOM_HOST_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (participant.email && hostEmails.includes(participant.email.toLowerCase())) {
    console.log(`[Live Store] Skipping host: ${participant.user_name} (${participant.email})`)
    return
  }

  currentMeeting.participants.set(participant.user_id, {
    user_name: participant.user_name || 'Unknown',
    user_id: participant.user_id,
    join_time: participant.join_time || new Date().toISOString()
  })

  console.log(`[Live Store] Participant joined: ${participant.user_name} (${currentMeeting.participants.size} total)`)
  notifyListeners()
}

export function handleParticipantLeft(payload: {
  object: {
    id: string | number
    uuid: string
    participant: {
      user_id: string
      user_name: string
      id?: string
      leave_time: string
      email?: string
    }
  }
}) {
  if (!currentMeeting) return

  const { participant } = payload.object
  currentMeeting.participants.delete(participant.user_id)
  console.log(`[Live Store] Participant left: ${participant.user_name} (${currentMeeting.participants.size} remaining)`)
  notifyListeners()
}

export function getCurrentState() {
  return {
    isLive: currentMeeting?.isLive ?? false,
    meetingId: currentMeeting?.meetingId ?? null,
    meetingUUID: currentMeeting?.meetingUUID ?? null,
    topic: currentMeeting?.topic ?? null,
    startTime: currentMeeting?.startTime ?? null,
    participants: getParticipantsList()
  }
}

// Used when a meeting is already live but our webhook stream missed
// meeting.started — we hydrate the store from a Zoom API snapshot. Safe
// to call when there's an existing meeting; it merges new participants in
// without dropping anyone.
export function hydrateFromApi(input: {
  meetingId: string
  meetingUUID?: string
  topic?: string
  startTime?: string
  participants: Array<{ id: string; user_name: string; join_time: string; email?: string }>
}): void {
  if (!currentMeeting) {
    currentMeeting = {
      meetingId: input.meetingId,
      meetingUUID: input.meetingUUID || '',
      topic: input.topic || 'Zoom Meeting',
      startTime: input.startTime || new Date().toISOString(),
      participants: new Map(),
      isLive: true,
    }
  } else {
    currentMeeting.isLive = true
  }
  let added = 0
  for (const p of input.participants) {
    if (p.email) continue // Skip licensed/host accounts (same rule as webhook path)
    if (!currentMeeting.participants.has(p.id)) added++
    currentMeeting.participants.set(p.id, {
      user_name: p.user_name || 'Unknown',
      user_id: p.id,
      join_time: p.join_time || new Date().toISOString(),
    })
  }
  if (added > 0) {
    console.log(`[Live Store] Hydrated ${added} participant(s) from Zoom API`)
    notifyListeners()
  }
}

export function addListener(listener: StateChangeListener) {
  listeners.add(listener)
  console.log(`[Live Store] Listener added (${listeners.size} total)`)
}

export function removeListener(listener: StateChangeListener) {
  listeners.delete(listener)
  console.log(`[Live Store] Listener removed (${listeners.size} remaining)`)
}

// --- Manual Override Functions ---

export function setManualOverride(
  groupId: string,
  phone: string,
  zoomName: string,
  setBy: string = 'unknown'
): void {
  if (!manualOverrides.has(groupId)) {
    manualOverrides.set(groupId, new Map())
  }
  manualOverrides.get(groupId)!.set(phone, {
    phone,
    zoomName,
    setBy,
    setAt: new Date().toISOString()
  })
  console.log(`[Live Store] Manual override set: ${phone} -> ${zoomName} (by ${setBy})`)
  notifyListeners()
}

export function removeManualOverride(groupId: string, phone: string): void {
  const groupOverrides = manualOverrides.get(groupId)
  if (groupOverrides) {
    groupOverrides.delete(phone)
    console.log(`[Live Store] Manual override removed: ${phone}`)
    notifyListeners()
  }
}

export function getManualOverrides(groupId: string): ManualOverride[] {
  const groupOverrides = manualOverrides.get(groupId)
  if (!groupOverrides) return []
  return Array.from(groupOverrides.values())
}

export function clearManualOverrides(groupId: string): void {
  manualOverrides.delete(groupId)
  console.log(`[Live Store] Manual overrides cleared for group ${groupId}`)
  notifyListeners()
}
