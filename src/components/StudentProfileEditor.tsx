'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { type StudentProfileFields, type ProfileTextField } from '@/lib/student-profile-fields'

const fields: Array<{ key: ProfileTextField; label: string; type?: string }> = [
  { key: 'full_name', label: 'Full name' }, { key: 'email', label: 'Email', type: 'email' },
  { key: 'dob', label: 'Date of birth', type: 'date' }, { key: 'permit_number', label: 'Permit number' },
  { key: 'full_address', label: 'Street address' }, { key: 'city', label: 'City' },
  { key: 'postal_code', label: 'Postal code' }, { key: 'status', label: 'Student status' },
]

export function StudentProfileEditor({ studentId, onChangePhone }: { studentId: string | number; onChangePhone: () => void }) {
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<StudentProfileFields | null>(null)
  const [revision, setRevision] = useState('')
  const [phone, setPhone] = useState('')
  const [contract, setContract] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true); setError(''); setForm(null)
    try {
      const res = await fetch(`/api/students/${studentId}/edit`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load the profile.')
      setForm(data.fields); setRevision(data.revision); setPhone(data.phone || ''); setContract(String(data.contractNumber || ''))
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load the profile.') }
    finally { setLoading(false) }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/students/${studentId}/edit`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: form, revision }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save the profile.')
      await client.invalidateQueries({ predicate: query => /student|group|contact/i.test(String(query.queryKey[0])) })
      setOpen(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the profile.') }
    finally { setSaving(false) }
  }

  return <>
    <Button variant="ghost" size="sm" onClick={() => { setOpen(true); void load() }}>Edit profile</Button>
    <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value) }}>
      <DialogContent className="sm:max-w-2xl flex max-h-[90dvh] flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6">
          <DialogTitle>Edit student profile</DialogTitle>
          <DialogDescription>Update personal and contact details. Attendance and payments are not edited here.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex min-h-0 flex-col">
          <div className="min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            {loading && <p role="status">Loading profile…</p>}
            {form && <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {fields.map(field => <div className="space-y-2" key={field.key}>
                  <Label htmlFor={`profile-${field.key}`}>{field.label}</Label>
                  <Input id={`profile-${field.key}`} type={field.type || 'text'} maxLength={255} required={field.key === 'full_name'}
                    value={form[field.key]} disabled={saving}
                    onChange={event => setForm({ ...form, [field.key]: event.target.value })} />
                </div>)}
                <div className="space-y-2">
                  <Label htmlFor="profile-contract">Contract number override</Label>
                  <Input id="profile-contract" type="number" min="1" step="1" placeholder={contract || 'Optional'} disabled={saving}
                    value={form.user_defined_contract_number ?? ''}
                    onChange={event => setForm({ ...form, user_defined_contract_number: event.target.value ? Number(event.target.value) : null })} />
                </div>
                <div className="space-y-2">
                  <Label>Phone number</Label><p className="text-sm">{phone || 'Not set'}</p>
                  <Button variant="outline" size="sm" type="button" disabled={saving} onClick={() => { setOpen(false); onChangePhone() }}>Change phone number</Button>
                </div>
              </div>
            </>}
            {error && <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>{error}</p><Button type="button" variant="outline" size="sm" onClick={load} disabled={saving || loading}>Reload profile</Button>
            </div>}
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t p-4">
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!form || loading || saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </>
}
