import path from 'path'
import { prisma } from '@/lib/db'

// Types
interface WhatsAppState {
  client: unknown | null
  qr: string | null
  isConnected: boolean
  isConnecting: boolean
  groupsCache: GroupInfo[]
  lastGroupSync: number
}

export interface GroupInfo {
  id: string
  name: string
  participantCount: number
  moduleNumber?: number | null
  lastMessageDate?: Date | null
  lastMessagePreview?: string | null
}

export interface ParticipantInfo {
  id: string
  phone: string
  name: string | null
  pushName: string | null
  isAdmin: boolean
  isSuperAdmin: boolean
}

// Use global to persist state across module reloads in development
const globalForWhatsApp = globalThis as unknown as {
  whatsappState: WhatsAppState | undefined
}

const state: WhatsAppState = globalForWhatsApp.whatsappState ?? {
  client: null,
  qr: null,
  isConnected: false,
  isConnecting: false,
  groupsCache: [],
  lastGroupSync: 0
}

if (process.env.NODE_ENV !== 'production') {
  globalForWhatsApp.whatsappState = state
}

const AUTH_FOLDER = path.join(process.cwd(), '.wwebjs-auth')
const CACHE_TTL = 60000 // 1 minute cache
const CHAT_CACHE_TTL = 30000 // 30 second cache for inbox chats

// Inbox types
export interface ChatInfo {
  id: string
  name: string
  isGroup: boolean
  lastMessage: {
    body: string
    timestamp: number
    fromMe: boolean
  } | null
  unreadCount: number
  timestamp: number
}

export interface ChatMessage {
  id: string
  body: string
  timestamp: number
  fromMe: boolean
  senderName: string | null
  type: string
  hasMedia: boolean
}

// Inbox chat cache
let chatsCache: ChatInfo[] = []
let lastChatSync = 0

export function getWhatsAppState() {
  return {
    qr: state.qr,
    isConnected: state.isConnected,
    isConnecting: state.isConnecting
  }
}

export function resetWhatsAppState(): void {
  if (state.client) {
    try {
      const client = state.client as { destroy: () => Promise<void> }
      client.destroy().catch(() => {})
    } catch {
      // ignore
    }
  }
  state.client = null
  state.qr = null
  state.isConnected = false
  state.isConnecting = false
  state.groupsCache = []
  state.lastGroupSync = 0
}

// Full reconnect - completely destroys and recreates the client
// Used when frame detachment or other unrecoverable errors occur
async function fullReconnect(): Promise<void> {
  console.log('[fullReconnect] Starting full reconnect...')

  // Mark as disconnected
  state.isConnected = false
  state.isConnecting = false

  // Destroy existing client completely
  if (state.client) {
    try {
      const client = state.client as { destroy: () => Promise<void> }
      await client.destroy()
      console.log('[fullReconnect] Client destroyed')
    } catch (e) {
      console.log('[fullReconnect] Error destroying client:', e)
    }
    state.client = null
  }

  // Clear cache
  state.groupsCache = []
  state.lastGroupSync = 0
  state.qr = null

  // Wait before reconnecting
  console.log('[fullReconnect] Waiting 5s before reconnecting...')
  await new Promise(resolve => setTimeout(resolve, 5000))

  // Reconnect
  if (!state.isConnected && !state.isConnecting) {
    console.log('[fullReconnect] Initiating new connection...')
    try {
      await connectWhatsApp()
    } catch (err) {
      console.error('[fullReconnect] Reconnection failed:', err)
    }
  }
}

