'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ArrowLeft, Save, Loader2, Plus, Trash2, Pencil, X, Car, Truck, Package,
  AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react'
import Link from 'next/link'

interface Instalment {
  id?: string
  name: string
  amount: number | string
}

interface InvoicePackage {
  id: string
  name: string
  vehicleType: 'car' | 'truck' | 'both'
  totalPrice: number
  taxInclusive: boolean
  sortOrder: number
  isActive: boolean
  instalments: {
    id: string
    instalmentNumber: number
    name: string
    amount: number
    sortOrder: number
  }[]
}

interface NewPackageForm {
  name: string
  totalPrice: string
  vehicleType: 'car' | 'truck' | 'both'
  taxInclusive: boolean
  instalments: Instalment[]
}

const EMPTY_INSTALMENT: Instalment = { name: '', amount: '' }
const EMPTY_FORM: NewPackageForm = {
  name: '',
  totalPrice: '',
  vehicleType: 'car',
  taxInclusive: true,
  instalments: [{ ...EMPTY_INSTALMENT }],
}

function InstalmentSum({ instalments, totalPrice }: { instalments: Instalment[]; totalPrice: number }) {
  const sum = instalments.reduce((s, i) => s + (parseFloat(String(i.amount)) || 0), 0)
  const diff = Math.abs(sum - totalPrice)
  const matches = diff < 0.01

  if (totalPrice <= 0 || instalments.length === 0) return null

  return (
    <div className={`flex items-center gap-2 text-xs mt-1 ${matches ? 'text-green-600' : 'text-amber-600'}`}>
      {!matches && <AlertTriangle className="h-3 w-3" />}
      <span>
        Instalment total: ${sum.toFixed(2)} / ${totalPrice.toFixed(2)}
        {!matches && ` (${sum > totalPrice ? '+' : '-'}$${diff.toFixed(2)})`}
      </span>
    </div>
  )
}

