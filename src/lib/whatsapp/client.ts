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
      groups = chats.filter(chat => chat.isGroup)
      console.log(`getChats returned ${groups.length} groups`)
    } catch (getChatsError) {
      const errorMsg = String(getChatsError)
      console.log('getChats failed:', errorMsg)

      // If detached frame error, destroy client and trigger reconnect
      if (errorMsg.includes('detached') || errorMsg.includes('Target closed') || errorMsg.includes('context was destroyed')) {
        console.log('[syncGroups] Detected frame detachment, destroying client and reconnecting...')
        state.isConnected = false
        state.isConnecting = false

        // Destroy the current client
        if (state.client) {
          try {
            const c = state.client as { destroy: () => Promise<void> }
            await c.destroy()
          } catch {
            // Ignore destroy errors
          }
          state.client = null
        }

        // Trigger reconnect after a short delay
        setTimeout(() => {
          if (!state.isConnected && !state.isConnecting) {
            console.log('[syncGroups] Triggering reconnect after frame detachment...')
            connectWhatsApp().catch(err => {
              console.error('[syncGroups] Reconnect failed:', err)
            })
          }
        }, 3000)
        return
      }
    }

    // If getChats failed or returned no groups, try pupPage fallback
    if (groups.length === 0 && client.pupPage) {
      // First verify page is still attached
      if (!await isPageAttached()) {
        console.log('[syncGroups] Skipping pupPage fallback - page is detached')
        state.isConnected = false
        return
      }

      console.log('Trying pupPage fallback to get groups...')

      try {
        // First wait for Store to be available
        const storeReady = await client.pupPage.evaluate<boolean>(`
          (async () => {
            const maxWait = 15000;
            const start = Date.now();
            while ((!window.Store || !window.Store.Chat) && Date.now() - start < maxWait) {
              await new Promise(r => setTimeout(r, 500));
            }
            return !!(window.Store && window.Store.Chat);
          })()
        `)

        if (!storeReady) {
          console.log('Store.Chat not available after waiting')
        } else {
          console.log('Store.Chat is available, fetching groups...')

          const rawGroups = await client.pupPage.evaluate<Array<{ id: string; name: string; participantCount: number }>>(`
            (async () => {
              const groups = [];
              try {
                // Try getModelsArray first
                let chats = [];
                if (window.Store.Chat.getModelsArray) {
                  chats = window.Store.Chat.getModelsArray();
                } else if (window.Store.Chat.models) {
                  chats = Array.from(window.Store.Chat.models.values());
                } else if (window.Store.Chat._models) {
                  chats = window.Store.Chat._models;
                }

                console.log('[pupPage] Found ' + chats.length + ' total chats');

                for (const chat of chats) {
                  if (chat.isGroup) {
                    groups.push({
                      id: chat.id._serialized || chat.id.toString(),
                      name: chat.name || chat.formattedTitle || 'Unknown Group',
                      participantCount: chat.groupMetadata?.participants?.length || 0
                    });
                  }
                }
                console.log('[pupPage] Found ' + groups.length + ' groups');
              } catch (e) {
                console.log('[pupPage] Error getting chats:', e);
              }
              return groups;
            })()
          `)

          if (rawGroups && rawGroups.length > 0) {
            groups = rawGroups.map(g => ({
              id: { _serialized: g.id },
              name: g.name,
              isGroup: true,
              groupMetadata: { participants: new Array(g.participantCount) }
            }))
            console.log(`Got ${groups.length} groups via pupPage fallback`)
          } else {
            console.log('pupPage fallback returned no groups')
          }
        }
      } catch (pupPageError) {
        const errorMsg = String(pupPageError)
        console.log('pupPage fallback error:', errorMsg)

        // Check if this is a frame detachment error
        if (errorMsg.includes('detached') || errorMsg.includes('Target closed') || errorMsg.includes('context was destroyed')) {
          console.log('[syncGroups] Frame detached during pupPage fallback, marking disconnected')
          state.isConnected = false
          return
        }
      }
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
      participantCount: g.participantCount
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

  let chatParticipants: Array<{
    id: { _serialized: string; user: string }
    isAdmin: boolean
    isSuperAdmin: boolean
  }> = []

  // Step 1: Clear any cached data using pupPage
  if (client.pupPage) {
    console.log('[getGroupParticipants] Step 1: Clearing WhatsApp Web cache...')
    try {
      await client.pupPage.evaluate(`
        (async () => {
          const groupId = '${groupId}';
          // Clear GroupMetadata cache
          if (window.Store && window.Store.GroupMetadata) {
            const cached = window.Store.GroupMetadata.get(groupId);
            if (cached) {
              window.Store.GroupMetadata.delete(groupId);
              console.log('[pupPage] Cleared GroupMetadata cache');
            }
          }
          return true;
        })()
      `)
    } catch (e) {
      console.log('[getGroupParticipants] Cache clear failed (this is OK):', e)
    }
  }

  // Step 2: Get fresh chat data via getChatById
  console.log('[getGroupParticipants] Step 2: Fetching chat via getChatById...')
  const chat = await client.getChatById(groupId)

  if (!chat.isGroup) {
    throw new Error('Not a group chat')
  }

  // Get participants from the chat object
  chatParticipants = chat.participants || []

  // Also check groupMetadata
  if (chatParticipants.length === 0 && chat.groupMetadata?.participants) {
    chatParticipants = chat.groupMetadata.participants
  }

  console.log(`[getGroupParticipants] getChatById returned ${chatParticipants.length} participants`)

  // Step 3: If still not enough, try pupPage direct query
  if (client.pupPage) {
    console.log('[getGroupParticipants] Step 3: Checking via pupPage for fresh data...')
    try {
      const freshData = await client.pupPage.evaluate(`
        (async () => {
          const groupId = '${groupId}';
          try {
            // Try to get from GroupMetadata.find() which should fetch from server
            if (window.Store && window.Store.GroupMetadata && window.Store.GroupMetadata.find) {
              const meta = await window.Store.GroupMetadata.find(groupId);
              if (meta && meta.participants) {
                const parts = meta.participants._models || meta.participants;
                if (parts && parts.length > 0) {
                  return {
                    count: parts.length,
                    participants: (Array.isArray(parts) ? parts : []).map(p => ({
                      id: { _serialized: p.id?._serialized || p.id?.toString?.() || '', user: p.id?.user || '' },
                      isAdmin: p.isAdmin || false,
                      isSuperAdmin: p.isSuperAdmin || false
                    }))
                  };
                }
              }
            }
            return null;
          } catch (e) {
            return { error: String(e) };
          }
        })()
      `) as { count?: number; participants?: typeof chatParticipants; error?: string } | null

      if (freshData && !freshData.error && freshData.participants && freshData.count) {
        console.log(`[getGroupParticipants] pupPage reports ${freshData.count} participants`)
        // Use pupPage data if it has more participants
        if (freshData.participants.length > chatParticipants.length) {
          chatParticipants = freshData.participants
          console.log(`[getGroupParticipants] Using pupPage data (${chatParticipants.length} participants)`)
        }
      } else if (freshData?.error) {
        console.log(`[getGroupParticipants] pupPage error: ${freshData.error}`)
      }
    } catch (e) {
      console.log('[getGroupParticipants] pupPage query failed:', e)
    }
  }

  console.log(`[getGroupParticipants] Final count: ${chatParticipants.length} participants`)

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

export async function addParticipantToGroup(groupId: string, phone: string): Promise<void> {
  if (!state.client || !state.isConnected) {
    throw new Error('WhatsApp not connected')
  }

  try {
    const client = state.client as {
      getChatById: (id: string) => Promise<{
        addParticipants: (participants: string[], options?: unknown) => Promise<unknown>
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
    const result = await chat.addParticipants([participantId])
    console.log('Add participant result:', result)

    // Wait for WhatsApp to process the change
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Force refresh the group metadata cache using pupPage
    if (client.pupPage) {
      console.log('[addParticipant] Forcing cache refresh...')
      try {
        await client.pupPage.evaluate(`
          (async () => {
            const groupId = '${groupId}';
            if (window.Store && window.Store.GroupMetadata) {
              // Delete cached metadata
              window.Store.GroupMetadata.delete(groupId);
              // Re-fetch from server
              await window.Store.GroupMetadata.find(groupId);
            }
            return true;
          })()
        `)
      } catch (e) {
        console.log('[addParticipant] Cache refresh failed:', e)
      }
    }
  } catch (error) {
    console.error('Add participant error:', error)
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

  try {
    const client = state.client as {
      sendMessage: (chatId: string, content: string) => Promise<unknown>
      pupPage?: {
        evaluate: <T>(fn: string) => Promise<T>
      }
    }

    console.log(`Sending message to group ${groupId}`)

    // Try using pupPage to send directly via WhatsApp's internal API
    if (client.pupPage) {
      console.log('Using pupPage to send message...')
      const result = await client.pupPage.evaluate(`
        (async () => {
          try {
            const chatId = '${groupId}';
            const message = ${JSON.stringify(message)};

            // Get the chat
            const chat = await window.Store.Chat.find(chatId);
            if (!chat) {
              return { error: 'Chat not found' };
            }

            // Send message using WWebJS internal method
            await window.WWebJS.sendMessage(chat, message, {});

            return { success: true };
          } catch (e) {
            return { error: String(e) };
          }
        })()
      `) as { success?: boolean; error?: string }

      if (result.error) {
        console.error('pupPage send error:', result.error)
        throw new Error(result.error)
      }

      console.log('Message sent successfully via pupPage')
      return
    }

    // Fallback to client.sendMessage
    await client.sendMessage(groupId, message)
    console.log('Message sent successfully')
  } catch (error) {
    console.error('Send message error:', error)
    throw error
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
      moduleNumber: null,
      lastMessageDate: null,
      lastMessagePreview: null
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

      // Also use pupPage to search WhatsApp's internal message store for higher modules
      if (client.pupPage) {
        try {
          const currentModule = moduleNumber
          const result = await client.pupPage.evaluate(`
            (async () => {
              const chatId = '${group.id._serialized}';
              const currentHighest = ${moduleNumber || 0};
              try {
                let highestModule = currentHighest || null;
                let highestTimestamp = null;
                let highestBody = null;
                let source = null;

                // Try using WhatsApp's built-in search
                if (window.Store.Search && window.Store.Search.findMessages) {
                  const searchResults = await window.Store.Search.findMessages('module', { chatId });
                  if (searchResults && searchResults.length > 0) {
                    for (const msg of searchResults) {
                      const body = msg.body || '';
                      const match = body.match(/module\\s*(\\d+)/i);
                      if (match) {
                        const num = parseInt(match[1], 10);
                        if (highestModule === null || num > highestModule) {
                          highestModule = num;
                          highestTimestamp = msg.t || msg.timestamp;
                          highestBody = body.substring(0, 100);
                          source = 'search';
                        }
                      }
                    }
                  }
                }

                // Also check loaded messages in case search missed some
                const chat = window.Store.Chat.get(chatId);
                if (chat) {
                  const msgs = chat.msgs?._models || chat.msgs || [];
                  for (const msg of msgs) {
                    const body = msg.body || '';
                    const match = body.match(/module\\s*(\\d+)/i);
                    if (match) {
                      const num = parseInt(match[1], 10);
                      if (highestModule === null || num > highestModule) {
                        highestModule = num;
                        highestTimestamp = msg.t || msg.timestamp;
                        highestBody = body.substring(0, 100);
                        source = 'cache';
                      }
                    }
                  }
                }

                if (highestModule !== null && highestModule > currentHighest) {
                  return {
                    moduleNumber: highestModule,
                    timestamp: highestTimestamp,
                    body: highestBody,
                    source: source
                  };
                }

                return { msgCount: chat?.msgs?.length || 0, currentHighest };
              } catch (e) {
                return { error: String(e) };
              }
            })()
          `) as { moduleNumber?: number; timestamp?: number; body?: string; error?: string; msgCount?: number; source?: string; currentHighest?: number } | null

          if (result && result.moduleNumber && (currentModule === null || result.moduleNumber > currentModule)) {
            moduleNumber = result.moduleNumber
            console.log(`[Module Search] pupPage found higher Module ${result.moduleNumber} via ${result.source}`)
            if (result.timestamp) {
              moduleMessageDate = new Date(result.timestamp * 1000)
            }
            lastMessagePreview = result.body || null
          }
        } catch {
          // pupPage search might fail, that's OK
        }
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

  try {
    const client = state.client as {
      sendMessage: (chatId: string, content: string) => Promise<unknown>
      pupPage?: {
        evaluate: <T>(fn: string) => Promise<T>
      }
    }

    console.log(`Sending private message to ${chatId}`)

    // Try using pupPage to send directly via WhatsApp's internal API
    if (client.pupPage) {
      const result = await client.pupPage.evaluate(`
        (async () => {
          try {
            const chatId = '${chatId}';
            const message = ${JSON.stringify(message)};

            // Get or create the chat
            const chat = await window.Store.Chat.find(chatId);
            if (!chat) {
              return { error: 'Chat not found' };
            }

            // Send message using WWebJS internal method
            await window.WWebJS.sendMessage(chat, message, {});

            return { success: true };
          } catch (e) {
            return { error: String(e) };
          }
        })()
      `) as { success?: boolean; error?: string }

      if (result.error) {
        console.error('pupPage send error:', result.error)
        throw new Error(result.error)
      }

      console.log(`Private message sent to ${chatId} via pupPage`)
      return
    }

    // Fallback to client.sendMessage
    await client.sendMessage(chatId, message)
    console.log(`Private message sent to ${chatId}`)
  } catch (error) {
    console.error(`Send private message error to ${chatId}:`, error)
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
