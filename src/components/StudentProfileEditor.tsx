'use client'

import { useId, useState } from 'react'
import { Pencil } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { type StudentProfileFields, type ProfileTextField } from '@/lib/student-profile-fields'
import { PhoneChangeHistory } from '@/components/PhoneChangeHistory'

const fields: Array<{ key: ProfileTextField; label: string; type?: string }> = [
  { key: 'full_name', label: 'Full name' }, { key: 'email', label: 'Email', type: 'email' },
  { key: 'dob', label: 'Date of birth', type: 'date' }, { key: 'permit_number', label: 'Permit number' },
  { key: 'full_address', label: 'Street address' }, { key: 'city', label: 'City' },
  { key: 'postal_code', label: 'Postal code' }, { key: 'status', label: 'Student status' },
]

type ChatIdentity = { groupId: string; contactId: string; name: string }
export function StudentProfileEditor({ studentId, localStudentId, onChangePhone, chat: initialChat, phone: initialPhone = '' }: {
  studentId?: string | number; localStudentId?: string | null; onChangePhone: () => void; chat?: ChatIdentity; phone?: string
}) {
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<StudentProfileFields | null>(null)
  const [revision, setRevision] = useState('')
  const [phone, setPhone] = useState('')
  const [contract, setContract] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [chat, setChat] = useState<ChatIdentity | null>(initialChat || null)
  const [chatName, setChatName] = useState('')
  const [chatSaving, setChatSaving] = useState(false)
  const [chatNotice, setChatNotice] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyId = useId()

  async function load() {
    setLoading(true); setError(''); setForm(null)
    setHistoryOpen(false)
    setChatNotice(''); setChat(initialChat || null); setChatName(initialChat?.name || ''); setPhone(initialPhone)
    if (!studentId) { setLoading(false); return }
    try {
      const res = await fetch(`/api/students/${studentId}/edit`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load the profile.')
      setForm(data.fields); setRevision(data.revision); setPhone(data.phone || ''); setContract(String(data.contractNumber || ''))
      const linkedChat = initialChat || data.chat || null
      setChat(linkedChat); setChatName(linkedChat?.name || '')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load the profile.') }
    finally { setLoading(false) }
  }

  async function saveChatName() {
    if (!chat || !chatName.trim()) return
    setChatSaving(true); setChatNotice('')
    try {
      const res = await fetch(`/api/groups/${encodeURIComponent(chat.groupId)}/members`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: chat.contactId, newName: chatName.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Could not save chat name.')
      await client.invalidateQueries({ predicate: query => /student|group|contact/i.test(String(query.queryKey[0])) })
      setChatNotice('Chat name saved.')
    } catch (err) { setChatNotice(err instanceof Error ? err.message : 'Could not save chat name.') }
    finally { setChatSaving(false) }
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
    <Button variant="outline" className="gap-2 font-semibold" onClick={() => { setOpen(true); void load() }}><Pencil className="h-4 w-4" aria-hidden="true" />Edit profile</Button>
    <Dialog open={open} onOpenChange={value => { if (!saving && !chatSaving) setOpen(value) }}>
      <DialogContent className="sm:max-w-2xl flex max-h-[90dvh] flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6">
          <DialogTitle>Edit student profile</DialogTitle>
          <DialogDescription>Personal details, WhatsApp name and phone number.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex min-h-0 flex-col">
          <div className="min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            {loading && <p role="status">Loading profile…</p>}
            {form && <>
              <h3 className="text-sm font-semibold">Personal details</h3>
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
              </div>
            </>}
            {!loading && <section className="space-y-4 rounded-lg bg-muted/50 p-4" aria-label="Contact settings">
              <h3 className="text-sm font-semibold">Contact settings</h3>
              {chat && <div className="space-y-2">
                <Label htmlFor="profile-chat-name">WhatsApp chat name</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input id="profile-chat-name" value={chatName} onChange={event => setChatName(event.target.value)} disabled={saving || chatSaving} maxLength={255} />
                  <Button type="button" variant="outline" disabled={saving || chatSaving || !chatName.trim()} onClick={saveChatName}>{chatSaving ? 'Saving…' : 'Save chat name'}</Button>
                </div>
                <p className="text-xs text-muted-foreground">Shown in chats and groups. The student’s legal name stays separate.</p>
                {chatNotice && <p role="status" className="text-sm">{chatNotice}</p>}
              </div>}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div><p className="text-sm font-medium">Phone number</p><p className="text-sm text-muted-foreground">{phone || 'Not set'}</p></div>
                <Button variant="outline" size="sm" type="button" disabled={saving || chatSaving} onClick={onChangePhone} data-testid="open-change-phone">Change phone number</Button>
              </div>
            </section>}
            {!loading && <section aria-label="Previous changes">
              <Button type="button" variant="ghost" size="sm" aria-expanded={historyOpen} aria-controls={historyId}
                onClick={() => setHistoryOpen(value => !value)}>
                {historyOpen ? 'Hide previous changes' : 'Previous changes'}
              </Button>
              <div id={historyId} hidden={!historyOpen}>
                {historyOpen && <PhoneChangeHistory externalStudentId={studentId ? Number(studentId) : undefined}
                  localStudentId={localStudentId} contactId={chat?.contactId} phone={phone || initialPhone} />}
              </div>
            </section>}
            {error && <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>{error}</p><Button type="button" variant="outline" size="sm" onClick={load} disabled={saving || loading}>Reload profile</Button>
            </div>}
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t p-4">
            <Button type="button" variant="outline" disabled={saving || chatSaving} onClick={() => setOpen(false)}>{form ? 'Cancel' : 'Done'}</Button>
            {form && <Button type="submit" disabled={loading || saving || chatSaving}>{saving ? 'Saving…' : 'Save changes'}</Button>}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </>
}