export default function PackagesPage() {
  const queryClient = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)
  const [newForm, setNewForm] = useState<NewPackageForm>({ ...EMPTY_FORM })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<NewPackageForm>({ ...EMPTY_FORM })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Fetch packages
  const { data, isLoading } = useQuery({
    queryKey: ['invoice-packages'],
    queryFn: async () => {
      const res = await fetch('/api/invoice/packages')
      if (!res.ok) throw new Error('Failed to fetch packages')
      return res.json() as Promise<{ packages: InvoicePackage[] }>
    },
  })

  const packages = data?.packages || []

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (form: NewPackageForm) => {
      const res = await fetch('/api/invoice/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          vehicleType: form.vehicleType,
          totalPrice: parseFloat(form.totalPrice),
          taxInclusive: form.taxInclusive,
          instalments: form.instalments
            .filter(i => i.name.trim() && parseFloat(String(i.amount)) > 0)
            .map(i => ({ name: i.name.trim(), amount: parseFloat(String(i.amount)) })),
        }),
      })
      if (!res.ok) throw new Error('Failed to create package')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-packages'] })
      setNewForm({ ...EMPTY_FORM })
      setShowAddForm(false)
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: NewPackageForm }) => {
      const res = await fetch('/api/invoice/packages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: form.name,
          vehicleType: form.vehicleType,
          totalPrice: parseFloat(form.totalPrice),
          taxInclusive: form.taxInclusive,
          instalments: form.instalments
            .filter(i => i.name.trim() && parseFloat(String(i.amount)) > 0)
            .map(i => ({ name: i.name.trim(), amount: parseFloat(String(i.amount)) })),
        }),
      })
      if (!res.ok) throw new Error('Failed to update package')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-packages'] })
      setEditingId(null)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/invoice/packages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Failed to delete package')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-packages'] })
    },
  })

  const isMutating = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending

  const startEdit = (pkg: InvoicePackage) => {
    setEditingId(pkg.id)
    setEditForm({
      name: pkg.name,
      totalPrice: String(pkg.totalPrice),
      vehicleType: pkg.vehicleType,
      taxInclusive: pkg.taxInclusive,
      instalments: pkg.instalments.map(i => ({ id: i.id, name: i.name, amount: i.amount })),
    })
  }

  const addInstalment = (form: NewPackageForm, setForm: (f: NewPackageForm) => void) => {
    setForm({ ...form, instalments: [...form.instalments, { ...EMPTY_INSTALMENT }] })
  }

  const removeInstalment = (form: NewPackageForm, setForm: (f: NewPackageForm) => void, idx: number) => {
    setForm({ ...form, instalments: form.instalments.filter((_, i) => i !== idx) })
  }

  const updateInstalment = (form: NewPackageForm, setForm: (f: NewPackageForm) => void, idx: number, field: 'name' | 'amount', value: string) => {
    const updated = [...form.instalments]
    updated[idx] = { ...updated[idx], [field]: value }
    setForm({ ...form, instalments: updated })
  }

  const vehicleIcon = (type: string) => {
    if (type === 'car') return <Car className="h-4 w-4" />
    if (type === 'truck') return <Truck className="h-4 w-4" />
    return <Package className="h-4 w-4" />
  }

  const vehicleBadge = (type: string) => {
    const colors = type === 'car'
      ? 'bg-blue-100 text-blue-700 border-blue-200'
      : type === 'truck'
        ? 'bg-orange-100 text-orange-700 border-orange-200'
        : 'bg-gray-100 text-gray-700 border-gray-200'
    return (
      <Badge variant="outline" className={`text-xs ${colors}`}>
        {type === 'car' ? 'Car' : type === 'truck' ? 'Truck' : 'Both'}
      </Badge>
    )
  }

  const renderInstalmentForm = (form: NewPackageForm, setForm: (f: NewPackageForm) => void) => (
    <div className="space-y-2 mt-3">
      <Label className="text-xs text-muted-foreground">Instalments</Label>
      {form.instalments.map((inst, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-5 text-right">{idx + 1}.</span>
          <Input
            value={inst.name}
            onChange={(e) => updateInstalment(form, setForm, idx, 'name', e.target.value)}
            placeholder="Instalment name (e.g. Deposit)"
            className="flex-1 h-8 text-sm"
          />
          <div className="w-28">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={inst.amount}
              onChange={(e) => updateInstalment(form, setForm, idx, 'amount', e.target.value)}
              placeholder="Amount"
              className="h-8 text-sm text-right"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeInstalment(form, setForm, idx)}
            disabled={form.instalments.length === 1}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={() => addInstalment(form, setForm)} className="text-xs">
        <Plus className="h-3 w-3 mr-1" />
        Add Instalment
      </Button>
      <InstalmentSum instalments={form.instalments} totalPrice={parseFloat(form.totalPrice) || 0} />
    </div>
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/invoice">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold">Manage Packages</h1>
            <p className="text-sm text-muted-foreground">
              Create pricing packages with instalment plans for car and truck courses
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Existing Packages */}
          {packages.length === 0 && !showAddForm && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No packages yet</p>
                <p className="text-sm mt-1">Create your first package with instalment pricing below</p>
              </CardContent>
            </Card>
          )}

          {packages.map(pkg => {
            const isEditing = editingId === pkg.id
            const isExpanded = expandedId === pkg.id

            if (isEditing) {
              return (
                <Card key={pkg.id}>
                  <CardContent className="pt-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Package Name</Label>
                        <Input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          placeholder="Package name"
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Total Price ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editForm.totalPrice}
                          onChange={(e) => setEditForm({ ...editForm, totalPrice: e.target.value })}
                          placeholder="0.00"
                          className="h-9 text-right"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Type:</Label>
                        {(['car', 'truck', 'both'] as const).map(type => (
                          <Button
                            key={type}
                            variant={editForm.vehicleType === type ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setEditForm({ ...editForm, vehicleType: type })}
                            className="h-7 text-xs"
                          >
                            {type === 'car' ? 'Car' : type === 'truck' ? 'Truck' : 'Both'}
                          </Button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1">
                        <Checkbox
                          id={`edit-tax-${pkg.id}`}
                          checked={editForm.taxInclusive}
                          onCheckedChange={(checked) => setEditForm({ ...editForm, taxInclusive: checked === true })}
                        />
                        <Label htmlFor={`edit-tax-${pkg.id}`} className="text-xs cursor-pointer">Tax incl.</Label>
                      </div>
                    </div>

                    {renderInstalmentForm(editForm, setEditForm)}

                    <div className="flex gap-2 justify-end pt-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button
                        size="sm"
                        onClick={() => updateMutation.mutate({ id: pkg.id, form: editForm })}
                        disabled={isMutating || !editForm.name.trim() || !editForm.totalPrice}
                      >
                        {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                        Save
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            }

            return (
              <Card key={pkg.id}>
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : pkg.id)}
                >
                  <div className="flex items-center gap-3">
                    {vehicleIcon(pkg.vehicleType)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{pkg.name}</span>
                        {vehicleBadge(pkg.vehicleType)}
                        {!pkg.taxInclusive && (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200">+tax</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {pkg.instalments.length} instalment{pkg.instalments.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-medium">${pkg.totalPrice.toFixed(2)}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); startEdit(pkg) }}
                        className="h-7 w-7 p-0"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(pkg.id) }}
                        disabled={isMutating}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
                {isExpanded && (
                  <CardContent className="pt-0 pb-4 border-t">
                    <div className="space-y-2 mt-3">
                      {pkg.instalments.map((inst, idx) => (
                        <div key={inst.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/30">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-5 text-right">{idx + 1}.</span>
                            <span className="text-sm">{inst.name}</span>
                          </div>
                          <span className="font-mono text-sm">${inst.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-3 pt-3 border-t">
                      <Button variant="outline" size="sm" onClick={() => startEdit(pkg)}>
                        <Pencil className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteMutation.mutate(pkg.id)}
                        disabled={isMutating}
                        className="text-muted-foreground hover:text-destructive hover:border-destructive"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}

          {/* Add New Package Form */}
          {showAddForm ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">New Package</CardTitle>
                <CardDescription>Define a pricing package with instalment breakdown</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Package Name</Label>
                    <Input
                      value={newForm.name}
                      onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                      placeholder="e.g. Car Complete Course"
                      className="h-9"
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Total Price ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newForm.totalPrice}
                      onChange={(e) => setNewForm({ ...newForm, totalPrice: e.target.value })}
                      placeholder="0.00"
                      className="h-9 text-right"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Vehicle Type:</Label>
                    {(['car', 'truck', 'both'] as const).map(type => (
                      <Button
                        key={type}
                        variant={newForm.vehicleType === type ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setNewForm({ ...newForm, vehicleType: type })}
                        className="h-7 text-xs"
                      >
                        {type === 'car' ? 'Car' : type === 'truck' ? 'Truck' : 'Both'}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <Checkbox
                      id="new-tax-incl"
                      checked={newForm.taxInclusive}
                      onCheckedChange={(checked) => setNewForm({ ...newForm, taxInclusive: checked === true })}
                    />
                    <Label htmlFor="new-tax-incl" className="text-xs cursor-pointer">Tax incl.</Label>
                  </div>
                </div>

                {renderInstalmentForm(newForm, setNewForm)}

                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="ghost" size="sm" onClick={() => { setShowAddForm(false); setNewForm({ ...EMPTY_FORM }) }}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => createMutation.mutate(newForm)}
                    disabled={isMutating || !newForm.name.trim() || !newForm.totalPrice}
                  >
                    {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                    Create Package
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button
              variant="outline"
              onClick={() => setShowAddForm(true)}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Package
            </Button>
          )}

          {(createMutation.isError || updateMutation.isError || deleteMutation.isError) && (
            <p className="text-sm text-destructive text-center">
              An error occurred. Please try again.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