export async function connectWhatsApp(): Promise<void> {
  if (state.isConnecting || state.isConnected) {
    return
  }

  state.isConnecting = true
  state.qr = null

  // Clean up stale Chromium lock files that prevent restart
  try {
    const fs = await import('fs')
    const lockFiles = [
      path.join(AUTH_FOLDER, 'session', 'Default', 'SingletonLock'),
      path.join(AUTH_FOLDER, 'session', 'Default', 'SingletonCookie'),
      path.join(AUTH_FOLDER, 'session', 'Default', 'SingletonSocket'),
      path.join(AUTH_FOLDER, 'session', 'SingletonLock'),
      path.join(AUTH_FOLDER, 'session', 'SingletonCookie'),
      path.join(AUTH_FOLDER, 'session', 'SingletonSocket'),
    ]
    for (const lockFile of lockFiles) {
      try {
        fs.unlinkSync(lockFile)
        console.log(`[WhatsApp] Removed stale lock: ${lockFile}`)
      } catch {
        // File doesn't exist, that's fine
      }
    }
  } catch {
    // Ignore cleanup errors
  }

  try {
    // Dynamic import of whatsapp-web.js
    const { Client, LocalAuth } = await import('whatsapp-web.js')

    const client = new Client({
      authStrategy: new LocalAuth({
        dataPath: AUTH_FOLDER
      }),
      puppeteer: {
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        timeout: 60000,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--no-first-run',
          '--no-zygote',
          '--single-process'
        ]
      }
    })

    state.client = client

    client.on('qr', (qr: string) => {
      console.log('QR code received')
      state.qr = qr
    })

    client.on('ready', async () => {
      console.log('WhatsApp client is ready!')
      state.isConnected = true
      state.isConnecting = false
      state.qr = null

      // Wait longer for WhatsApp Web to fully initialize after Jan 2026 update
      console.log('[ready] Waiting 10s for WhatsApp Web to fully initialize...')
      await new Promise(resolve => setTimeout(resolve, 10000))

      // Wait for Store.Chat to be populated before syncing
      const typedClientForSync = client as { pupPage?: { evaluate: <T>(fn: string) => Promise<T> } }
      if (typedClientForSync.pupPage) {
        console.log('[ready] Waiting for Store.Chat to be populated...')
        try {
          const chatCount = await typedClientForSync.pupPage.evaluate<number>(`
            (async () => {
              const maxWait = 60000; // Wait up to 60 seconds
              const start = Date.now();

              while (Date.now() - start < maxWait) {
                if (window.Store && window.Store.Chat) {
                  let chats = [];
                  if (window.Store.Chat.getModelsArray) {
                    chats = window.Store.Chat.getModelsArray();
                  } else if (window.Store.Chat.models) {
                    chats = Array.from(window.Store.Chat.models.values());
                  } else if (window.Store.Chat._models) {
                    chats = window.Store.Chat._models;
                  }

                  if (chats.length > 0) {
                    console.log('[ready] Store.Chat has ' + chats.length + ' chats after ' + (Date.now() - start) + 'ms');
                    return chats.length;
                  }
                }
                await new Promise(r => setTimeout(r, 1000));
              }
              console.log('[ready] Timeout waiting for chats');
              return 0;
            })()
          `)
          console.log(`[ready] Store.Chat reports ${chatCount} chats`)
        } catch (e) {
          console.log('[ready] Failed to check Store.Chat:', e)
          // If we can't access pupPage here, the frame might already be detached
          const errStr = String(e)
          if (errStr.includes('detached') || errStr.includes('Target closed')) {
            console.log('[ready] Frame already detached, triggering full reconnect...')
            await fullReconnect()
            return
          }
        }
      }

      // Sync groups in background with retry
      const syncWithRetry = async (attempt = 1, maxAttempts = 5) => {
        try {
          console.log(`[syncWithRetry] Starting attempt ${attempt}/${maxAttempts}...`)
          await syncGroups()
          console.log(`[syncWithRetry] Attempt ${attempt} completed, found ${state.groupsCache.length} groups`)
          if (state.groupsCache.length === 0 && attempt < maxAttempts) {
            const delay = Math.min(5000 * attempt, 30000) // Exponential backoff, max 30s
            console.log(`[syncWithRetry] No groups found on attempt ${attempt}, retrying in ${delay/1000}s...`)
            await new Promise(resolve => setTimeout(resolve, delay))
            return syncWithRetry(attempt + 1, maxAttempts)
          }
        } catch (err) {
          console.error(`[syncWithRetry] Error on attempt ${attempt}:`, err)
          const errStr = String(err)
          // If frame detached, do full reconnect instead of retry
          if (errStr.includes('detached') || errStr.includes('Target closed')) {
            console.log('[syncWithRetry] Frame detached, triggering full reconnect...')
            await fullReconnect()
            return
          }
          if (attempt < maxAttempts) {
            const delay = Math.min(5000 * attempt, 30000)
            await new Promise(resolve => setTimeout(resolve, delay))
            return syncWithRetry(attempt + 1, maxAttempts)
          }
        }
      }
      syncWithRetry().catch(err => console.error('[syncWithRetry] All attempts failed:', err))
    })

    // Listen for group participant changes to clear cache
    client.on('group_join', (notification: { chatId: string }) => {
      console.log(`[group_join] Someone joined group ${notification.chatId}`)
      // Clear any cached data for this group
    })

    client.on('group_leave', (notification: { chatId: string }) => {
      console.log(`[group_leave] Someone left group ${notification.chatId}`)
    })

    client.on('group_update', (notification: { chatId: string }) => {
      console.log(`[group_update] Group ${notification.chatId} was updated`)
    })

    client.on('authenticated', async () => {
      console.log('WhatsApp authenticated')

      // Workaround for WhatsApp Web update (Jan 28, 2026) that broke ready event
      // See: https://github.com/pedroslopez/whatsapp-web.js/issues/5758
      const typedClient = client as { pupPage?: { evaluate: (fn: string) => Promise<unknown> } }
      if (typedClient.pupPage) {
        try {
          // Check if already synced and manually trigger the event
          await typedClient.pupPage.evaluate(`
            (async () => {
              const maxWait = 30000;
              const start = Date.now();

              // Wait for AuthStore to be available
              while (!window.AuthStore?.AppState && Date.now() - start < maxWait) {
                await new Promise(r => setTimeout(r, 500));
              }

              if (window.AuthStore?.AppState) {
                const appState = window.AuthStore.AppState;

                // If already synced, manually trigger the sync event
                if (appState.hasSynced) {
                  console.log('[Workaround] AppState already synced, triggering event');
                  if (window.onAppStateHasSyncedEvent) {
                    window.onAppStateHasSyncedEvent();
                  }
                }
              }
            })()
          `)
          console.log('Applied WhatsApp sync workaround')
        } catch (e) {
          console.log('Workaround evaluation failed:', e)
        }
      }
    })

    client.on('auth_failure', (msg: string) => {
      console.error('WhatsApp authentication failed:', msg)
      state.isConnecting = false
      state.isConnected = false
    })

    client.on('disconnected', (reason: string) => {
      console.log('WhatsApp disconnected:', reason)
      state.isConnected = false
      state.isConnecting = false
      state.client = null
      state.groupsCache = []

      // Auto-reconnect after a delay (unless logout was intentional)
      if (reason !== 'LOGOUT') {
        console.log('[WhatsApp] Will attempt to reconnect in 10 seconds...')
        setTimeout(() => {
          if (!state.isConnected && !state.isConnecting) {
            console.log('[WhatsApp] Auto-reconnecting...')
            connectWhatsApp().catch(err => {
              console.error('[WhatsApp] Auto-reconnect failed:', err)
            })
          }
        }, 10000)
      }
    })

    // Handle page crashes and frame detachment (Jan 2026 WhatsApp Web issues)
    const typedClientForCrash = client as { pupPage?: { on: (event: string, handler: (error: Error) => void) => void } }
    if (typedClientForCrash.pupPage) {
      typedClientForCrash.pupPage.on('error', (error: Error) => {
        console.error('[WhatsApp] Page error:', error.message)
        if (error.message.includes('detached') || error.message.includes('Target closed')) {
          console.log('[WhatsApp] Page detached, marking as disconnected')
          state.isConnected = false
        }
      })

      typedClientForCrash.pupPage.on('close', () => {
        console.log('[WhatsApp] Page closed unexpectedly')
        state.isConnected = false
        state.isConnecting = false
        state.client = null
      })
    }

    await client.initialize()
  } catch (error) {
    console.error('WhatsApp connection error:', error)
    state.isConnecting = false
    throw error
  }
}

