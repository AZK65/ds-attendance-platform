// In-memory store for live Zoom meeting participants + change notification

interface LiveParticipant {
  user_name: string
  user_id: string
  join_time: string
  email?: string
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
    // Clear meeting state after notifying
    setTimeout(() => {
      currentMeeting = null
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
