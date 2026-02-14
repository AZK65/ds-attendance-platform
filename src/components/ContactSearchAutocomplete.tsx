'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Loader2, Phone, User } from 'lucide-react'

interface Contact {
  id: string
  phone: string
  name: string | null
  pushName: string | null
}

interface ContactSearchAutocompleteProps {
  value: string
  phone: string
  onSelect: (name: string, phone: string) => void
  onChange: (name: string) => void
  placeholder?: string
}

export function ContactSearchAutocomplete({
  value,
  phone,
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

  // Fetch contacts
  const { data, isLoading } = useQuery({
    queryKey: ['contact-search', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ search: debouncedSearch })
      const res = await fetch(`/api/contacts?${params}`)
      if (!res.ok) return { contacts: [] }
      return res.json()
    },
    enabled: debouncedSearch.length >= 2,
  })

  const contacts: Contact[] = data?.contacts || []

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
    setShowDropdown(true)
  }

  const handleSelect = (contact: Contact) => {
    const displayName = contact.name || contact.pushName || contact.phone
    onSelect(displayName, contact.phone)
    setShowDropdown(false)
  }

  const formatPhone = (phoneNum: string) => {
    if (phoneNum.length >= 10) {
      return '+' + phoneNum
    }
    return phoneNum
  }

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

      {/* Selected phone indicator */}
      {phone && (
        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
          <Phone className="h-3 w-3" />
          <span>{formatPhone(phone)}</span>
        </div>
      )}

      {/* Dropdown */}
      {showDropdown && contacts.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
          {contacts.map((contact) => (
            <button
              key={contact.id}
              type="button"
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent/50 text-left transition-colors"
              onClick={() => handleSelect(contact)}
            >
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">
                  {contact.name || contact.pushName || 'Unknown'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatPhone(contact.phone)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