export async function disconnectWhatsApp(): Promise<void> {
  if (state.client) {
    const client = state.client as { logout: () => Promise<void>; destroy: () => Promise<void> }
    try {
      await client.logout()
    } catch {
      // Ignore logout errors
    }
    await client.destroy()
    state.client = null
    state.isConnected = false
    state.qr = null
    state.groupsCache = []
  }
}

async function syncGroups(): Promise<void> {
  if (!state.client || !state.isConnected) return

  try {
    console.log('Syncing groups...')

    // Wait for WhatsApp Web to fully initialize after the Jan 28 2026 update
    // The Store object needs time to populate
    await new Promise(resolve => setTimeout(resolve, 5000))

    const client = state.client as {
      getChats: () => Promise<Array<{
        id: { _serialized: string }
        name: string
        isGroup: boolean
        groupMetadata?: { participants: Array<unknown> }
      }>>
      pupPage?: { evaluate: <T>(fn: string) => Promise<T> }
    }

    let groups: Array<{
      id: { _serialized: string }
      name: string
      isGroup: boolean
      groupMetadata?: { participants: Array<unknown> }
    }> = []

    // Helper to check if page/frame is still attached
    const isPageAttached = async (): Promise<boolean> => {
      if (!client.pupPage) return false
      try {
        await client.pupPage.evaluate<boolean>('true')
        return true
      } catch (e) {
        const errorMsg = String(e)
        if (errorMsg.includes('detached') || errorMsg.includes('Target closed') || errorMsg.includes('context was destroyed')) {
          console.log('[syncGroups] Page/frame is detached')
          return false
        }
        return true // Other errors might be transient
      }
    }

    // First try the standard getChats method
    try {
      const chats = await client.getChats()
      // Filter groups by isGroup flag OR by @g.us suffix (more reliable)
      groups = chats.filter(chat => chat.isGroup || chat.id._serialized.endsWith('@g.us'))
      console.log(`getChats returned ${groups.length} groups (from ${chats.length} total chats)`)
    } catch (getChatsError) {
      const errorMsg = String(getChatsError)
      console.log('getChats failed:', errorMsg)

      // If detached frame error, trigger full reconnect
      if (errorMsg.includes('detached') || errorMsg.includes('Target closed') || errorMsg.includes('context was destroyed')) {
        console.log('[syncGroups] Detected frame detachment, triggering full reconnect...')
        await fullReconnect()
        return
      }
    }

    // If getChats returned no groups, just log it — database groups are still available
    if (groups.length === 0) {
      console.log('[syncGroups] getChats returned 0 groups — will use database cache')
    }

    const groupInfos: GroupInfo[] = []

    for (const group of groups) {
      const participantCount = group.groupMetadata?.participants?.length || 0
      const groupName = group.name || 'Unknown Group'

      groupInfos.push({
        id: group.id._serialized,
        name: groupName,
        participantCount
      })

      // Only upsert to DB if group has a name
      if (group.name) {
        await prisma.group.upsert({
          where: { id: group.id._serialized },
          update: {
            name: group.name,
            participantCount,
            lastSynced: new Date()
          },
          create: {
            id: group.id._serialized,
            name: group.name,
            participantCount
          }
        })
      }
    }

    state.groupsCache = groupInfos
    state.lastGroupSync = Date.now()
    console.log(`Synced ${groups.length} groups`)
  } catch (error) {
    console.error('Error syncing groups:', error)
  }
}

export async function getGroups(): Promise<GroupInfo[]> {
  // Return cached groups if available and fresh
  if (state.groupsCache && state.groupsCache.length > 0 && Date.now() - state.lastGroupSync < CACHE_TTL) {
    return state.groupsCache
  }

  // If not connected, return from database
  if (!state.client || !state.isConnected) {
    const dbGroups = await prisma.group.findMany({
      orderBy: { name: 'asc' }
    })
    return dbGroups.map(g => ({
      id: g.id,
      name: g.name,
      participantCount: g.participantCount,
      moduleNumber: g.moduleNumber ?? null,
      lastMessageDate: g.lastMessageDate ?? null,
      lastMessagePreview: g.lastMessagePreview ?? null
    }))
  }

  // Fetch fresh from WhatsApp
  await syncGroups()
  return state.groupsCache
}

