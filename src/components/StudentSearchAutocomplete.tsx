'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, User, Phone, FileText, Database, MessageCircle } from 'lucide-react'

// Local student (from SQLite Student table)
export interface StudentResult {
  id: string
  name: string
  phone: string | null
  phoneAlt: string | null
  licenceNumber: string | null
  address: string | null
  municipality: string | null
  province: string | null
  postalCode: string | null
  registrationDate: string | null
  expiryDate: string | null
  module1Date: string | null
  module2Date: string | null
  module3Date: string | null
  module4Date: string | null
  module5Date: string | null
  module6Date: string | null
  module7Date: string | null
  module8Date: string | null
  module9Date: string | null
  module10Date: string | null
  module11Date: string | null
  module12Date: string | null
  sortie1Date: string | null
  sortie2Date: string | null
  sortie3Date: string | null
  sortie4Date: string | null
  sortie5Date: string | null
  sortie6Date: string | null
  sortie7Date: string | null
  sortie8Date: string | null
  sortie9Date: string | null
  sortie10Date: string | null
  sortie11Date: string | null
  sortie12Date: string | null
  sortie13Date: string | null
  sortie14Date: string | null
  sortie15Date: string | null
  certificates: {
    certificateType: string
    generatedAt: string
  }[]
}

// External student (from MySQL driving_school_v2)
export interface DBStudent {
  student_id: number
  full_name: string
  permit_number: string
  full_address: string
  city: string
  postal_code: string
  phone_number: string
  email: string
  contract_number: number
  dob: string
  status: string
  user_defined_contract_number: number | null
}

// WhatsApp contact (from local Contact table, synced from WhatsApp groups)
export interface WhatsAppContact {
  id: string
  phone: string
  name: string | null
  pushName: string | null
  groupName: string | null
  groupId: string | null
}

// Unified display item
interface DisplayStudent {
  key: string
  name: string
  phone: string | null
  source: 'local' | 'database' | 'whatsapp'
  // For selection
  localStudent?: StudentResult
  dbStudent?: DBStudent
  waContact?: WhatsAppContact
  // Extra display info
  lastCertType?: string
  lastCertDate?: string
  contractNumber?: string
  groupName?: string
}

interface StudentSearchAutocompleteProps {
  onSelect: (student: StudentResult) => void
  onSelectDB?: (student: DBStudent) => void
  onSelectWA?: (contact: WhatsAppContact) => void
  placeholder?: string
}

