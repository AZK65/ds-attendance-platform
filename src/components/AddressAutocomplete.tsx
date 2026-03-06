'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { MapPin } from 'lucide-react'

interface AddressResult {
  street: string
  city: string
  postalCode: string
}

interface AddressAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onAddressSelect?: (result: AddressResult) => void
  placeholder?: string
  className?: string
  id?: string
}

// Load Google Maps script once globally
let googleMapsLoaded = false
let googleMapsLoading = false
const loadCallbacks: (() => void)[] = []

function loadGoogleMaps(): Promise<void> {
  return new Promise((resolve) => {
    if (googleMapsLoaded) {
      resolve()
      return
    }
    loadCallbacks.push(resolve)
    if (googleMapsLoading) return

    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (!key) {
      console.warn('NEXT_PUBLIC_GOOGLE_MAPS_KEY not set')
      resolve()
      return
    }

    googleMapsLoading = true
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async`
    script.async = true
    script.onload = () => {
      googleMapsLoaded = true
      googleMapsLoading = false
      loadCallbacks.forEach(cb => cb())
      loadCallbacks.length = 0
    }
    script.onerror = () => {
      googleMapsLoading = false
      loadCallbacks.forEach(cb => cb())
      loadCallbacks.length = 0
    }
    document.head.appendChild(script)
  })
}

export function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder = 'Start typing your address...',
  className = '',
  id,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [ready, setReady] = useState(false)

  const handlePlaceChanged = useCallback(() => {
    const autocomplete = autocompleteRef.current
    if (!autocomplete) return

    const place = autocomplete.getPlace()
    if (!place.address_components) return

    let streetNumber = ''
    let route = ''
    let city = ''
    let postalCode = ''

    for (const component of place.address_components) {
      const types = component.types
      if (types.includes('street_number')) {
        streetNumber = component.long_name
      } else if (types.includes('route')) {
        route = component.long_name
      } else if (types.includes('locality')) {
        city = component.long_name
      } else if (types.includes('sublocality_level_1') && !city) {
        city = component.long_name
      } else if (types.includes('postal_code')) {
        postalCode = component.long_name
      }
    }

    const street = streetNumber ? `${streetNumber} ${route}` : route
    onChange(street)
    onAddressSelect?.({ street, city, postalCode })
  }, [onChange, onAddressSelect])

  useEffect(() => {
    loadGoogleMaps().then(() => {
      if (window.google?.maps?.places) {
        setReady(true)
      }
    })
  }, [])

  useEffect(() => {
    if (!ready || !inputRef.current || autocompleteRef.current) return

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'ca' },
      fields: ['address_components'],
    })

    autocomplete.addListener('place_changed', handlePlaceChanged)
    autocompleteRef.current = autocomplete

    return () => {
      google.maps.event.clearInstanceListeners(autocomplete)
      autocompleteRef.current = null
    }
  }, [ready, handlePlaceChanged])

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={className}
        autoComplete="off"
      />
      {!ready && value.length >= 3 && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <MapPin className="h-4 w-4 text-muted-foreground animate-pulse" />
        </div>
      )}
    </div>
  )
}
