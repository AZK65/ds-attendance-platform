'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { GroupCard } from '@/components/GroupCard'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { motion, AnimatePresence } from 'motion/react'
import { Loader2, RefreshCw, Link as LinkIcon, Search, User, Users, BookOpen, Phone, Plus, CheckCircle, CalendarDays } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { TruckDaysEditor } from '@/components/TruckDaysEditor'
import { DEFAULT_TRUCK_DAYS, describeTruckDay, TRUCK_THEORY_TARGET_HOURS, type TruckDay } from '@/lib/truck-schedule'

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}

interface Group {
  id: string
  name: string
  participantCount: number
  moduleNumber?: number | null
  vehicleType?: string | null
  lastMessageDate?: string | null
  lastMessagePreview?: string | null
  // Students sent a group invite link who haven't joined yet
  pendingInvites?: number
}

interface ParticipantWithGroup {
  id: string
  phone: string
  name: string | null
  pushName: string | null
  groupId: string
  groupName: string
  moduleNumber: number | null
}

interface ContactResult {
  id: string
  phone: string
  name: string | null
  pushName: string | null
}

export default function GroupsPage() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const router = useRouter()
  const queryClient = useQueryClient()

  // Tab — segregates the page between Class 5 (Car) cohorts and Class 1
  // (Truck) cohorts. Defaults to Car since the existing fleet of groups
  // is overwhelmingly car groups.
  const [activeTab, setActiveTab] = useState<'car' | 'truck'>('car')
  // Toggle "Archived" view — fetches ?archivedOnly=1 so the list shows only
  // archived groups, from which admin can unarchive or hard-delete.
  const [showArchived, setShowArchived] = useState(false)
  // Per-row 3-dot menu open + delete confirmation dialog.
  const [rowMenuOpenId, setRowMenuOpenId] = useState<string | null>(null)
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<{ id: string; name: string } | null>(null)

  // New Group dialog state
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [selectedPending, setSelectedPending] = useState<Set<string>>(new Set())
  const [newGroupLoading, setNewGroupLoading] = useState(false)
  const [newGroupResult, setNewGroupResult] = useState<{ success: boolean; message: string; groupId?: string } | null>(null)

  // Class setup state (after group creation)
  const [showClassSetup, setShowClassSetup] = useState(false)
  const [classSetupGroupId, setClassSetupGroupId] = useState('')
  const [classSetupPhones, setClassSetupPhones] = useState<string[]>([])
  const [classSetupModule, setClassSetupModule] = useState(1)
  const [classSetupDate, setClassSetupDate] = useState('')
  const [classSetupTime, setClassSetupTime] = useState('5 pm to 7 pm')
  const [classSetupWeeks, setClassSetupWeeks] = useState(5) // schedule N weekly classes from start date
  const [classSetupSendPdf, setClassSetupSendPdf] = useState(false)
  const [classSetupPdfBase64, setClassSetupPdfBase64] = useState('')
  const [classSetupPdfName, setClassSetupPdfName] = useState('')
  const [classSetupSetDesc, setClassSetupSetDesc] = useState(true)
  const [classSetupResults, setClassSetupResults] = useState<Array<{ action: string; status: string }> | null>(null)
  const [classSetupLoading, setClassSetupLoading] = useState(false)

  // Which program the just-created group is for. Captured when the group is
  // created rather than read from `activeTab`, so switching tabs while the
  // setup dialog is open can't retarget the schedule.
  const [classSetupVehicle, setClassSetupVehicle] = useState<'car' | 'truck'>('car')
  // Class 1 timetable: Tue/Thu evening theory + a full Saturday yard + road
  // day, 17 h/week in person. 24 classes ≈ the program's 125 h.
  const [classSetupTheoryHours, setClassSetupTheoryHours] = useState(TRUCK_THEORY_TARGET_HOURS)
  const [classSetupDays, setClassSetupDays] = useState<TruckDay[]>(DEFAULT_TRUCK_DAYS)
  const [classSetupTeacher, setClassSetupTeacher] = useState('')
  const [teacherOptions, setTeacherOptions] = useState<Array<{ id: number; name: string }>>([])
  const isTruckSetup = classSetupVehicle === 'truck'

  // Teacher list for the schedule. Defaults to the calendar each program has
  // always used (car → Fayyaz, truck → Nasar) so behaviour is unchanged
  // unless someone picks another teacher.
  useEffect(() => {
    if (!showClassSetup) return
    let cancelled = false
    fetch('/api/scheduling/subcalendars')
      .then(r => (r.ok ? r.json() : []))
      .then((data: Array<{ id: number; name: string; active: boolean }>) => {
        if (cancelled || !Array.isArray(data)) return
        const active = data.filter(s => s.active).map(s => ({ id: s.id, name: s.name }))
        setTeacherOptions(active)
        const want = isTruckSetup ? 'nasar' : 'fayyaz'
        const match = active.find(t => t.name.toLowerCase().includes(want))
        if (match) setClassSetupTeacher(String(match.id))
        else if (active.length > 0) setClassSetupTeacher(String(active[0].id))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [showClassSetup, isTruckSetup])


  // Fetch pending students (not in any group)
  const { data: pendingData } = useQuery<{ students: Array<{ id: string; phone: string; name: string | null; createdAt: string; vehicleType?: string }> }>({
    queryKey: ['pending-students'],
    queryFn: async () => {
      const res = await fetch('/api/students/pending')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    enabled: showNewGroup,
  })

  // Only offer students who belong to the cohort being created: a Class 1
  // group should never list Class 5 students. Truck-ness comes from the
  // student's truck registration (see @/lib/truck-students).
  const pendingForTab = useMemo(() => {
    const all = pendingData?.students ?? []
    return all.filter(s => (s.vehicleType === 'truck' ? 'truck' : 'car') === activeTab)
  }, [pendingData, activeTab])

  // Debounce search for contact API calls
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const {
    data,
    isLoading,
    refetch,
    isFetching
  } = useQuery({
    queryKey: ['groups', showArchived],
    queryFn: async () => {
      const qs = showArchived ? '?archivedOnly=1' : ''
      const res = await fetch(`/api/groups${qs}`)
      return res.json()
    },
    staleTime: 60 * 60 * 1000,        // 1 hour — data is fresh for a long time
    gcTime: 2 * 60 * 60 * 1000,       // 2 hours — keep in cache even longer
    refetchInterval: 60 * 60 * 1000,   // Background refresh every hour
  })

  const archiveMutation = useMutation({
    mutationFn: async (args: { groupId: string; action: 'archive' | 'unarchive' }) => {
      const res = await fetch(`/api/groups/${encodeURIComponent(args.groupId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: args.action }),
      })
      if (!res.ok) throw new Error('Archive toggle failed')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })
  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      setDeleteGroupConfirm(null)
    },
  })

  // Batch-fetch the next theory class for every group in one Teamup round trip
  const groupNamesForTheory = useMemo(
    () => (data?.groups || []).map((g: { name: string }) => g.name),
    [data?.groups],
  )
  const { data: nextTheoryData } = useQuery({
    queryKey: ['groups-next-theory', groupNamesForTheory],
    queryFn: async () => {
      const res = await fetch('/api/scheduling/groups-next-theory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupNames: groupNamesForTheory }),
      })
      if (!res.ok) return { results: {} }
      return res.json() as Promise<{
        results: Record<string, { date: string; endDate: string | null; title: string; module: number | null } | null>
      }>
    },
    enabled: groupNamesForTheory.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // Force sync mutation - reconnects if needed and syncs fresh data
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/groups/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      return data
    },
    onSuccess: () => {
      // Invalidate and refetch groups after sync
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['all-participants'] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] })
    }
  })

  const handleRefresh = () => {
    // Use force sync if not connected, otherwise just refetch
    if (!data?.isConnected) {
      syncMutation.mutate()
    } else {
      refetch()
    }
  }

  const isRefreshing = isFetching || syncMutation.isPending

  // Fetch all participants for person search (prefetch on page load)
  const { data: participantsData, isLoading: isLoadingParticipants } = useQuery({
    queryKey: ['all-participants'],
    queryFn: async (): Promise<{ participants: ParticipantWithGroup[]; isConnected: boolean }> => {
      const res = await fetch('/api/groups/participants')
      return res.json() as Promise<{ participants: ParticipantWithGroup[]; isConnected: boolean }>
    },
    staleTime: 60 * 60 * 1000,        // 1 hour
    gcTime: 2 * 60 * 60 * 1000,       // 2 hours
    refetchInterval: 60 * 60 * 1000,   // Background refresh every hour
  })

  // Fetch WhatsApp contacts based on search (same API as scheduling page)
  const { data: contactsData, isLoading: isLoadingContacts } = useQuery({
    queryKey: ['contact-search', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ search: debouncedSearch })
      const res = await fetch(`/api/contacts?${params}`)
      if (!res.ok) return { contacts: [] }
      return res.json() as Promise<{ contacts: ContactResult[] }>
    },
    enabled: debouncedSearch.length >= 2,
    staleTime: 30 * 1000,
  })

  // Filter contacts (keep all — some may also be group members)
  const filteredContacts = useMemo(() => {
    if (!contactsData?.contacts || !search.trim()) return []
    return contactsData.contacts.slice(0, 10)
  }, [contactsData?.contacts, search])

  // Keyboard shortcut to open search
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  // Filter participants based on search
  const filteredParticipants = useMemo(() => {
    if (!search.trim() || !participantsData?.participants) {
      return []
    }

    const searchLower = search.toLowerCase().trim()
    const seen = new Set<string>()

    const results = (participantsData.participants as ParticipantWithGroup[])
      .filter(p => {
        const displayName = p.name || p.pushName || ''
        const matchesName = displayName.toLowerCase().includes(searchLower)
        const matchesPhone = p.phone.includes(search.replace(/\D/g, ''))

        if (!matchesName && !matchesPhone) return false

        // Dedupe by phone+group to avoid showing same person multiple times in same group
        const key = `${p.phone}-${p.groupId}`
        if (seen.has(key)) return false
        seen.add(key)

        return true
      })
      .slice(0, 10) // Limit to 10 results

    // Debug logging
    if (search.trim()) {
      console.log('Search:', search, 'Found participants:', results.length, 'Names:', results.map(r => r.name || r.pushName).join(', '))
    }

    return results
  }, [search, participantsData?.participants])

  // Filter groups based on search
  const filteredGroups = useMemo(() => {
    if (!search.trim() || !data?.groups) return []

    const searchLower = search.toLowerCase()
    return (data.groups as Group[])
      .filter(g =>
        (g.name && g.name.toLowerCase().includes(searchLower)) ||
        (g.moduleNumber && `module ${g.moduleNumber}`.includes(searchLower))
      )
      .slice(0, 5) // Limit to 5 results
  }, [search, data?.groups])

  const handleSelectGroup = useCallback((groupId: string) => {
    setOpen(false)
    setSearch('')
    router.push(`/groups/${encodeURIComponent(groupId)}`)
  }, [router])

  const handleSelectPerson = useCallback((participant: ParticipantWithGroup) => {
    setOpen(false)
    setSearch('')
    router.push(`/groups/${encodeURIComponent(participant.groupId)}/student/${encodeURIComponent(participant.id)}`)
  }, [router])

  // Helper to get phase from module number
  const getPhase = (moduleNumber: number | null | undefined): number | null => {
    if (!moduleNumber) return null
    if (moduleNumber >= 1 && moduleNumber <= 5) return 1
    if (moduleNumber >= 6 && moduleNumber <= 7) return 2
    if (moduleNumber >= 8 && moduleNumber <= 10) return 3
    if (moduleNumber >= 11 && moduleNumber <= 12) return 4
    return null
  }

  // Counts for the tab labels — computed off the full group list so the
  // "Truck (3)" badge stays correct regardless of which tab is active.
  const tabCounts = useMemo(() => {
    const all = (data?.groups || []) as Group[]
    let car = 0, truck = 0
    for (const g of all) {
      if (g.vehicleType === 'truck') truck++
      else car++
    }
    return { car, truck }
  }, [data?.groups])

  const groupsByPhase = useMemo(() => {
    if (!data?.groups) return { phase1: [], phase2: [], phase3: [], phase4: [], noPhase: [] }

    // Filter by active tab first. Anything with no vehicleType on the
    // record defaults to 'car' on the server side — but we double-check
    // here so legacy groups still appear in the Car tab.
    const groups = ([...data.groups] as Group[]).filter(g => {
      const t = g.vehicleType || 'car'
      return t === activeTab
    })

    // Sort within each phase by module number (ascending) then by name
    const sortGroups = (groupList: Group[]) => {
      return groupList.sort((a, b) => {
        if (a.moduleNumber && b.moduleNumber) {
          return a.moduleNumber - b.moduleNumber
        }
        return (a.name || '').localeCompare(b.name || '')
      })
    }

    const phase1 = sortGroups(groups.filter(g => getPhase(g.moduleNumber) === 1))
    const phase2 = sortGroups(groups.filter(g => getPhase(g.moduleNumber) === 2))
    const phase3 = sortGroups(groups.filter(g => getPhase(g.moduleNumber) === 3))
    const phase4 = sortGroups(groups.filter(g => getPhase(g.moduleNumber) === 4))
    const noPhase = groups.filter(g => getPhase(g.moduleNumber) === null).sort((a, b) => (a.name || '').localeCompare(b.name || ''))

    return { phase1, phase2, phase3, phase4, noPhase }
  }, [data?.groups, activeTab])

  const totalGroups = activeTab === 'car' ? tabCounts.car : tabCounts.truck

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Your Groups</h2>
              <p className="text-muted-foreground">
                Select a group to manage members
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setOpen(true)}
                className="w-full sm:w-64 justify-start text-muted-foreground"
              >
                <Search className="mr-2 h-4 w-4" />
                Search groups or people...
                <kbd className="pointer-events-none ml-auto hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </Button>
              <Button onClick={() => {
                setShowNewGroup(true)
                setNewGroupName('')
                setSelectedPending(new Set())
                setNewGroupResult(null)
              }}>
                <Plus className="mr-2 h-4 w-4" />
                New Group
              </Button>
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                />
                {syncMutation.isPending ? 'Syncing...' : 'Refresh'}
              </Button>
            </div>
          </div>
        </div>

        {/* Command Dialog for Search */}
        <CommandDialog
          open={open}
          onOpenChange={setOpen}
          title="Search"
          description="Search for groups or people"
          shouldFilter={false}
          className="max-w-2xl"
        >
          <div className="flex h-12 items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <input
              type="text"
              placeholder="Search groups or people..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              autoFocus
            />
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            {/* Loading indicator */}
            {isLoadingParticipants && (
              <div className="py-3 px-4 text-center text-sm text-muted-foreground border-b">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                Loading people...
              </div>
            )}
            {!isLoadingParticipants && participantsData?.participants && (
              <div className="py-2 px-4 text-xs text-muted-foreground border-b">
                {participantsData.participants.length} people available to search
              </div>
            )}
            {/* Only show empty state when there are truly no results */}
            {search.trim() && filteredGroups.length === 0 && filteredParticipants.length === 0 && filteredContacts.length === 0 && !isLoadingParticipants && !isLoadingContacts && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No results found for &quot;{search}&quot;
              </div>
            )}
            {!search.trim() && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Start typing to search...
              </div>
            )}

            {/* Groups Section */}
            {filteredGroups.length > 0 && (
              <div className="p-2">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Groups</div>
                {filteredGroups.map((group) => (
                  <div
                    key={group.id}
                    onClick={() => handleSelectGroup(group.id)}
                    className="flex items-center justify-between py-3 px-2 rounded-sm cursor-pointer hover:bg-accent"
                  >
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{group.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {group.moduleNumber && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          Module {group.moduleNumber}
                        </span>
                      )}
                      {(group.pendingInvites ?? 0) > 0 && (
                        <span
                          className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded"
                          title="Invite link sent — not joined yet"
                        >
                          {group.pendingInvites} pending
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {group.participantCount} members
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* People Section (Group Members) */}
            {filteredParticipants.length > 0 && (
              <div className="p-2" key={`people-section-${search}`}>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Group Members ({filteredParticipants.length} matching &quot;{search}&quot;)
                </div>
                {filteredParticipants.map((participant, index) => (
                  <div
                    key={`${search}-${index}-${participant.phone}-${participant.groupId}`}
                    onClick={() => handleSelectPerson(participant)}
                    className="flex items-center justify-between py-3 px-2 rounded-sm cursor-pointer hover:bg-accent"
                  >
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {participant.name || participant.pushName || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          +{participant.phone}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        <span className="max-w-[120px] truncate">{participant.groupName}</span>
                      </div>
                      {participant.moduleNumber && (
                        <div className="flex items-center gap-1 text-xs text-blue-600 mt-0.5">
                          <BookOpen className="h-3 w-3" />
                          Module {participant.moduleNumber}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* WhatsApp Contacts Section (not in any group) */}
            {filteredContacts.length > 0 && (
              <div className="p-2" key={`contacts-section-${debouncedSearch}`}>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  WhatsApp Contacts ({filteredContacts.length})
                </div>
                {filteredContacts.map((contact, index) => {
                  // Check if this contact is in any group
                  const groupMatch = (participantsData?.participants || []).find(
                    (p: ParticipantWithGroup) => p.phone === contact.phone
                  )
                  return (
                    <div
                      key={`contact-${index}-${contact.phone}`}
                      onClick={() => {
                        setOpen(false)
                        setSearch('')
                        if (groupMatch) {
                          router.push(`/groups/${encodeURIComponent(groupMatch.groupId)}/student/${encodeURIComponent(contact.id)}`)
                        } else {
                          const name = contact.name || contact.pushName || ''
                          router.push(`/scheduling?bookFor=${encodeURIComponent(name)}&phone=${encodeURIComponent(contact.phone)}`)
                        }
                      }}
                      className="flex items-center justify-between py-3 px-2 rounded-sm cursor-pointer hover:bg-accent"
                    >
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            {contact.name || contact.pushName || 'Unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            +{contact.phone}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {groupMatch ? (
                          <>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Users className="h-3 w-3" />
                              <span className="max-w-[120px] truncate">{groupMatch.groupName}</span>
                            </div>
                            {groupMatch.moduleNumber && (
                              <div className="flex items-center gap-1 text-xs text-blue-600 mt-0.5">
                                <BookOpen className="h-3 w-3" />
                                Module {groupMatch.moduleNumber}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Book Class →</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {isLoadingContacts && debouncedSearch.length >= 2 && filteredParticipants.length === 0 && (
              <div className="py-3 px-4 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                Searching contacts...
              </div>
            )}
          </div>
        </CommandDialog>

        {/* Car / Truck tabs */}
        <div className="mb-6 flex items-center gap-2 border-b pb-1">
          {([
            { key: 'car' as const, label: 'Car', count: tabCounts.car },
            { key: 'truck' as const, label: 'Truck', count: tabCounts.truck },
          ]).map(tab => {
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`relative px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="flex items-center gap-2">
                  {tab.label}
                  <span className={`inline-flex items-center justify-center text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                    active ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
                  }`}>
                    {tab.count}
                  </span>
                </span>
                {active && (
                  <motion.div
                    layoutId="groupsTab"
                    className="absolute bottom-[-5px] left-0 right-0 h-[2px] bg-foreground"
                  />
                )}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setShowArchived(v => !v)}
            className={`ml-auto text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              showArchived
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
                : 'text-muted-foreground hover:bg-muted'
            }`}
            title={showArchived ? 'Viewing archived groups — click to return to active groups' : 'Show archived groups'}
          >
            {showArchived ? '← Back to active' : 'Archived'}
          </button>
        </div>

        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              className="flex items-center justify-center py-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </motion.div>
          ) : totalGroups > 0 ? (
            <motion.div
              key="groups"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-sm text-muted-foreground mb-6">
                Showing {totalGroups} groups
              </p>

              {/* Phase 1: Modules 1-5 */}
              {groupsByPhase.phase1.length > 0 && (
                <motion.div
                  className="mb-8"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm">Phase 1</span>
                    <span className="text-muted-foreground text-sm font-normal">Modules 1-5</span>
                  </h3>
                  <motion.div
                    className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                  >
                    {groupsByPhase.phase1.map((group) => (
                      <GroupCard key={group.id} group={group} nextTheory={nextTheoryData?.results?.[group.name] || null} />
                    ))}
                  </motion.div>
                </motion.div>
              )}

              {/* Phase 2: Modules 6-7 */}
              {groupsByPhase.phase2.length > 0 && (
                <motion.div
                  className="mb-8"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">Phase 2</span>
                    <span className="text-muted-foreground text-sm font-normal">Modules 6-7</span>
                  </h3>
                  <motion.div
                    className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                  >
                    {groupsByPhase.phase2.map((group) => (
                      <GroupCard key={group.id} group={group} nextTheory={nextTheoryData?.results?.[group.name] || null} />
                    ))}
                  </motion.div>
                </motion.div>
              )}

              {/* Phase 3: Modules 8-10 */}
              {groupsByPhase.phase3.length > 0 && (
                <motion.div
                  className="mb-8"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                >
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">Phase 3</span>
                    <span className="text-muted-foreground text-sm font-normal">Modules 8-10</span>
                  </h3>
                  <motion.div
                    className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                  >
                    {groupsByPhase.phase3.map((group) => (
                      <GroupCard key={group.id} group={group} nextTheory={nextTheoryData?.results?.[group.name] || null} />
                    ))}
                  </motion.div>
                </motion.div>
              )}

              {/* Phase 4: Modules 11-12 */}
              {groupsByPhase.phase4.length > 0 && (
                <motion.div
                  className="mb-8"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                >
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-sm">Phase 4</span>
                    <span className="text-muted-foreground text-sm font-normal">Modules 11-12</span>
                  </h3>
                  <motion.div
                    className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                  >
                    {groupsByPhase.phase4.map((group) => (
                      <GroupCard key={group.id} group={group} nextTheory={nextTheoryData?.results?.[group.name] || null} />
                    ))}
                  </motion.div>
                </motion.div>
              )}

              {/* Groups without module info */}
              {groupsByPhase.noPhase.length > 0 && (
                <motion.div
                  className="mb-8"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 }}
                >
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm">Other</span>
                    <span className="text-muted-foreground text-sm font-normal">No module info</span>
                  </h3>
                  <motion.div
                    className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                  >
                    {groupsByPhase.noPhase.map((group) => (
                      <GroupCard key={group.id} group={group} nextTheory={nextTheoryData?.results?.[group.name] || null} />
                    ))}
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              className="text-center py-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-muted-foreground mb-4">
                No groups found. Make sure you are connected.
              </p>
              <Link href="/connect">
                <Button>Connect</Button>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>

        {data?.fromCache && (
          <p className="text-sm text-muted-foreground mt-4 text-center">
            Showing cached data. Connect to sync latest groups.
          </p>
        )}

        {/* New Group Dialog */}
        <Dialog open={showNewGroup} onOpenChange={(o) => { if (!o && !newGroupLoading) setShowNewGroup(false) }}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Create New {activeTab === 'truck' ? 'Truck' : 'Car'} Group
              </DialogTitle>
              <DialogDescription>
                {activeTab === 'truck'
                  ? 'Creates a Class 1 (Truck) cohort group. Truck students from your pending list will be added.'
                  : 'Creates a Class 5 (Car) theory cohort. Walks you through schedule + reminders after.'}
              </DialogDescription>
            </DialogHeader>

            {!newGroupResult ? (
              <div className="space-y-4 py-2">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Group Name</Label>
                  <Input
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    placeholder="e.g. Qazi Theory Class #108"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">
                      Pending {activeTab === 'truck' ? 'Class 1 (Truck)' : 'Class 5 (Car)'} Students
                    </Label>
                    {pendingForTab.length > 0 && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => setSelectedPending(new Set(pendingForTab.map(s => s.phone)))}
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:underline"
                          onClick={() => setSelectedPending(new Set())}
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  {!pendingData ? (
                    <div className="flex items-center justify-center py-6 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...
                    </div>
                  ) : pendingForTab.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {activeTab === 'truck'
                        ? 'No pending Class 1 students. Truck students appear here once they have a Class 1 registration and are not yet in a group.'
                        : 'No pending students. Create students first from the Students page.'}
                    </p>
                  ) : (
                    <div className="max-h-[250px] overflow-y-auto border rounded-md divide-y">
                      {pendingForTab.map(s => (
                        <label
                          key={s.id}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-accent transition-colors ${
                            selectedPending.has(s.phone) ? 'bg-primary/5' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedPending.has(s.phone)}
                            onChange={e => {
                              const next = new Set(selectedPending)
                              if (e.target.checked) next.add(s.phone)
                              else next.delete(s.phone)
                              setSelectedPending(next)
                            }}
                            className="rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{s.name || s.phone}</p>
                            {s.name && <p className="text-xs text-muted-foreground">{s.phone}</p>}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedPending.size} selected
                  </p>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowNewGroup(false)}>Cancel</Button>
                  <Button
                    disabled={!newGroupName.trim() || selectedPending.size === 0 || newGroupLoading}
                    onClick={async () => {
                      setNewGroupLoading(true)
                      try {
                        // Create WhatsApp group with first student
                        const phones = Array.from(selectedPending)
                        const res = await fetch('/api/groups/create', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          // Tag the new group with whichever tab is active when the
                          // wizard was opened so it lands in the right list immediately.
                          body: JSON.stringify({ name: newGroupName.trim(), participants: phones, vehicleType: activeTab }),
                        })
                        if (!res.ok) {
                          const err = await res.json()
                          throw new Error(err.error || 'Failed to create group')
                        }
                        const data = await res.json()

                        // Add remaining students to group (first one is already added by create)
                        // The create endpoint already adds all participants, but let's
                        // also send invite links for those who couldn't be added directly
                        setNewGroupResult({
                          success: true,
                          message: `Group "${newGroupName}" created with ${phones.length} student(s)!`,
                          groupId: data.groupId,
                        })

                        // Set up for class setup dialog
                        setClassSetupGroupId(data.groupId)
                        setClassSetupPhones(phones)
                        setClassSetupResults(null)
                        // Remember which program this group is, so the schedule
                        // step builds the right kind of timetable.
                        setClassSetupVehicle(activeTab)
                        if (activeTab === 'truck') setClassSetupTime('5:30 PM to 9:30 PM')

                        queryClient.invalidateQueries({ queryKey: ['groups'] })
                        queryClient.invalidateQueries({ queryKey: ['pending-students'] })
                      } catch (err) {
                        setNewGroupResult({
                          success: false,
                          message: err instanceof Error ? err.message : 'Failed to create group',
                        })
                      } finally {
                        setNewGroupLoading(false)
                      }
                    }}
                  >
                    {newGroupLoading ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating...</>
                    ) : (
                      <><Plus className="h-4 w-4 mr-2" />Create Group ({selectedPending.size} students)</>
                    )}
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-2">
                  {newGroupResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <div className="h-5 w-5 text-red-600">!</div>
                  )}
                  <span className={`font-medium ${newGroupResult.success ? '' : 'text-destructive'}`}>
                    {newGroupResult.message}
                  </span>
                </div>
                <DialogFooter>
                  {newGroupResult.success && newGroupResult.groupId && (
                    <Button onClick={() => {
                      setShowNewGroup(false)
                      setShowClassSetup(true)
                    }}>
                      <CalendarDays className="h-4 w-4 mr-2" />
                      Setup Class
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setShowNewGroup(false)}>
                    {newGroupResult.success ? 'Skip' : 'Close'}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Class Setup Dialog (after group creation) */}
        <Dialog open={showClassSetup} onOpenChange={(o) => { if (!o && !classSetupLoading) { setShowClassSetup(false); setClassSetupResults(null) } }}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Setup Class
              </DialogTitle>
              <DialogDescription>
                Set group description, send course book, and schedule the first class.
              </DialogDescription>
            </DialogHeader>

            {!classSetupResults ? (
              <div className="space-y-5 py-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="gSetupDesc" checked={classSetupSetDesc} onChange={e => setClassSetupSetDesc(e.target.checked)} className="rounded" />
                    <Label htmlFor="gSetupDesc" className="text-sm font-medium cursor-pointer">
                      {isTruckSetup ? 'Set group description with the class schedule' : 'Set group description with Zoom links'}
                    </Label>
                  </div>
                  {classSetupSetDesc && (
                    <p className="text-xs text-muted-foreground ml-6">
                      {isTruckSetup ? 'Class days, time, and where classes are held' : 'iOS + Android + Desktop Zoom links and password'}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="gSetupPdf" checked={classSetupSendPdf} onChange={e => setClassSetupSendPdf(e.target.checked)} className="rounded" />
                    <Label htmlFor="gSetupPdf" className="text-sm font-medium cursor-pointer">Send course book PDF</Label>
                  </div>
                  {classSetupSendPdf && (
                    <div className="ml-6">
                      <input type="file" accept=".pdf" onChange={e => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setClassSetupPdfName(file.name)
                        const reader = new FileReader()
                        reader.onload = () => setClassSetupPdfBase64((reader.result as string).split(',')[1])
                        reader.readAsDataURL(file)
                      }} className="text-sm" />
                      {classSetupPdfName && <p className="text-xs text-green-600 mt-1">{classSetupPdfName} ready</p>}
                    </div>
                  )}
                </div>

                <div className="space-y-3 border-t pt-4">
                  <Label className="text-sm font-medium">
                    {isTruckSetup ? 'Schedule Class 1 Theory' : 'Schedule Classes'}
                  </Label>

                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Teacher</Label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                      value={classSetupTeacher}
                      onChange={e => setClassSetupTeacher(e.target.value)}
                    >
                      {teacherOptions.length === 0 && <option value="">Loading teachers…</option>}
                      {teacherOptions.map(t => (
                        <option key={t.id} value={String(t.id)}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {isTruckSetup ? (
                      // Truck sets its hour target inside the timetable editor
                      // below; the class count falls out of the hours.
                      <div />
                    ) : (
                      <>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">First Module</Label>
                          <Input type="number" min={1} max={12} value={classSetupModule} onChange={e => setClassSetupModule(parseInt(e.target.value) || 1)} />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">Weeks to schedule</Label>
                          <Input type="number" min={1} max={12} value={classSetupWeeks} onChange={e => setClassSetupWeeks(Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))} />
                        </div>
                      </>
                    )}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">First Class Date</Label>
                      <Input type="date" value={classSetupDate} onChange={e => setClassSetupDate(e.target.value)} />
                    </div>
                    {!isTruckSetup && (
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Time</Label>
                        <Input value={classSetupTime} onChange={e => setClassSetupTime(e.target.value)} placeholder="5 pm to 7 pm" />
                      </div>
                    )}
                  </div>

                  {/* Truck times are per-day (evening theory vs full Saturday),
                      so the single Time field above doesn't apply. */}
                  {isTruckSetup && (
                    <TruckDaysEditor
                      value={classSetupDays}
                      onChange={setClassSetupDays}
                      targetHours={classSetupTheoryHours}
                      onTargetHoursChange={setClassSetupTheoryHours}
                      startDate={classSetupDate}
                    />
                  )}

                  {!isTruckSetup && classSetupDate && classSetupWeeks > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Will schedule {classSetupWeeks} weekly classes starting {classSetupDate}: Modules {classSetupModule}–{Math.min(12, classSetupModule + classSetupWeeks - 1)}.
                    </p>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => { setShowClassSetup(false); setClassSetupResults(null) }}>Skip</Button>
                  <Button
                    disabled={classSetupLoading || (!classSetupSetDesc && !classSetupSendPdf && !classSetupDate)}
                    onClick={async () => {
                      setClassSetupLoading(true)
                      try {
                        let classDateFormatted = ''
                        if (classSetupDate) {
                          const [y, m, d] = classSetupDate.split('-').map(Number)
                          classDateFormatted = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                        }
                        // Class 1 theory is taught in the classroom, so the Zoom
                        // blurb would be wrong on a truck group's description.
                        const description = !classSetupSetDesc
                          ? undefined
                          : isTruckSetup
                            ? `Class 1 — Weekly schedule\n\n${classSetupDays.map(d => describeTruckDay(d)).join('\n')}\n\nAll classes are IN PERSON at the school.`
                            : `Zoom Meeting Link:\n\niOS/Android App:\nzoom.us/j/4171672829\nMeeting ID: 417 167 2829\nPassword: qazi\n\nDesktop/Browser:\nhttps://us02web.zoom.us/j/4171672829?pwd=ZTlHSEdmTGRYV1QraU5MaThqaC9Rdz09\nPassword: qazi`
                        const res = await fetch(`/api/groups/${encodeURIComponent(classSetupGroupId)}/setup`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            setDescription: classSetupSetDesc, description,
                            sendPdf: classSetupSendPdf && classSetupPdfBase64, pdfBase64: classSetupPdfBase64, pdfFilename: classSetupPdfName,
                            memberPhones: classSetupPhones,
                            scheduleClass: !!classSetupDate,
                            vehicleType: classSetupVehicle,
                            subcalendarId: classSetupTeacher ? parseInt(classSetupTeacher) : undefined,
                            ...(isTruckSetup
                              ? { truckTheoryHours: classSetupTheoryHours, truckDays: classSetupDays }
                              : { moduleNumber: classSetupModule, weeksToSchedule: classSetupWeeks }),
                            classDate: classDateFormatted, classDateISO: classSetupDate, classTime: classSetupTime,
                          }),
                        })
                        if (res.ok) {
                          const d = await res.json()
                          setClassSetupResults(d.results || [])
                        } else {
                          const err = await res.json()
                          setClassSetupResults([{ action: 'Setup', status: `Error: ${err.error}` }])
                        }
                      } catch (err) {
                        setClassSetupResults([{ action: 'Setup', status: `Error: ${err instanceof Error ? err.message : 'unknown'}` }])
                      } finally {
                        setClassSetupLoading(false)
                      }
                    }}
                  >
                    {classSetupLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Setting up...</> : 'Setup & Send'}
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-medium">Setup Complete</span>
                </div>
                <div className="border rounded-md divide-y">
                  {classSetupResults.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>{r.action}</span>
                      <span className={`text-xs ${r.status.includes('Failed') || r.status.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>{r.status}</span>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button onClick={() => { setShowClassSetup(false); setClassSetupResults(null) }}>Done</Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
