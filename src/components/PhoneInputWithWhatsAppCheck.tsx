'use client'

import { useEffect, useState } from 'react'
import { PhoneInput } from '@/components/PhoneInput'
import { CheckCircle2, XCircle, Loader2, WifiOff } from 'lucide-react'

type CheckStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'error'

interface Props {
  value: string
  onChange: (fullNumber: string) => void
  id?: string
  placeholder?: string
  className?: string
  /** When true, runs the WhatsApp check as the user types (debounced). */
  autoCheck?: boolean
}

/**
 * PhoneInput wrapped with a live WhatsApp registration indicator.
 * - Uses country code + area code picker with flags
 * - Debounces the lookup (700ms) while typing
 * - Only checks when the number is ≥10 digits
 * - Shows a green check (on WhatsApp), red X (not on WhatsApp),
 *   or a "WhatsApp disconnected" hint if the check itself fails
 */
export function PhoneInputWithWhatsAppCheck({
  value,
  onChange,
  id,
  placeholder,
  className,
  autoCheck = true,
}: Props) {
  const [status, setStatus] = useState<CheckStatus>('idle')

  useEffect(() => {
    if (!autoCheck) return
    const digits = value.replace(/\D/g, '')

    if (digits.length < 10) {
      setStatus('idle')
      return
    }

    setStatus('checking')
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/whatsapp/check-number?phone=${encodeURIComponent(digits)}`,
          { signal: controller.signal }
        )
        if (!res.ok) {
          setStatus('error')
          return
        }
        const data = await res.json()
        setStatus(data.registered ? 'valid' : 'invalid')
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setStatus('error')
      }
    }, 700)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [value, autoCheck])

  return (
    <div className={className}>
      <PhoneInput
        value={value}
        onChange={onChange}
        id={id}
        placeholder={placeholder}
      />
      <div className="mt-1 min-h-[18px] text-xs">
        {status === 'checking' && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Checking WhatsApp…
          </span>
        )}
        {status === 'valid' && (
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-3 w-3" /> On WhatsApp
          </span>
        )}
        {status === 'invalid' && (
          <span className="flex items-center gap-1 text-red-600">
            <XCircle className="h-3 w-3" /> Not on WhatsApp
          </span>
        )}
        {status === 'error' && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <WifiOff className="h-3 w-3" /> Could not check — WhatsApp may be offline
          </span>
        )}
      </div>
    </div>
  )
}
