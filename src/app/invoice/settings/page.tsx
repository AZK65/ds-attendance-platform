'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowLeft, Save, Loader2, Settings, Hash, Receipt, Package, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface InvoiceSettingsData {
  id: string
  nextInvoiceNumber: number
  invoicePrefix: string
  defaultGstRate: number
  defaultQstRate: number
  gstNumber: string
  qstNumber: string
  taxesEnabled: boolean
  notes: string
}

export default function InvoiceSettingsPage() {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<Partial<InvoiceSettingsData>>({
    nextInvoiceNumber: 1,
    invoicePrefix: 'INV',
    defaultGstRate: 5.0,
    defaultQstRate: 9.975,
    gstNumber: '',
    qstNumber: '',
    taxesEnabled: true,
    notes: 'Merci pour votre confiance! / Thank you for your business!',
  })

  // Fetch current settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['invoice-settings'],
    queryFn: async () => {
      const res = await fetch('/api/invoice/settings')
      if (!res.ok) throw new Error('Failed to fetch settings')
      return res.json() as Promise<InvoiceSettingsData>
    }
  })

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      setFormData({
        nextInvoiceNumber: settings.nextInvoiceNumber,
        invoicePrefix: settings.invoicePrefix,
        defaultGstRate: settings.defaultGstRate,
        defaultQstRate: settings.defaultQstRate,
        gstNumber: settings.gstNumber || '',
        qstNumber: settings.qstNumber || '',
        taxesEnabled: settings.taxesEnabled,
        notes: settings.notes,
      })
    }
  }, [settings])

  // Save settings mutation
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<InvoiceSettingsData>) => {
      const res = await fetch('/api/invoice/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!res.ok) throw new Error('Failed to save settings')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-settings'] })
    }
  })

  const handleInputChange = (field: keyof InvoiceSettingsData, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = () => {
    saveMutation.mutate(formData)
  }

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
          <h1 className="text-xl font-semibold">Invoice Settings</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Invoice Numbering */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hash className="h-5 w-5" />
                Invoice Numbering
              </CardTitle>
              <CardDescription>
                Configure the invoice number prefix and starting number.
                Numbers auto-increment with each invoice generated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="invoicePrefix">Invoice Prefix</Label>
                  <Input
                    id="invoicePrefix"
                    value={formData.invoicePrefix || ''}
                    onChange={(e) => handleInputChange('invoicePrefix', e.target.value)}
                    placeholder="INV"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Preview: {formData.invoicePrefix || 'INV'}-{String(formData.nextInvoiceNumber || 1).padStart(4, '0')}
                  </p>
                </div>
                <div>
                  <Label htmlFor="nextInvoiceNumber">Next Invoice Number</Label>
                  <Input
                    id="nextInvoiceNumber"
                    type="number"
                    min={1}
                    value={formData.nextInvoiceNumber || ''}
                    onChange={(e) => handleInputChange('nextInvoiceNumber', parseInt(e.target.value) || 1)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Current: {settings?.nextInvoiceNumber || 1}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tax Rates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Tax Rates
              </CardTitle>
              <CardDescription>
                Configure default GST and QST rates for Quebec invoices.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="taxesEnabled"
                  checked={formData.taxesEnabled ?? true}
                  onCheckedChange={(checked) => handleInputChange('taxesEnabled', checked === true)}
                />
                <Label htmlFor="taxesEnabled" className="cursor-pointer">
                  Enable taxes by default on new invoices
                </Label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="defaultGstRate">GST Rate (%)</Label>
                  <Input
                    id="defaultGstRate"
                    type="number"
                    step="0.001"
                    min={0}
                    value={formData.defaultGstRate ?? ''}
                    onChange={(e) => handleInputChange('defaultGstRate', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="defaultQstRate">QST Rate (%)</Label>
                  <Input
                    id="defaultQstRate"
                    type="number"
                    step="0.001"
                    min={0}
                    value={formData.defaultQstRate ?? ''}
                    onChange={(e) => handleInputChange('defaultQstRate', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="gstNumber">GST/TPS Number</Label>
                  <Input
                    id="gstNumber"
                    value={formData.gstNumber || ''}
                    onChange={(e) => handleInputChange('gstNumber', e.target.value)}
                    placeholder="123456789 RT0001"
                  />
                </div>
                <div>
                  <Label htmlFor="qstNumber">QST/TVQ Number</Label>
                  <Input
                    id="qstNumber"
                    value={formData.qstNumber || ''}
                    onChange={(e) => handleInputChange('qstNumber', e.target.value)}
                    placeholder="1234567890 TQ0001"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Default Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Default Notes
              </CardTitle>
              <CardDescription>
                Default notes that will appear at the bottom of each invoice.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.notes || ''}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Additional notes for invoices..."
                rows={3}
              />
            </CardContent>
          </Card>

          {/* Manage Services Link */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Invoice Services
              </CardTitle>
              <CardDescription>
                Manage reusable line items for car and truck courses.
                Services are used to auto-fill invoice line items when a vehicle type is selected.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/invoice/services">
                <Button variant="outline">
                  Manage Services
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>
          </div>

          {saveMutation.isSuccess && (
            <p className="text-sm text-green-600 text-center">Settings saved successfully!</p>
          )}
          {saveMutation.isError && (
            <p className="text-sm text-destructive text-center">Failed to save settings. Please try again.</p>
          )}
        </div>
      </main>
    </div>
  )
}