export function StudentSearchAutocomplete({
  onSelect,
  onSelectDB,
  onSelectWA,
  placeholder = "Search by name, phone, or licence number...",
}: StudentSearchAutocompleteProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Debounce 300ms
  useEffect(() => {
    if (searchTerm.length < 2) {
      setDebouncedSearch('')
      return
    }
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Click-outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['student-search', debouncedSearch],
    queryFn: async () => {
      const res = await fetch(`/api/students/search?q=${encodeURIComponent(debouncedSearch)}`)
      if (!res.ok) return { students: [], localStudents: [], whatsappContacts: [] }
      return res.json()
    },
    enabled: debouncedSearch.length >= 2,
  })

  // Build unified display list from all three sources
  const displayStudents: DisplayStudent[] = []

  // Add external MySQL students first (main database)
  const dbStudents: DBStudent[] = data?.students || []
  for (const s of dbStudents) {
    displayStudents.push({
      key: `db-${s.student_id}`,
      name: s.full_name,
      phone: s.phone_number || null,
      source: 'database',
      dbStudent: s,
      contractNumber: s.user_defined_contract_number ? String(s.user_defined_contract_number) : undefined,
    })
  }

  // Add local SQLite students
  const localStudents: StudentResult[] = data?.localStudents || []
  for (const s of localStudents) {
    displayStudents.push({
      key: `local-${s.id}`,
      name: s.name,
      phone: s.phone,
      source: 'local',
      localStudent: s,
      lastCertType: s.certificates?.[0]?.certificateType,
      lastCertDate: s.certificates?.[0]?.generatedAt,
    })
  }

  // Add WhatsApp contacts (active students from groups, not already in DB)
  const waContacts: WhatsAppContact[] = data?.whatsappContacts || []
  for (const c of waContacts) {
    displayStudents.push({
      key: `wa-${c.id}`,
      name: c.name || c.pushName || c.phone,
      phone: c.phone,
      source: 'whatsapp',
      waContact: c,
      groupName: c.groupName || undefined,
    })
  }

  const handleSelect = (item: DisplayStudent) => {
    if (item.source === 'database' && item.dbStudent) {
      if (onSelectDB) {
        onSelectDB(item.dbStudent)
      } else {
        // Convert DB student to StudentResult format for backward compatibility
        onSelect({
          id: String(item.dbStudent.student_id),
          name: item.dbStudent.full_name,
          phone: item.dbStudent.phone_number || null,
          phoneAlt: null,
          licenceNumber: item.dbStudent.permit_number || null,
          address: item.dbStudent.full_address || null,
          municipality: item.dbStudent.city || null,
          province: 'QC',
          postalCode: item.dbStudent.postal_code || null,
          registrationDate: null,
          expiryDate: null,
          module1Date: null, module2Date: null, module3Date: null, module4Date: null, module5Date: null,
          module6Date: null, module7Date: null, module8Date: null, module9Date: null, module10Date: null,
          module11Date: null, module12Date: null,
          sortie1Date: null, sortie2Date: null, sortie3Date: null, sortie4Date: null, sortie5Date: null,
          sortie6Date: null, sortie7Date: null, sortie8Date: null, sortie9Date: null, sortie10Date: null,
          sortie11Date: null, sortie12Date: null, sortie13Date: null, sortie14Date: null, sortie15Date: null,
          certificates: [],
        })
      }
    } else if (item.source === 'whatsapp' && item.waContact) {
      if (onSelectWA) {
        onSelectWA(item.waContact)
      } else {
        // Convert WhatsApp contact to StudentResult format
        onSelect({
          id: item.waContact.id,
          name: item.waContact.name || item.waContact.pushName || item.waContact.phone,
          phone: item.waContact.phone,
          phoneAlt: null,
          licenceNumber: null,
          address: null,
          municipality: null,
          province: 'QC',
          postalCode: null,
          registrationDate: null,
          expiryDate: null,
          module1Date: null, module2Date: null, module3Date: null, module4Date: null, module5Date: null,
          module6Date: null, module7Date: null, module8Date: null, module9Date: null, module10Date: null,
          module11Date: null, module12Date: null,
          sortie1Date: null, sortie2Date: null, sortie3Date: null, sortie4Date: null, sortie5Date: null,
          sortie6Date: null, sortie7Date: null, sortie8Date: null, sortie9Date: null, sortie10Date: null,
          sortie11Date: null, sortie12Date: null, sortie13Date: null, sortie14Date: null, sortie15Date: null,
          certificates: [],
        })
      }
    } else if (item.localStudent) {
      onSelect(item.localStudent)
    }
    setSearchTerm('')
    setShowDropdown(false)
  }

  const totalResults = displayStudents.length

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setShowDropdown(true) }}
          onFocus={() => searchTerm.length >= 2 && setShowDropdown(true)}
          placeholder={placeholder}
          className="pl-9"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {showDropdown && debouncedSearch.length >= 2 && totalResults === 0 && !isLoading && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg p-3">
          <p className="text-sm text-muted-foreground text-center">No students found</p>
        </div>
      )}

      {showDropdown && totalResults > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-[300px] overflow-y-auto">
          {displayStudents.map((item) => (
            <button
              key={item.key}
              type="button"
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent/50 text-left transition-colors"
              onClick={() => handleSelect(item)}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                item.source === 'database' ? 'bg-blue-100' :
                item.source === 'whatsapp' ? 'bg-green-100' :
                'bg-muted'
              }`}>
                {item.source === 'database' ? (
                  <Database className="h-4 w-4 text-blue-600" />
                ) : item.source === 'whatsapp' ? (
                  <MessageCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <User className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{item.name}</p>
                  {item.source === 'database' && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-600 border-blue-200">
                      DB
                    </Badge>
                  )}
                  {item.source === 'whatsapp' && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-600 border-green-200">
                      WhatsApp
                    </Badge>
                  )}
                </div>
                {item.phone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {item.phone}
                  </p>
                )}
                {item.contractNumber && (
                  <p className="text-[10px] text-muted-foreground">
                    Contract #{item.contractNumber}
                  </p>
                )}
                {item.groupName && (
                  <p className="text-[10px] text-muted-foreground">
                    Group: {item.groupName}
                  </p>
                )}
                {item.lastCertType && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <FileText className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {item.lastCertType === 'phase1' ? 'Phase 1' : 'Full Course'}
                    </Badge>
                    {item.lastCertDate && (
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(item.lastCertDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
