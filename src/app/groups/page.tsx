'use client'

import { useQuery } from '@tanstack/react-query'
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
import { Loader2, RefreshCw, Link as LinkIcon, Search, User, Users, BookOpen } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useMemo, useEffect, useCallback } from 'react'

interface Group {
  id: string
  name: string
  participantCount: number
  moduleNumber?: number | null
  lastMessageDate?: string | null
  lastMessagePreview?: string | null
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

export default function GroupsPage() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const router = useRouter()

  const {
    data,
    isLoading,
    refetch,
    isFetching
  } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const res = await fetch('/api/groups')
      return res.json()
    }
  })

  // Fetch all participants for person search (prefetch on page load)
  const { data: participantsData, isLoading: isLoadingParticipants } = useQuery<{
    participants: ParticipantWithGroup[]
    isConnected: boolean
  }>({
    queryKey: ['all-participants'],
    queryFn: async () => {
      const res = await fetch('/api/groups/participants')
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })

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
    router.push(`/groups/${encodeURIComponent(participant.groupId)}`)
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

  const groupsByPhase = useMemo(() => {
    if (!data?.groups) return { phase1: [], phase2: [], phase3: [], phase4: [], noPhase: [] }

    const groups = [...data.groups] as Group[]

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
  }, [data?.groups])

  const totalGroups = (data?.groups?.length || 0)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Image
            src="/qazi-logo.png"
            alt="Qazi Driving School"
            width={120}
            height={40}
            className="h-10 w-auto"
          />
          <div className="flex items-center gap-4">
            <ConnectionStatus />
            <Link href="/connect">
              <Button variant="outline" size="sm">
                <LinkIcon className="mr-2 h-4 w-4" />
                Connect
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Your Groups</h2>
              <p className="text-muted-foreground">
                Select a group to manage members
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setOpen(true)}
                className="w-64 justify-start text-muted-foreground"
              >
                <Search className="mr-2 h-4 w-4" />
                Search groups or people...
                <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </Button>
              <Button
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
                />
                Refresh
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
                Loading people ({participantsData?.participants?.length || 0} loaded)...
              </div>
            )}
            {!isLoadingParticipants && participantsData?.participants && (
              <div className="py-2 px-4 text-xs text-muted-foreground border-b">
                {participantsData.participants.length} people available to search
              </div>
            )}
            {/* Only show empty state when there are truly no results */}
            {search.trim() && filteredGroups.length === 0 && filteredParticipants.length === 0 && !isLoadingParticipants && (
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
                      <span className="text-xs text-muted-foreground">
                        {group.participantCount} members
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* People Section */}
            {filteredParticipants.length > 0 && (
              <div className="p-2" key={`people-section-${search}`}>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  People ({filteredParticipants.length} matching &quot;{search}&quot;)
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
          </div>
        </CommandDialog>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : totalGroups > 0 ? (
          <>
            <p className="text-sm text-muted-foreground mb-6">
              Showing {totalGroups} groups
            </p>

            {/* Phase 1: Modules 1-5 */}
            {groupsByPhase.phase1.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm">Phase 1</span>
                  <span className="text-muted-foreground text-sm font-normal">Modules 1-5</span>
                </h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {groupsByPhase.phase1.map((group) => (
                    <GroupCard key={group.id} group={group} />
                  ))}
                </div>
              </div>
            )}

            {/* Phase 2: Modules 6-7 */}
            {groupsByPhase.phase2.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">Phase 2</span>
                  <span className="text-muted-foreground text-sm font-normal">Modules 6-7</span>
                </h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {groupsByPhase.phase2.map((group) => (
                    <GroupCard key={group.id} group={group} />
                  ))}
                </div>
              </div>
            )}

            {/* Phase 3: Modules 8-10 */}
            {groupsByPhase.phase3.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">Phase 3</span>
                  <span className="text-muted-foreground text-sm font-normal">Modules 8-10</span>
                </h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {groupsByPhase.phase3.map((group) => (
                    <GroupCard key={group.id} group={group} />
                  ))}
                </div>
              </div>
            )}

            {/* Phase 4: Modules 11-12 */}
            {groupsByPhase.phase4.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-sm">Phase 4</span>
                  <span className="text-muted-foreground text-sm font-normal">Modules 11-12</span>
                </h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {groupsByPhase.phase4.map((group) => (
                    <GroupCard key={group.id} group={group} />
                  ))}
                </div>
              </div>
            )}

            {/* Groups without module info */}
            {groupsByPhase.noPhase.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm">Other</span>
                  <span className="text-muted-foreground text-sm font-normal">No module info</span>
                </h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {groupsByPhase.noPhase.map((group) => (
                    <GroupCard key={group.id} group={group} />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              No groups found. Make sure WhatsApp is connected.
            </p>
            <Link href="/connect">
              <Button>Connect WhatsApp</Button>
            </Link>
          </div>
        )}

        {data?.fromCache && (
          <p className="text-sm text-muted-foreground mt-4 text-center">
            Showing cached data. Connect to WhatsApp to sync latest groups.
          </p>
        )}
      </main>
    </div>
  )
}
