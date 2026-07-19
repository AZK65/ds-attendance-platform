'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus, Trash2, Save, CheckCircle2, Car, Truck } from 'lucide-react'

interface Installment { label: string; sub: string | null; amount: number }
interface ClassPricing { depositCents: number; schedule: Installment[]; note: string; total: number }
interface Pricing { car: ClassPricing; truck: ClassPricing }

const money = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })

function ClassEditor({
  title, icon: Icon, value, onChange,
}: {
  title: string
  icon: typeof Car
  value: ClassPricing
  onChange: (v: ClassPricing) => void
}) {
  const total = value.schedule.reduce((n, r) => n + (Number(r.amount) || 0), 0)

  const setRow = (i: number, patch: Partial<Installment>) => {
    const schedule = value.schedule.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    onChange({ ...value, schedule })
  }
  const addRow = () => onChange({ ...value, schedule: [...value.schedule, { label: '', sub: null, amount: 0 }] })
  const removeRow = (i: number) => onChange({ ...value, schedule: value.schedule.filter((_, idx) => idx !== i) })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Icon className="h-5 w-5" /> {title}</CardTitle>
        <CardDescription>Total shown to students: <span className="font-semibold text-foreground">${money(total)}</span></CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <Label>Deposit charged today (on the card)</Label>
          <div className="flex items-center gap-2 mt-1 max-w-[200px]">
            <span className="text-muted-foreground">$</span>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={(value.depositCents / 100).toString()}
              onChange={e => onChange({ ...value, depositCents: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)) })}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            The amount actually authorized on the student&apos;s card at registration. Everything else below is display-only.
          </p>
        </div>

        <div>
          <Label>Installment schedule (displayed)</Label>
          <div className="mt-2 space-y-2">
            {value.schedule.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 text-xs text-muted-foreground text-right">{i + 1}</span>
                <Input
                  className="flex-1"
                  placeholder="Label (e.g. On Registration)"
                  value={row.label}
                  onChange={e => setRow(i, { label: e.target.value })}
                />
                <Input
                  className="flex-1"
                  placeholder="Sub-label (optional)"
                  value={row.sub ?? ''}
                  onChange={e => setRow(i, { sub: e.target.value || null })}
                />
                <div className="flex items-center gap-1 w-[120px]">
                  <span className="text-muted-foreground text-sm">$</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.amount.toString()}
                    onChange={e => setRow(i, { amount: Math.max(0, parseFloat(e.target.value) || 0) })}
                  />
                </div>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => removeRow(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-4 w-4 mr-1.5" /> Add installment
            </Button>
          </div>
        </div>

        <div>
          <Label>Summary line (optional)</Label>
          <Input
            className="mt-1"
            placeholder="e.g. $9,050 before taxes — $2,250 theory + $6,500 practical…"
            value={value.note}
            onChange={e => onChange({ ...value, note: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  )
}

export default function PricingSettingsPage() {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Pricing | null>(null)
  const [saved, setSaved] = useState(false)

  const { data, isLoading } = useQuery<Pricing>({
    queryKey: ['pricing'],
    queryFn: async () => {
      const res = await fetch('/api/pricing')
      if (!res.ok) throw new Error('Failed to load pricing')
      return res.json()
    },
  })

  useEffect(() => {
    if (data && !draft) setDraft(data)
  }, [data, draft])

  const save = useMutation({
    mutationFn: async (p: Pricing) => {
      const res = await fetch('/api/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
      if (!res.ok) throw new Error('Failed to save')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Registration Pricing</h2>
        <p className="text-sm text-muted-foreground">
          Edit Class 5 (car) and Class 1 (truck) prices shown during registration, and the deposit charged today.
        </p>
      </div>

      {isLoading || !draft ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <ClassEditor title="Class 5 — Car" icon={Car} value={draft.car} onChange={car => setDraft({ ...draft, car })} />
          <ClassEditor title="Class 1 — Truck" icon={Truck} value={draft.truck} onChange={truck => setDraft({ ...draft, truck })} />

          <div className="flex items-center gap-3 sticky bottom-4">
            <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Save pricing
            </Button>
            {saved && (
              <span className="text-sm text-green-700 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Saved — live in registration now
              </span>
            )}
            {save.isError && <span className="text-sm text-destructive">Failed to save. Try again.</span>}
          </div>

          <p className="text-xs text-muted-foreground">
            Changes apply immediately to this app&apos;s registration page and to the public marketing site (both read
            the same pricing API). The deposit is what actually gets authorized on the card — double-check it before saving.
          </p>
        </>
      )}
    </div>
  )
}
