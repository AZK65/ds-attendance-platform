'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, Save, Loader2, Plus, Trash2, Pencil, X, Car, Truck, Package,
} from 'lucide-react'
import Link from 'next/link'

interface InvoiceService {
  id: string
  name: string
  description: string | null
  price: number
  vehicleType: 'car' | 'truck' | 'both'
  sortOrder: number
  isActive: boolean
}

interface NewServiceForm {
  name: string
  price: string
}

const EMPTY_FORM: NewServiceForm = { name: '', price: '' }

function ServiceSection({
  title,
  icon: Icon,
  vehicleType,
  services,
  onAdd,
  onUpdate,
  onDelete,
  isAdding,
  isMutating,
}: {
  title: string
  icon: React.ElementType
  vehicleType: 'car' | 'truck' | 'both'
  services: InvoiceService[]
  onAdd: (name: string, price: number, vehicleType: string) => void
  onUpdate: (id: string, name: string, price: number) => void
  onDelete: (id: string) => void
  isAdding: boolean
  isMutating: boolean
}) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newForm, setNewForm] = useState<NewServiceForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<NewServiceForm>(EMPTY_FORM)

  const handleAdd = () => {
    if (!newForm.name.trim() || !newForm.price) return
    onAdd(newForm.name.trim(), parseFloat(newForm.price) || 0, vehicleType)
    setNewForm(EMPTY_FORM)
    setShowAddForm(false)
  }

  const handleUpdate = (id: string) => {
    if (!editForm.name.trim() || !editForm.price) return
    onUpdate(id, editForm.name.trim(), parseFloat(editForm.price) || 0)
    setEditingId(null)
  }

  const startEdit = (service: InvoiceService) => {
    setEditingId(service.id)
    setEditForm({ name: service.name, price: String(service.price) })
  }

  const badgeColor = vehicleType === 'car'
    ? 'bg-blue-100 text-blue-700 border-blue-200'
    : vehicleType === 'truck'
      ? 'bg-orange-100 text-orange-700 border-orange-200'
      : 'bg-gray-100 text-gray-700 border-gray-200'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>
          {vehicleType === 'car' && 'Services for passenger vehicle courses'}
          {vehicleType === 'truck' && 'Services for commercial vehicle courses'}
          {vehicleType === 'both' && 'Services shared across both vehicle types'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {services.length === 0 && !showAddForm && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No services yet. Add your first one below.
          </p>
        )}

        {services.map((service) => (
          <div key={service.id}>
            {editingId === service.id ? (
              // Edit mode
              <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Service name"
                  className="flex-1"
                />
                <div className="w-28">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.price}
                    onChange={(e) => setEditForm(prev => ({ ...prev, price: e.target.value }))}
                    placeholder="Price"
                    className="text-right"
                  />
                </div>
                <Button size="sm" onClick={() => handleUpdate(service.id)} disabled={isMutating}>
                  <Save className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              // View mode
              <div className="flex items-center justify-between p-2 rounded-md hover:bg-muted/30 transition-colors group">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={`text-xs ${badgeColor}`}>
                    {vehicleType === 'car' ? 'Auto' : vehicleType === 'truck' ? 'Camion' : 'Both'}
                  </Badge>
                  <span className="font-medium text-sm">{service.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">${service.price.toFixed(2)}</span>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEdit(service)}
                      className="h-7 w-7 p-0"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(service.id)}
                      disabled={isMutating}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {showAddForm ? (
          <div className="flex items-center gap-2 p-2 bg-accent/30 rounded-md border border-dashed">
            <Input
              value={newForm.name}
              onChange={(e) => setNewForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Service name"
              className="flex-1"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <div className="w-28">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={newForm.price}
                onChange={(e) => setNewForm(prev => ({ ...prev, price: e.target.value }))}
                placeholder="Price"
                className="text-right"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <Button size="sm" onClick={handleAdd} disabled={isAdding || !newForm.name.trim() || !newForm.price}>
              {isAdding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowAddForm(false); setNewForm(EMPTY_FORM) }}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(true)}
            className="w-full mt-2"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add {vehicleType === 'car' ? 'Car' : vehicleType === 'truck' ? 'Truck' : 'Shared'} Service
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export default function InvoiceServicesPage() {
  const queryClient = useQueryClient()

  // Fetch all services
  const { data, isLoading } = useQuery({
    queryKey: ['invoice-services'],
    queryFn: async () => {
      const res = await fetch('/api/invoice/services')
      if (!res.ok) throw new Error('Failed to fetch services')
      return res.json() as Promise<{ services: InvoiceService[] }>
    },
  })

  const services = data?.services || []
  const carServices = services.filter(s => s.vehicleType === 'car')
  const truckServices = services.filter(s => s.vehicleType === 'truck')
  const bothServices = services.filter(s => s.vehicleType === 'both')

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async ({ name, price, vehicleType }: { name: string; price: number; vehicleType: string }) => {
      const res = await fetch('/api/invoice/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price, vehicleType }),
      })
      if (!res.ok) throw new Error('Failed to create service')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-services'] })
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, name, price }: { id: string; name: string; price: number }) => {
      const res = await fetch('/api/invoice/services', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, price }),
      })
      if (!res.ok) throw new Error('Failed to update service')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-services'] })
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/invoice/services', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Failed to delete service')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-services'] })
    },
  })

  const handleAdd = (name: string, price: number, vehicleType: string) => {
    createMutation.mutate({ name, price, vehicleType })
  }

  const handleUpdate = (id: string, name: string, price: number) => {
    updateMutation.mutate({ id, name, price })
  }

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id)
  }

  const isMutating = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending

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
            <h1 className="text-xl font-semibold">Manage Services</h1>
            <p className="text-sm text-muted-foreground">
              Create and manage reusable invoice line items for car and truck courses
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <ServiceSection
            title="Car Services"
            icon={Car}
            vehicleType="car"
            services={carServices}
            onAdd={handleAdd}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            isAdding={createMutation.isPending}
            isMutating={isMutating}
          />

          <ServiceSection
            title="Truck Services"
            icon={Truck}
            vehicleType="truck"
            services={truckServices}
            onAdd={handleAdd}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            isAdding={createMutation.isPending}
            isMutating={isMutating}
          />

          <ServiceSection
            title="Shared Services"
            icon={Package}
            vehicleType="both"
            services={bothServices}
            onAdd={handleAdd}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            isAdding={createMutation.isPending}
            isMutating={isMutating}
          />

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
