'use client'

import { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { ChevronDown } from 'lucide-react'

interface Country {
  code: string
  dialCode: string
  flag: string
  name: string
}

const COUNTRIES: Country[] = [
  { code: 'CA', dialCode: '1', flag: '🇨🇦', name: 'Canada' },
  { code: 'US', dialCode: '1', flag: '🇺🇸', name: 'United States' },
  { code: 'FR', dialCode: '33', flag: '🇫🇷', name: 'France' },
  { code: 'MA', dialCode: '212', flag: '🇲🇦', name: 'Morocco' },
  { code: 'DZ', dialCode: '213', flag: '🇩🇿', name: 'Algeria' },
  { code: 'TN', dialCode: '216', flag: '🇹🇳', name: 'Tunisia' },
  { code: 'PK', dialCode: '92', flag: '🇵🇰', name: 'Pakistan' },
  { code: 'IN', dialCode: '91', flag: '🇮🇳', name: 'India' },
  { code: 'BD', dialCode: '880', flag: '🇧🇩', name: 'Bangladesh' },
  { code: 'LB', dialCode: '961', flag: '🇱🇧', name: 'Lebanon' },
  { code: 'SY', dialCode: '963', flag: '🇸🇾', name: 'Syria' },
  { code: 'HT', dialCode: '509', flag: '🇭🇹', name: 'Haiti' },
  { code: 'CD', dialCode: '243', flag: '🇨🇩', name: 'Congo' },
  { code: 'CM', dialCode: '237', flag: '🇨🇲', name: 'Cameroon' },
  { code: 'GH', dialCode: '233', flag: '🇬🇭', name: 'Ghana' },
  { code: 'NG', dialCode: '234', flag: '🇳🇬', name: 'Nigeria' },
  { code: 'MX', dialCode: '52', flag: '🇲🇽', name: 'Mexico' },
  { code: 'BR', dialCode: '55', flag: '🇧🇷', name: 'Brazil' },
  { code: 'GB', dialCode: '44', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'UA', dialCode: '380', flag: '🇺🇦', name: 'Ukraine' },
  { code: 'RO', dialCode: '40', flag: '🇷🇴', name: 'Romania' },
  { code: 'PH', dialCode: '63', flag: '🇵🇭', name: 'Philippines' },
]

function formatLocalNumber(digits: string, dialCode: string): string {
  // Format North American numbers (dial code 1): (514) 555-1234
  if (dialCode === '1') {
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
  }
  // Other countries: just space every 3-4 digits
  return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim()
}

interface PhoneInputProps {
  value: string
  onChange: (fullNumber: string) => void
  id?: string
  placeholder?: string
  className?: string
}

export function PhoneInput({ value, onChange, id, placeholder, className }: PhoneInputProps) {
  const [open, setOpen] = useState(false)
  const [selectedCountry, setSelectedCountry] = useState<Country>(COUNTRIES[0]) // Canada default
  const [localNumber, setLocalNumber] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Parse initial value to detect country code
  useEffect(() => {
    if (!value) return
    const digits = value.replace(/\D/g, '')
    if (!digits) return

    // Try to match a country by dial code (longest match first)
    const sorted = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length)
    for (const country of sorted) {
      if (digits.startsWith(country.dialCode)) {
        setSelectedCountry(country)
        setLocalNumber(digits.slice(country.dialCode.length))
        return
      }
    }
    // No match — assume it's just a local number for the default country
    setLocalNumber(digits)
  }, []) // Only on mount

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleLocalChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '')
    const maxLen = selectedCountry.dialCode === '1' ? 10 : 15
    const trimmed = digits.slice(0, maxLen)
    setLocalNumber(trimmed)
    onChange(selectedCountry.dialCode + trimmed)
  }

  const handleCountrySelect = (country: Country) => {
    setSelectedCountry(country)
    setOpen(false)
    onChange(country.dialCode + localNumber)
  }

  const displayValue = formatLocalNumber(localNumber, selectedCountry.dialCode)

  return (
    <div className={`flex gap-0 ${className || ''}`}>
      {/* Country selector */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 h-9 px-2.5 border border-r-0 rounded-l-md bg-muted/50 hover:bg-muted transition-colors text-sm min-w-[80px]"
        >
          <span className="text-base">{selectedCountry.flag}</span>
          <span className="text-muted-foreground">+{selectedCountry.dialCode}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded-md shadow-lg max-h-60 overflow-y-auto w-56">
            {COUNTRIES.map(country => (
              <button
                key={country.code}
                type="button"
                onClick={() => handleCountrySelect(country)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors ${
                  country.code === selectedCountry.code ? 'bg-accent' : ''
                }`}
              >
                <span className="text-base">{country.flag}</span>
                <span className="flex-1 text-left">{country.name}</span>
                <span className="text-muted-foreground">+{country.dialCode}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Phone number input */}
      <Input
        id={id}
        type="tel"
        placeholder={placeholder || (selectedCountry.dialCode === '1' ? '(514) 555-1234' : 'Phone number')}
        value={displayValue}
        onChange={e => handleLocalChange(e.target.value)}
        className="rounded-l-none"
      />
    </div>
  )
}
