import { prisma } from '@/lib/db'

// In-memory pub/sub hub for kiosk SSE. Connected kiosks receive commands
// pushed down their open stream; the dashboard receives live state updates.
//
// NOTE: this lives in the Node process memory, which is correct for a single
// app container (the current docker-compose setup). If the app is ever scaled
// to multiple replicas behind a load balancer, this would need a shared bus
// (Redis pub/sub) so a command POSTed to one instance reaches a kiosk whose
// stream is held by another.

type Sender = (data: unknown) => void

interface Hub {
  kioskSenders: Map<string, Set<Sender>>   // kioskId -> open kiosk streams
  dashboardSenders: Set<Sender>            // open dashboard streams
}

// Survive dev hot-reload by stashing the hub on globalThis (same trick as the
// prisma singleton).
const g = globalThis as unknown as { __kioskHub?: Hub }
const hub: Hub =
  g.__kioskHub ?? (g.__kioskHub = { kioskSenders: new Map(), dashboardSenders: new Set() })

// ── Kiosk streams ──────────────────────────────────────────────────────────
export function addKioskSender(kioskId: string, send: Sender) {
  let set = hub.kioskSenders.get(kioskId)
  if (!set) { set = new Set(); hub.kioskSenders.set(kioskId, set) }
  set.add(send)
}

export function removeKioskSender(kioskId: string, send: Sender) {
  const set = hub.kioskSenders.get(kioskId)
  if (!set) return
  set.delete(send)
  if (set.size === 0) hub.kioskSenders.delete(kioskId)
}

export function isKioskOnline(kioskId: string): boolean {
  const set = hub.kioskSenders.get(kioskId)
  return !!set && set.size > 0
}

/** Push a payload to every open stream for one kiosk. Returns true if delivered. */
export function sendToKiosk(kioskId: string, payload: unknown): boolean {
  const set = hub.kioskSenders.get(kioskId)
  if (!set || set.size === 0) return false
  set.forEach(fn => { try { fn(payload) } catch { /* dead stream */ } })
  return true
}

// ── Dashboard streams ────────────────────────────────────────────────────────
export function addDashboardSender(send: Sender) { hub.dashboardSenders.add(send) }
export function removeDashboardSender(send: Sender) { hub.dashboardSenders.delete(send) }

/** Build the current kiosk list with live online status from the hub. */
export async function buildKioskList() {
  const kiosks = await prisma.kiosk.findMany({ orderBy: { name: 'asc' } })
  return kiosks.map(k => {
    let liveData: Record<string, unknown> | null = null
    if (k.liveData) { try { liveData = JSON.parse(k.liveData) } catch { liveData = null } }
    return {
      id: k.id,
      kioskId: k.kioskId,
      name: k.name,
      currentStep: k.currentStep,
      vehicleType: k.vehicleType,
      liveData,
      lastSeenAt: k.lastSeenAt,
      online: isKioskOnline(k.kioskId),
      hasPendingCommand: !!k.pendingCommand,
    }
  })
}

/** Push the latest kiosk list to all connected dashboards. */
export async function broadcastKiosks() {
  if (hub.dashboardSenders.size === 0) return
  const kiosks = await buildKioskList()
  const payload = { type: 'kiosks', kiosks }
  hub.dashboardSenders.forEach(fn => { try { fn(payload) } catch { /* dead stream */ } })
}
