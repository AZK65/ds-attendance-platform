'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface AddressResult {
  street: string
  city: string
  province: string
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
    // Already loaded (including from a previous SPA navigation)
    if (googleMapsLoaded || window.google?.maps?.places) {
      googleMapsLoaded = true
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
    script.async = true
    script.onload = () => {
      const waitForPlaces = () => {
        if (window.google?.maps?.places) {
          googleMapsLoaded = true
          googleMapsLoading = false
          loadCallbacks.forEach(cb => cb())
          loadCallbacks.length = 0
        } else {
          setTimeout(waitForPlaces, 100)
        }
      }
      waitForPlaces()
    }
    script.onerror = () => {
      googleMapsLoading = false
      loadCallbacks.forEach(cb => cb())
      loadCallbacks.length = 0
    }
    document.head.appendChild(script)
  })
}

// Match shadcn Input styling
const inputClasses =
  'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'

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
  const isSelectingRef = useRef(false)
  // Store callbacks in refs so the autocomplete listener always calls the latest version
  const onChangeRef = useRef(onChange)
  const onAddressSelectRef = useRef(onAddressSelect)
  onChangeRef.current = onChange
  onAddressSelectRef.current = onAddressSelect

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
      fields: ['address_components', 'place_id'],
    })

    const parseComponents = (components: google.maps.GeocoderAddressComponent[]) => {
      let streetNumber = ''
      let route = ''
      let city = ''
      let province = ''
      let postalCode = ''
      let postalPrefix = ''

      for (const component of components) {
        const types = component.types
        if (types.includes('street_number')) {
          streetNumber = component.long_name
        } else if (types.includes('route')) {
          route = component.long_name
        } else if (types.includes('locality')) {
          city = component.long_name
        } else if ((types.includes('sublocality_level_1') || types.includes('sublocality')) && !city) {
          city = component.long_name
        } else if (types.includes('administrative_area_level_1')) {
          province = component.short_name
        } else if (types.includes('postal_code')) {
          postalCode = component.long_name
        } else if (types.includes('postal_code_prefix')) {
          postalPrefix = component.long_name
        }
      }

      return {
        street: streetNumber ? `${streetNumber} ${route}` : route,
        city,
        province,
        postalCode: postalCode || postalPrefix,
      }
    }

    const placesService = new google.maps.places.PlacesService(document.createElement('div'))

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      if (!place.address_components) return

      const initial = parseComponents(place.address_components)

      const apply = (result: AddressResult) => {
        isSelectingRef.current = true
        onChangeRef.current(result.street)
        onAddressSelectRef.current?.(result)
        if (inputRef.current) inputRef.current.value = result.street
        setTimeout(() => { isSelectingRef.current = false }, 50)
      }

      apply(initial)

      // If postal code is missing or partial (<6 chars for Canadian codes),
      // fetch full place details for a complete postal_code.
      const needsDetails = place.place_id && (!initial.postalCode || initial.postalCode.replace(/\s/g, '').length < 6)
      if (needsDetails) {
        placesService.getDetails(
          { placeId: place.place_id!, fields: ['address_components'] },
          (detail, status) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !detail?.address_components) return
            const full = parseComponents(detail.address_components)
            apply({ ...initial, ...full, street: initial.street || full.street })
          }
        )
      }
    })

    autocompleteRef.current = autocomplete

    // No cleanup — keep the single autocomplete instance alive to avoid duplicate dropdowns
  }, [ready])

  // Sync value prop to the uncontrolled input (for external updates like form reset)
  useEffect(() => {
    if (isSelectingRef.current) return
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value
    }
  }, [value])

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      placeholder={placeholder}
      defaultValue={value}
      onChange={e => {
        if (!isSelectingRef.current) {
          onChange(e.target.value)
        }
      }}
      className={cn(inputClasses, className)}
      autoComplete="off"
    />
  )
}
