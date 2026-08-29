'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { CheckCircle2, Loader2, Receipt, ShieldCheck } from 'lucide-react'
import { AddressAutocomplete } from '@/components/AddressAutocomplete'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type KioskClientInfo = {
  name: string
  phone: string
  email: string
  address: string
  address2: string
  city: string
  province: string
  postalCode: string
}

export type KioskInvoiceInfoRequest = {
  requestId: string
  token: string
  fields: KioskClientInfo
}

export function KioskInvoiceInfoForm({
  request,
  onChange,
  onDone,
}: {
  request: KioskInvoiceInfoRequest
  onChange: (fields: KioskClientInfo) => void
  onDone: () => void
}) {
  const [fields, setFields] = useState<KioskClientInfo>(request.fields)
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { onChange(fields) }, [fields, onChange])

  const update = (key: keyof KioskClientInfo, value: string) => {
    setFields(previous => ({ ...previous, [key]: value }))
    setError('')
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/kiosk/invoice-info/${encodeURIComponent(request.token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not save your information')
      setComplete(true)
      setTimeout(onDone, 7000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your information')
    } finally {
      setSaving(false)
    }
  }

  if (complete) {
    return (
      <main className="min-h-screen bg-[#F7F7F5] flex items-center justify-center p-8 text-[#0B0B0F]">
        <div className="w-full max-w-xl rounded-[28px] bg-white border shadow-sm px-10 py-14 text-center">
          <div className="mx-auto h-20 w-20 rounded-full bg-emerald-50 flex items-center justify-center">
            <CheckCircle2 className="h-11 w-11 text-emerald-600" />
          </div>
          <h1 className="mt-7 text-4xl font-bold tracking-tight">Information sent</h1>
          <p className="mt-3 text-lg text-black/55">Thank you. Please hand the iPad back to the staff member.</p>
          <Button className="mt-9 h-13 px-8 text-base" onClick={onDone}>Finish</Button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#F7F7F5] text-[#0B0B0F] px-6 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <Image src="/qazi-logo.png" alt="Qazi Driving School" width={112} height={42} className="h-10 w-auto" priority />
          <div className="flex items-center gap-2 text-sm text-black/50">
            <ShieldCheck className="h-4 w-4" /> Secure form
          </div>
        </div>

        <div className="rounded-[28px] bg-white border shadow-sm overflow-hidden">
          <div className="px-7 sm:px-10 pt-9 pb-7 border-b bg-gradient-to-br from-white to-[#F7F7F5]">
            <div className="h-12 w-12 rounded-2xl bg-black text-white flex items-center justify-center mb-5">
              <Receipt className="h-6 w-6" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Invoice information</h1>
            <p className="mt-2 text-base sm:text-lg text-black/55">Enter the details that should appear on your invoice.</p>
          </div>

          <form onSubmit={submit} className="px-7 sm:px-10 py-8 space-y-6">
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="kiosk-client-name" className="text-base">Full name *</Label>
                <Input id="kiosk-client-name" value={fields.name} onChange={e => update('name', e.target.value)} className="h-12 text-base" autoComplete="name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kiosk-client-phone" className="text-base">Phone</Label>
                <Input id="kiosk-client-phone" inputMode="tel" value={fields.phone} onChange={e => update('phone', e.target.value)} className="h-12 text-base" autoComplete="tel" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kiosk-client-email" className="text-base">Email</Label>
                <Input id="kiosk-client-email" type="email" value={fields.email} onChange={e => update('email', e.target.value)} className="h-12 text-base" autoComplete="email" />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="kiosk-client-address" className="text-base">Street address *</Label>
                <AddressAutocomplete
                  id="kiosk-client-address"
                  value={fields.address}
                  onChange={value => update('address', value)}
                  onAddressSelect={result => setFields(previous => ({
                    ...previous,
                    address: result.street || previous.address,
                    city: result.city || previous.city,
                    province: result.province || previous.province,
                    postalCode: result.postalCode || previous.postalCode,
                  }))}
                  className="!h-12 !text-base"
                  placeholder="Start typing your address…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kiosk-client-address2" className="text-base">Apartment / suite</Label>
                <Input id="kiosk-client-address2" value={fields.address2} onChange={e => update('address2', e.target.value)} className="h-12 text-base" autoComplete="address-line2" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kiosk-client-city" className="text-base">City *</Label>
                <Input id="kiosk-client-city" value={fields.city} onChange={e => update('city', e.target.value)} className="h-12 text-base" autoComplete="address-level2" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kiosk-client-province" className="text-base">Province *</Label>
                <Input id="kiosk-client-province" value={fields.province} onChange={e => update('province', e.target.value)} className="h-12 text-base uppercase" autoComplete="address-level1" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kiosk-client-postal" className="text-base">Postal code *</Label>
                <Input id="kiosk-client-postal" value={fields.postalCode} onChange={e => update('postalCode', e.target.value.toUpperCase())} className="h-12 text-base uppercase" autoComplete="postal-code" required />
              </div>
            </div>

            {error && <p className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</p>}

            <Button type="submit" className="w-full h-14 text-lg" disabled={saving}>
              {saving ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Saving…</> : 'Save and send to staff'}
            </Button>
            <p className="text-center text-xs text-black/40">This information is sent securely to the invoice being prepared.</p>
          </form>
        </div>
      </div>
    </main>
  )
}