export async function getGroupParticipants(groupId: string): Promise<ParticipantInfo[]> {
  if (!state.client || !state.isConnected) {
    throw new Error('WhatsApp not connected')
  }

  // Type for wwebjs GroupChat which has additional methods
  interface GroupChat {
    id: { _serialized: string }
    name: string
    isGroup: boolean
    participants: Array<{
      id: { _serialized: string; user: string }
      isAdmin: boolean
      isSuperAdmin: boolean
    }>
    groupMetadata?: {
      participants: Array<{
        id: { _serialized: string; user: string }
        isAdmin: boolean
        isSuperAdmin: boolean
      }>
    }
  }

  const client = state.client as {
    getChatById: (id: string) => Promise<GroupChat>
    getContactById: (id: string) => Promise<{
      id: { _serialized: string; user: string }
      name?: string
      pushname?: string
      number: string
    }>
    // Access internal methods
    pupPage?: {
      evaluate: <T>(fn: string) => Promise<T>
    }
  }

  console.log(`[getGroupParticipants] Fetching participants for ${groupId}`)

  // Get chat data via getChatById (no pupPage cache manipulation — it causes timeouts in Docker)
  const chat = await client.getChatById(groupId)

  if (!chat.isGroup) {
    throw new Error('Not a group chat')
  }

  // Get participants from the chat object or groupMetadata
  let chatParticipants = chat.participants || []
  if (chatParticipants.length === 0 && chat.groupMetadata?.participants) {
    chatParticipants = chat.groupMetadata.participants
  }

  console.log(`[getGroupParticipants] Found ${chatParticipants.length} participants`)

  const participants: ParticipantInfo[] = []

  for (const participant of chatParticipants) {
    try {
      const contact = await client.getContactById(participant.id._serialized)
      const phone = contact.number || participant.id.user

      participants.push({
        id: participant.id._serialized,
        phone,
        name: contact.name || null,
        pushName: contact.pushname || null,
        isAdmin: participant.isAdmin || false,
        isSuperAdmin: participant.isSuperAdmin || false
      })

      // Sync to database
      await prisma.contact.upsert({
        where: { id: participant.id._serialized },
        update: {
          phone,
          name: contact.name || null,
          pushName: contact.pushname || null,
          lastSynced: new Date()
        },
        create: {
          id: participant.id._serialized,
          phone,
          name: contact.name || null,
          pushName: contact.pushname || null
        }
      })
    } catch (error) {
      console.error(`Error getting contact ${participant.id._serialized}:`, error)
      // Add with basic info if contact fetch fails
      participants.push({
        id: participant.id._serialized,
        phone: participant.id.user,
        name: null,
        pushName: null,
        isAdmin: participant.isAdmin || false,
        isSuperAdmin: participant.isSuperAdmin || false
      })
    }
  }

  return participants
}

export async function getGroupInfo(groupId: string): Promise<{ name: string; participantCount: number }> {
  if (!state.client || !state.isConnected) {
    throw new Error('WhatsApp not connected')
  }

  const client = state.client as {
    getChatById: (id: string) => Promise<{
      name: string
      participants?: Array<unknown>
    }>
  }

  const chat = await client.getChatById(groupId)
  return {
    name: chat.name,
    participantCount: chat.participants?.length || 0
  }
}

