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
    // Clear meeting state and overrides after notifying
    setTimeout(() => {
      currentMeeting = null
      manualOverrides.clear()
    }, 60000) // Keep data for 1 min after meeting ends
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

  // Skip host/licensed users (they have email set and are not students)
  if (participant.email) {
    console.log(`[Live Store] Skipping host/licensed user: ${participant.user_name} (${participant.email})`)
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
