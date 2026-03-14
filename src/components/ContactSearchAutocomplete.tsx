'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Phone, User, Users, BookOpen, WifiOff, FileText } from 'lucide-react'

interface Contact {
  id: string
  phone: string
  name: string | null
  pushName: string | null
  source?: string // 'student' when from Student table (invoice data)
}

interface ParticipantWithGroup {
  id: string
  phone: string
  name: string | null
  pushName: string | null
  groupId: string
  groupName: string
  moduleNumber: number | null
  lastMessageDate: string | null
}

export interface StudentGroupInfo {
  groupName: string
  lastTheoryModule: number | null
  lastTheoryDate: string | null
}

interface ContactSearchAutocompleteProps {
  value: string
  phone: string
  group: string
  onSelect: (name: string, phone: string, groupInfo: StudentGroupInfo) => void
  onChange: (name: string) => void
  placeholder?: string
}

export function ContactSearchAutocomplete({
  value,
  phone,
  group,
  onSelect,
  onChange,
  placeholder = "Search WhatsApp contacts or type name",
}: ContactSearchAutocompleteProps) {
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Debounce search term
  useEffect(() => {
    if (!value || value.length < 2) {
      setDebouncedSearch('')
      return
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(value)
    }, 300)
    return () => clearTimeout(timer)
  }, [value])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fetch contacts from basic search
  const { data: contactsData, isLoading: loadingContacts } = useQuery({
    queryKey: ['contact-search', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ search: debouncedSearch })
      const res = await fetch(`/api/contacts?${params}`)
      if (!res.ok) return { contacts: [] }
      return res.json()
    },
    enabled: debouncedSearch.length >= 2,
  })

  // Fetch all group participants (cached, one-time load)
  const { data: participantsData } = useQuery<{ participants: ParticipantWithGroup[] }>({
    queryKey: ['group-participants-all'],
    queryFn: async () => {
      const res = await fetch('/api/groups/participants')
      if (!res.ok) return { participants: [] }
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const contacts: Contact[] = contactsData?.contacts || []
  const isDisconnected = contactsData?.disconnected === true
  const groupParticipants = participantsData?.participants || []

  // Build a phone → groups map for quick lookup
  const phoneToGroups = useMemo(() => {
    const map = new Map<string, ParticipantWithGroup[]>()
    for (const p of groupParticipants) {
      const existing = map.get(p.phone) || []
      existing.push(p)
      map.set(p.phone, existing)
    }
    return map
  }, [groupParticipants])

  // Fallback: when WhatsApp is disconnected, search group participants locally
  const fallbackContacts: Contact[] = useMemo(() => {
    if (!isDisconnected || debouncedSearch.length < 2) return []
    const searchLower = debouncedSearch.toLowerCase()
    const seen = new Set<string>()
    return groupParticipants
      .filter(p => {
        if (seen.has(p.phone)) return false
        const nameMatch = p.name?.toLowerCase().includes(searchLower)
        const pushMatch = p.pushName?.toLowerCase().includes(searchLower)
        const phoneMatch = p.phone.includes(debouncedSearch)
        if (nameMatch || pushMatch || phoneMatch) {
          seen.add(p.phone)
          return true
        }
        return false
      })
      .slice(0, 30)
      .map(p => ({
        id: p.id,
        phone: p.phone,
        name: p.name,
        pushName: p.pushName,
      }))
  }, [isDisconnected, debouncedSearch, groupParticipants])

  // Use WhatsApp contacts if available, otherwise fall back to group participants
  const displayContacts = isDisconnected ? fallbackContacts : contacts

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
    setShowDropdown(true)
  }

  const handleSelect = (contact: Contact) => {
    const displayName = contact.name || contact.pushName || contact.phone
    const groups = phoneToGroups.get(contact.phone) || []

    // Find the group with module info (theory class) — pick the one with highest module number
    // as that represents their latest theory progress
    const theoryGroups = groups.filter(g => g.moduleNumber)
    const latestTheory = theoryGroups.sort((a, b) => (b.moduleNumber || 0) - (a.moduleNumber || 0))[0]

    const groupInfo: StudentGroupInfo = {
      groupName: latestTheory?.groupName || (groups.length > 0 ? groups[0].groupName : ''),
      lastTheoryModule: latestTheory?.moduleNumber || null,
      lastTheoryDate: latestTheory?.lastMessageDate || null,
    }

    onSelect(displayName, contact.phone, groupInfo)
    setShowDropdown(false)
  }

  const formatPhone = (phoneNum: string) => {
    if (phoneNum.length >= 10) {
      return '+' + phoneNum
    }
    return phoneNum
  }

  const getContactGroups = (contactPhone: string) => {
    return phoneToGroups.get(contactPhone) || []
  }

  const isLoading = loadingContacts

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={value}
          onChange={handleInputChange}
          onFocus={() => value.length >= 2 && setShowDropdown(true)}
          placeholder={placeholder}
          className="pl-9"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* WhatsApp disconnected warning */}
      {isDisconnected && debouncedSearch.length >= 2 && (
        <div className="flex items-center gap-2 mt-1 px-2 py-1.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
          <span>WhatsApp disconnected — showing group contacts only. Reconnect on the dashboard for full search.</span>
        </div>
      )}

      {/* Selected info indicators */}
      {(phone || group) && (
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {phone && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span>{formatPhone(phone)}</span>
            </div>
          )}
          {group && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>{group}</span>
            </div>
          )}
        </div>
      )}

      {/* Dropdown */}
      {showDropdown && displayContacts.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-[250px] overflow-y-auto">
          {displayContacts.map((contact) => {
            const groups = getContactGroups(contact.phone)
            const theoryGroups = groups.filter(g => g.moduleNumber)
            const latestTheory = theoryGroups.sort((a, b) => (b.moduleNumber || 0) - (a.moduleNumber || 0))[0]
            return (
              <button
                key={contact.id}
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent/50 text-left transition-colors"
                onClick={() => handleSelect(contact)}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  contact.source === 'student' ? 'bg-purple-100' : 'bg-muted'
                }`}>
                  {contact.source === 'student' ? (
                    <FileText className="h-4 w-4 text-purple-600" />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">
                      {contact.name || contact.pushName || 'Unknown'}
                    </p>
                    {contact.source === 'student' && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-purple-600 border-purple-200">
                        Invoice
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatPhone(contact.phone)}
                  </p>
                  {groups.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {groups.map((g, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {g.groupName}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {latestTheory && (
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                      <BookOpen className="h-3 w-3" />
                      <span>Last: Module {latestTheory.moduleNumber}</span>
                      {latestTheory.lastMessageDate && (
                        <span>— {new Date(latestTheory.lastMessageDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