export async function addParticipantToGroup(groupId: string, phone: string): Promise<{ success: boolean; error?: string; inviteSent?: boolean }> {
  if (!state.client || !state.isConnected) {
    throw new Error('WhatsApp not connected')
  }

  try {
    const client = state.client as {
      getChatById: (id: string) => Promise<{
        addParticipants: (participants: string[], options?: unknown) => Promise<Record<string, { code: number; message: string; isInviteV4Sent: boolean }>>
        getInviteCode: () => Promise<string>
        name: string
      }>
      getChats: () => Promise<unknown[]>
      pupPage?: {
        evaluate: <T>(fn: string) => Promise<T>
      }
    }

    // Format phone number to WhatsApp ID format
    const participantId = phoneToJid(phone)
    console.log(`Adding participant ${participantId} to group ${groupId}`)

    const chat = await client.getChatById(groupId)

    // Add timeout to prevent hanging (WhatsApp can stall on privacy-restricted numbers)
    const addWithTimeout = Promise.race([
      chat.addParticipants([participantId]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Add participant timed out after 8s')), 8000)),
    ])
    const result = await addWithTimeout
    console.log('Add participant result:', result)

    // Check if there was an error for this participant
    const participantResult = result[participantId]
    if (participantResult && participantResult.code !== 200) {
      // If invite was already sent by WhatsApp via V4, report it
      if (participantResult.isInviteV4Sent) {
        console.log(`[addParticipant] Invite V4 sent to ${participantId}`)
        return { success: true, inviteSent: true }
      }

      // Try sending a group invite link as fallback
      console.log(`[addParticipant] Direct add failed (${participantResult.code}), sending invite link...`)
      try {
        const inviteCode = await chat.getInviteCode()
        const inviteLink = `https://chat.whatsapp.com/${inviteCode}`
        const groupName = chat.name || 'the group'
        await sendPrivateMessage(
          phone,
          `You've been invited to join *${groupName}*!\n\nClick the link to join:\n${inviteLink}`
        )
        console.log(`[addParticipant] Invite link sent to ${phone}`)
        return {
          success: true,
          inviteSent: true,
        }
      } catch (inviteErr) {
        console.error('[addParticipant] Failed to send invite link:', inviteErr)
        return {
          success: false,
          error: (participantResult.message || `Error code ${participantResult.code}`) + ' (invite link also failed)',
        }
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Add participant error:', error)
    throw error
  }
}

// Add multiple participants to a group in batches of 3 (prevents Chromium OOM on low-memory servers)
export async function addParticipantsToGroupBulk(
  groupId: string,
  phones: string[]
): Promise<Array<{ phone: string; success: boolean; inviteSent?: boolean; error?: string }>> {
  if (!state.client || !state.isConnected) {
    throw new Error('WhatsApp not connected')
  }

  const client = state.client as {
    getChatById: (id: string) => Promise<{
      addParticipants: (participants: string[], options?: unknown) => Promise<Record<string, { code: number; message: string; isInviteV4Sent: boolean }>>
      getInviteCode: () => Promise<string>
      name: string
    }>
  }

  const chat = await client.getChatById(groupId)
  const BATCH_SIZE = 3
  const results: Array<{ phone: string; success: boolean; inviteSent?: boolean; error?: string }> = []

  for (let i = 0; i < phones.length; i += BATCH_SIZE) {
    const batch = phones.slice(i, i + BATCH_SIZE)
    const batchJids = batch.map(p => phoneToJid(p))

    console.log(`[addParticipantsBulk] Batch ${Math.floor(i / BATCH_SIZE) + 1}: adding ${batch.length} participants`)

    try {
      const addWithTimeout = Promise.race([
        chat.addParticipants(batchJids),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Batch add timed out')), 15000)),
      ])
      const result = await addWithTimeout

      for (let j = 0; j < batch.length; j++) {
        const jid = batchJids[j]
        const phone = batch[j]
        const r = result[jid]

        if (!r || r.code === 200) {
          results.push({ phone, success: true })
        } else if (r.isInviteV4Sent) {
          results.push({ phone, success: true, inviteSent: true })
        } else {
          // Try sending invite link as fallback
          try {
            const inviteCode = await chat.getInviteCode()
            const inviteLink = `https://chat.whatsapp.com/${inviteCode}`
            await sendPrivateMessage(phone, `You've been invited to join *${chat.name}*!\n\nClick the link to join:\n${inviteLink}`)
            results.push({ phone, success: true, inviteSent: true })
          } catch {
            results.push({ phone, success: false, error: r.message || `Code ${r.code}` })
          }
        }
      }
    } catch (err) {
      console.error(`[addParticipantsBulk] Batch failed:`, err)
      for (const phone of batch) {
        results.push({ phone, success: false, error: err instanceof Error ? err.message : 'Batch failed' })
      }
    }

    // Brief pause between batches to let Chromium breathe
    if (i + BATCH_SIZE < phones.length) {
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  return results
}

export async function setGroupDescription(groupId: string, description: string): Promise<{ success: boolean; error?: string }> {
  if (!state.client || !state.isConnected) {
    throw new Error('WhatsApp not connected')
  }

  try {
    const client = state.client as {
      getChatById: (id: string) => Promise<{
        setDescription: (desc: string) => Promise<boolean>
      }>
    }

    const chat = await client.getChatById(groupId)
    await chat.setDescription(description)
    console.log(`[setGroupDescription] Updated description for ${groupId}`)
    return { success: true }
  } catch (error) {
    console.error('Set group description error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to set description' }
  }
}

export async function createWhatsAppGroup(name: string, participantPhones: string[]): Promise<{ groupId: string; title: string }> {
  if (!state.client || !state.isConnected) {
    throw new Error('WhatsApp not connected')
  }

  try {
    const client = state.client as {
      createGroup: (title: string, participants: string[]) => Promise<{ gid: { _serialized: string }; title: string; participants: Array<{ id: { _serialized: string }; statusCode: number }> }>
    }

    const participantJids = participantPhones.map(p => phoneToJid(p))
    console.log(`[createGroup] Creating group "${name}" with ${participantJids.length} participants`)

    const result = await client.createGroup(name, participantJids)
    const groupId = result.gid._serialized

    console.log(`[createGroup] Group created: ${groupId}`)

    // Log any participant add failures
    const participants = Array.isArray(result.participants) ? result.participants : []
    for (const p of participants) {
      if (p.statusCode !== 200) {
        console.warn(`[createGroup] Failed to add ${p.id?._serialized}: status ${p.statusCode}`)
      }
    }

    return { groupId, title: result.title }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('Create group error:', error)

    // "Lid is missing in chat table" is a known whatsapp-web.js bug where
    // the group IS created on WhatsApp but the library fails to parse the response.
    // Try to recover by finding the newly created group in the chat list.
    if (errMsg.includes('Lid is missing') || errMsg.includes('lid')) {
      console.log(`[createGroup] Attempting recovery — searching for group "${name}" in chats...`)
      try {
        await new Promise(r => setTimeout(r, 3000))

        const chatClient = state.client as {
          getChats: () => Promise<Array<{ id: { _serialized: string }; name: string; isGroup: boolean; timestamp: number }>>
        }
        const chats = await chatClient.getChats()
        const recentGroups = chats
          .filter(c => c.isGroup && c.name === name)
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))

        if (recentGroups.length > 0) {
          const recovered = recentGroups[0]
          console.log(`[createGroup] Recovered group ID: ${recovered.id._serialized}`)
          return { groupId: recovered.id._serialized, title: recovered.name }
        }
      } catch (recoveryErr) {
        console.error('[createGroup] Recovery failed:', recoveryErr)
      }
    }

    throw error
  }
}

export async function removeParticipantFromGroup(groupId: string, participantId: string): Promise<void> {
  if (!state.client || !state.isConnected) {
    throw new Error('WhatsApp not connected')
  }

  try {
    const client = state.client as {
      getChatById: (id: string) => Promise<{
        removeParticipants: (participants: string[]) => Promise<unknown>
      }>
    }

    console.log(`Removing participant ${participantId} from group ${groupId}`)

    const chat = await client.getChatById(groupId)
    const result = await chat.removeParticipants([participantId])
    console.log('Remove participant result:', result)

    // Small delay to let WhatsApp propagate the change
    await new Promise(resolve => setTimeout(resolve, 1500))
  } catch (error) {
    console.error('Remove participant error:', error)
    throw error
  }
}

// Extract module number from message text (e.g., "Today's Module 7 Class")
function extractModuleNumber(text: string): number | null {
  const match = text.match(/module\s*(\d+)/i)
  return match ? parseInt(match[1], 10) : null
}

export async function sendMessageToGroup(groupId: string, message: string): Promise<void> {
  if (!state.client || !state.isConnected) {
    throw new Error('WhatsApp not connected')
  }

  const client = state.client as {
    sendMessage: (chatId: string, content: string) => Promise<unknown>
  }

  console.log(`Sending message to group ${groupId}`)

  try {
    await client.sendMessage(groupId, message)
    console.log(`Group message sent to ${groupId}`)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : typeof error === 'object' ? JSON.stringify(error) : String(error)
    console.error(`Send group message error for ${groupId}:`, errMsg)
    throw new Error(errMsg)
  }
}

export interface GroupLastMessage {
  body: string
  timestamp: Date
  moduleNumber: number | null
}

export async function getGroupLastMessage(groupId: string): Promise<GroupLastMessage | null> {
  if (!state.client || !state.isConnected) {
    return null
  }

  try {
    const client = state.client as {
      getChatById: (id: string) => Promise<{
        fetchMessages: (options: { limit: number }) => Promise<Array<{
          body: string
          timestamp: number
          fromMe: boolean
        }>>
      }>
    }

    const chat = await client.getChatById(groupId)
    const messages = await chat.fetchMessages({ limit: 50 })

    // Find the highest module number (most recent class)
    let highestModule: number | null = null
    let highestModuleMsg: { body: string; timestamp: number } | null = null

    for (const msg of messages) {
      const moduleNumber = extractModuleNumber(msg.body)
      if (moduleNumber !== null && (highestModule === null || moduleNumber > highestModule)) {
        highestModule = moduleNumber
        highestModuleMsg = msg
      }
    }

    if (highestModuleMsg !== null) {
      return {
        body: highestModuleMsg.body,
        timestamp: new Date(highestModuleMsg.timestamp * 1000),
        moduleNumber: highestModule
      }
    }

    // If no module message found, return the last message
    if (messages.length > 0) {
      const lastMsg = messages[0]
      return {
        body: lastMsg.body,
        timestamp: new Date(lastMsg.timestamp * 1000),
        moduleNumber: null
      }
    }

    return null
  } catch (error) {
    console.error(`Error getting last message for group ${groupId}:`, error)
    return null
  }
}

export async function getGroupsWithDetails(): Promise<GroupInfo[]> {
  if (!state.client || !state.isConnected) {
    // Return from database if not connected
    const dbGroups = await prisma.group.findMany({
      orderBy: { name: 'asc' }
    })
    return dbGroups.map(g => ({
      id: g.id,
      name: g.name,
      participantCount: g.participantCount,
      moduleNumber: g.moduleNumber ?? null,
      lastMessageDate: g.lastMessageDate ?? null,
      lastMessagePreview: g.lastMessagePreview ?? null
    }))
  }

  const client = state.client as {
    getChats: () => Promise<Array<{
      id: { _serialized: string }
      name: string
      isGroup: boolean
      groupMetadata?: { participants: Array<unknown> }
      lastMessage?: {
        body: string
        timestamp: number
      }
      timestamp?: number
      fetchMessages: (options: { limit: number }) => Promise<Array<{
        body: string
        timestamp: number
      }>>
    }>>
    searchMessages: (query: string, options?: { chatId?: string; limit?: number }) => Promise<Array<{
      body: string
      timestamp: number
      from: string
    }>>
    pupPage?: {
      evaluate: <T>(fn: string) => Promise<T>
    }
  }

  try {
    console.log('Fetching groups with details...')
    const chats = await client.getChats()
    const groups = chats.filter(chat => chat.isGroup)

    const groupInfos: GroupInfo[] = []

    for (const group of groups) {
      const participantCount = group.groupMetadata?.participants?.length || 0
      let moduleNumber: number | null = null
      let lastMessageDate: Date | null = null
      let lastMessagePreview: string | null = null
      let moduleMessageDate: Date | null = null

      // Get last message date from the chat
      if (group.lastMessage) {
        lastMessageDate = new Date(group.lastMessage.timestamp * 1000)
        lastMessagePreview = group.lastMessage.body?.substring(0, 100) || null
      } else if (group.timestamp) {
        lastMessageDate = new Date(group.timestamp * 1000)
      }

      // ALWAYS search for the highest module number in the chat
      // First try searchMessages API
      try {
        const searchResults = await client.searchMessages('module', {
          chatId: group.id._serialized,
          limit: 50
        })

        console.log(`[Module Search] Group "${group.name}": searchMessages returned ${searchResults.length} results`)

        for (const msg of searchResults) {
          const foundModule = extractModuleNumber(msg.body || '')
          if (foundModule !== null && (moduleNumber === null || foundModule > moduleNumber)) {
            moduleNumber = foundModule
            moduleMessageDate = new Date(msg.timestamp * 1000)
            lastMessagePreview = msg.body?.substring(0, 100) || null
            console.log(`[Module Search] Found Module ${foundModule} from ${moduleMessageDate}`)
          }
        }
      } catch (err) {
        console.log(`[Module Search] searchMessages failed for "${group.name}":`, err)
        // Search might fail, continue to fetchMessages
      }

      // Also try fetchMessages to catch any that search might have missed
      try {
        const messages = await group.fetchMessages({ limit: 100 })
        console.log(`[Module Search] Group "${group.name}": fetchMessages returned ${messages.length} messages`)

        for (const msg of messages) {
          const foundModule = extractModuleNumber(msg.body || '')
          if (foundModule !== null && (moduleNumber === null || foundModule > moduleNumber)) {
            moduleNumber = foundModule
            moduleMessageDate = new Date(msg.timestamp * 1000)
            lastMessagePreview = msg.body?.substring(0, 100) || null
            console.log(`[Module Search] Found higher Module ${foundModule} from ${moduleMessageDate}`)
          }
        }
      } catch (err) {
        console.log(`[Module Search] fetchMessages failed for "${group.name}":`, err)
        // fetchMessages might fail for some groups, that's OK
      }

      groupInfos.push({
        id: group.id._serialized,
        name: group.name,
        participantCount,
        moduleNumber,
        // Use module message date if available, otherwise last message date
        lastMessageDate: moduleMessageDate || lastMessageDate,
        lastMessagePreview
      })
    }

    console.log(`Fetched ${groupInfos.length} groups with details`)
    return groupInfos
  } catch (error) {
    console.error('Error fetching groups with details:', error)
    return []
  }
}

export async function searchContacts(searchTerm: string): Promise<ParticipantInfo[]> {
  if (!state.client || !state.isConnected) {
    return []
  }

  const client = state.client as {
    getContacts: () => Promise<Array<{
      id: { _serialized: string; user: string }
      name?: string
      pushname?: string
      number: string
      isUser: boolean
    }>>
    getContactById: (id: string) => Promise<{
      id: { _serialized: string; user: string }
      name?: string
      pushname?: string
      number: string
    }>
  }

  try {
    const contacts = await client.getContacts()
    const searchLower = searchTerm.toLowerCase()

    const results = contacts
      .filter(contact => {
        if (!contact.isUser) return false
        if (!searchTerm) return true

        const nameMatch = contact.name?.toLowerCase().includes(searchLower)
        const pushNameMatch = contact.pushname?.toLowerCase().includes(searchLower)
        const phoneMatch = contact.number?.includes(searchTerm)

        return nameMatch || pushNameMatch || phoneMatch
      })
      .slice(0, 50)
      .map(contact => ({
        id: contact.id._serialized,
        phone: contact.number || contact.id.user,
        name: contact.name || null,
        pushName: contact.pushname || null,
        isAdmin: false,
        isSuperAdmin: false
      }))

    // For contacts with no name, fetch individually via getContactById (more reliable)
    // then fall back to local database if that still fails
    const unknownContacts = results.filter(c => !c.name && !c.pushName)
    for (const contact of unknownContacts) {
      try {
        const fetched = await client.getContactById(contact.id)
        if (fetched.name || fetched.pushname) {
          contact.name = fetched.name || null
          contact.pushName = fetched.pushname || null
          // Save to local DB for future lookups
          await prisma.contact.upsert({
            where: { id: contact.id },
            update: { phone: contact.phone, name: contact.name, pushName: contact.pushName, lastSynced: new Date() },
            create: { id: contact.id, phone: contact.phone, name: contact.name, pushName: contact.pushName }
          }).catch(() => {})
        }
      } catch {
        // getContactById failed, try local DB
        try {
          const db = await prisma.contact.findUnique({
            where: { id: contact.id },
            select: { name: true, pushName: true }
          })
          if (db?.name || db?.pushName) {
            contact.name = db.name || null
            contact.pushName = db.pushName || null
          }
        } catch {
          // Both failed, will show as Unknown
        }
      }
    }

    // Also search the local database for contacts not found in WhatsApp's getContacts()
    if (searchTerm.length >= 2) {
      try {
        const existingIds = new Set(results.map(r => r.id))
        const dbResults = await prisma.contact.findMany({
          where: {
            OR: [
              { name: { contains: searchTerm } },
              { pushName: { contains: searchTerm } },
              { phone: { contains: searchTerm } },
            ],
            NOT: { id: { in: [...existingIds] } }
          },
          take: 20
        })
        for (const db of dbResults) {
          if (!existingIds.has(db.id)) {
            results.push({
              id: db.id,
              phone: db.phone,
              name: db.name || null,
              pushName: db.pushName || null,
              isAdmin: false,
              isSuperAdmin: false
            })
          }
        }
      } catch {
        // DB search failed, continue with WhatsApp results only
      }
    }

    return results
  } catch (error) {
    console.error('Error searching contacts:', error)
    return []
  }
}

export async function sendPrivateMessage(phone: string, message: string): Promise<void> {
  if (!state.client || !state.isConnected) {
    throw new Error('WhatsApp not connected')
  }

  const chatId = phoneToJid(phone)

  const client = state.client as {
    sendMessage: (chatId: string, content: string) => Promise<unknown>
  }

  console.log(`Sending private message to ${chatId}`)

  try {
    await client.sendMessage(chatId, message)
    console.log(`Private message sent to ${chatId}`)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : typeof error === 'object' ? JSON.stringify(error) : String(error)
    console.error(`Send private message error to ${chatId}:`, errMsg)
    throw new Error(errMsg)
  }
}

// Check if a phone number is registered on WhatsApp
export async function checkWhatsAppNumber(phone: string): Promise<{ registered: boolean; jid?: string }> {
  if (!state.isConnected || !state.client) {
    throw new Error('WhatsApp not connected')
  }
  const client = state.client as { getNumberId: (number: string) => Promise<{ _serialized: string } | null> }
  const cleaned = phone.replace(/[^0-9]/g, '')
  // Try with country code as-is, and also with +1 prefix for North American numbers
  const numbersToTry = [cleaned]
  if (cleaned.length === 10) {
    numbersToTry.push(`1${cleaned}`)
  }
  for (const num of numbersToTry) {
    try {
      const result = await client.getNumberId(num)
      if (result) {
        return { registered: true, jid: result._serialized }
      }
    } catch {
      // Try next format
    }
  }
  return { registered: false }
}

/**
 * Send a document (e.g. PDF) to a group chat
 */
export async function sendDocumentToGroup(
  groupId: string,
  base64Data: string,
  filename: string,
  mimetype: string,
  caption?: string
): Promise<void> {
  if (!state.client || !state.isConnected) {
    throw new Error('WhatsApp not connected')
  }

  const client = state.client as {
    sendMessage: (chatId: string, content: unknown, options?: Record<string, unknown>) => Promise<unknown>
  }

  console.log(`[WhatsApp] Sending document "${filename}" to group ${groupId}`)

  try {
    const { MessageMedia } = await import('whatsapp-web.js')
    const media = new MessageMedia(mimetype, base64Data, filename)
    await client.sendMessage(groupId, media, {
      caption: caption || undefined,
      sendMediaAsDocument: true,
    })
    console.log(`[WhatsApp] Document "${filename}" sent to group ${groupId}`)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(`[WhatsApp] Failed to send document to group ${groupId}:`, errMsg)
    throw new Error(`Failed to send document: ${errMsg}`)
  }
}

/**
 * Send a document (e.g. PDF) to a contact via WhatsApp
 */
export async function sendDocumentToContact(
  phone: string,
  base64Data: string,
  filename: string,
  mimetype: string,
  caption?: string
): Promise<void> {
  if (!state.client || !state.isConnected) {
    throw new Error('WhatsApp not connected')
  }

  const chatId = phoneToJid(phone)

  const client = state.client as {
    sendMessage: (chatId: string, content: unknown, options?: Record<string, unknown>) => Promise<unknown>
    pupPage?: {
      evaluate: <T>(fn: string) => Promise<T>
    }
  }

  console.log(`[WhatsApp] Sending document "${filename}" to ${chatId}`)

  try {
    const { MessageMedia } = await import('whatsapp-web.js')
    const media = new MessageMedia(mimetype, base64Data, filename)
    await client.sendMessage(chatId, media, {
      caption: caption || undefined,
      sendMediaAsDocument: true,
    })
    console.log(`[WhatsApp] Document "${filename}" sent to ${chatId} via client.sendMessage`)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(`[WhatsApp] Failed to send document to ${chatId}:`, errMsg)
    throw new Error(`Failed to send document: ${errMsg}`)
  }
}

// ── Inbox functions ─────────────────────────────────────────────

export async function getAllChats(): Promise<ChatInfo[]> {
  // Return cached if fresh
  if (chatsCache.length > 0 && Date.now() - lastChatSync < CHAT_CACHE_TTL) {
    return chatsCache
  }

  if (!state.client || !state.isConnected) {
    return []
  }

  const client = state.client as {
    getChats: () => Promise<Array<{
      id: { _serialized: string }
      name: string
      isGroup: boolean
      unreadCount: number
      timestamp: number
      lastMessage?: {
        body: string
        timestamp: number
        fromMe: boolean
        type: string
      }
    }>>
  }

  try {
    const chats = await client.getChats()

    const results: ChatInfo[] = chats.map(chat => ({
      id: chat.id._serialized,
      name: chat.name || chat.id._serialized,
      isGroup: chat.isGroup,
      lastMessage: chat.lastMessage ? {
        body: chat.lastMessage.body || (chat.lastMessage.type !== 'chat' ? `[${chat.lastMessage.type}]` : ''),
        timestamp: chat.lastMessage.timestamp,
        fromMe: chat.lastMessage.fromMe
      } : null,
      unreadCount: chat.unreadCount || 0,
      timestamp: chat.timestamp || 0
    }))

    // Sort by most recent timestamp
    results.sort((a, b) => {
      const tA = a.lastMessage?.timestamp || a.timestamp || 0
      const tB = b.lastMessage?.timestamp || b.timestamp || 0
      return tB - tA
    })

    chatsCache = results
    lastChatSync = Date.now()
    console.log(`[getAllChats] Fetched ${results.length} chats`)
    return results
  } catch (error) {
    const errStr = String(error)
    console.error('[getAllChats] Error:', errStr)
    if (errStr.includes('detached') || errStr.includes('Target closed')) {
      state.isConnected = false
    }
    return chatsCache // Return stale cache on error
  }
}

export async function getChatMessages(chatId: string, limit = 50): Promise<ChatMessage[]> {
  if (!state.client || !state.isConnected) {
    throw new Error('WhatsApp not connected')
  }

  const client = state.client as {
    getChatById: (id: string) => Promise<{
      id: { _serialized: string }
      isGroup: boolean
      fetchMessages: (options: { limit: number }) => Promise<Array<{
        id: { id: string; _serialized: string }
        body: string
        timestamp: number
        fromMe: boolean
        author?: string
        type: string
        hasMedia: boolean
      }>>
    }>
    getContactById: (id: string) => Promise<{
      name?: string
      pushname?: string
    }>
  }

  try {
    const chat = await client.getChatById(chatId)
    const messages = await chat.fetchMessages({ limit })

    // Batch resolve sender names for group messages
    const senderNames = new Map<string, string>()
    if (chat.isGroup) {
      const authors = new Set<string>()
      for (const msg of messages) {
        if (msg.author && !msg.fromMe) {
          authors.add(msg.author)
        }
      }
      // Resolve in parallel, max 20 at a time
      const authorList = [...authors].slice(0, 50)
      const contactPromises = authorList.map(async (authorId) => {
        try {
          const contact = await client.getContactById(authorId)
          senderNames.set(authorId, contact.pushname || contact.name || authorId.replace('@c.us', ''))
        } catch {
          senderNames.set(authorId, authorId.replace('@c.us', ''))
        }
      })
      await Promise.all(contactPromises)
    }

    // Return in chronological order (oldest first)
    const result: ChatMessage[] = messages
      .map(msg => ({
        id: msg.id._serialized || msg.id.id,
        body: msg.body || (msg.type !== 'chat' ? `[${msg.type}]` : ''),
        timestamp: msg.timestamp,
        fromMe: msg.fromMe,
        senderName: msg.author ? (senderNames.get(msg.author) || msg.author.replace('@c.us', '')) : null,
        type: msg.type || 'chat',
        hasMedia: msg.hasMedia || false
      }))
      .sort((a, b) => a.timestamp - b.timestamp)

    console.log(`[getChatMessages] Fetched ${result.length} messages for ${chatId}`)
    return result
  } catch (error) {
    const errStr = String(error)
    console.error(`[getChatMessages] Error for ${chatId}:`, errStr)
    if (errStr.includes('detached') || errStr.includes('Target closed')) {
      state.isConnected = false
    }
    throw error
  }
}

export function phoneToJid(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, '')
  return `${cleaned}@c.us`
}

export function jidToPhone(jid: string): string {
  return jid.replace('@c.us', '').replace('@g.us', '')
}

// Force sync groups - clears cache and fetches fresh data
export async function forceSyncGroups(): Promise<{ success: boolean; groupCount: number; error?: string }> {
  console.log('[forceSyncGroups] Starting force sync...')

  // Clear the cache
  state.groupsCache = []
  state.lastGroupSync = 0

  // If not connected, try to reconnect
  if (!state.isConnected && !state.isConnecting) {
    console.log('[forceSyncGroups] Not connected, attempting to reconnect...')
    try {
      await connectWhatsApp()
      // Wait for connection to establish
      let attempts = 0
      while (!state.isConnected && attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        attempts++
      }
      if (!state.isConnected) {
        return { success: false, groupCount: 0, error: 'Failed to reconnect' }
      }
    } catch (err) {
      return { success: false, groupCount: 0, error: String(err) }
    }
  }

  // Now sync groups
  try {
    await syncGroups()
    return { success: true, groupCount: state.groupsCache.length }
  } catch (err) {
    return { success: false, groupCount: 0, error: String(err) }
  }
}
