'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Target, Loader2, Search, Phone, Mail, MessageCircle, Trash2,
  CheckCircle, Archive, Inbox, Clock,
} from 'lucide-react'

interface Lead {
  id: string
  createdAt: string
  name: string | null
  email: string | null
  phone: string | null
  notes: string | null
  source: string
  status: string
  isRead: boolean
  isTest: boolean
}

type Tab = 'active' | 'archived' | 'all'

function relativeTime(iso: string): string {
  const d = new Date(iso)
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.round(diffH / 24)
  if (diffD < 7) return `${diffD}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function digits(phone: string): string {
  return phone.replace(/\D/g, '')
}

export default function LeadsPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('active')
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery<{ leads: Lead[]; newCount: number }>({
    queryKey: ['leads', tab, search],
    queryFn: async () => {
      const params = new URLSearchParams({ status: tab })
      if (search.trim()) params.set('q', search.trim())
      const res = await fetch(`/api/leads?${params}`)
      if (!res.ok) throw new Error('Failed to fetch leads')
      return res.json()
    },
    refetchInterval: 30000,
  })

  const leads = data?.leads || []

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, isRead: true }),
      })
      if (!res.ok) throw new Error('Failed to update')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })

  const TABS: { key: Tab; label: string; icon: typeof Inbox }[] = [
    { key: 'active', label: 'Active', icon: Inbox },
    { key: 'archived', label: 'Archived', icon: Archive },
    { key: 'all', label: 'All', icon: Target },
  ]

  return (
    <main className="max-w-[1400px] mx-auto p-4 sm:p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Target className="h-6 w-6" /> Leads
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Leads from your Google Ads lead form, in real time.
        </p>
      </motion.div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-lg">
              Inbound Leads
              <Badge variant="secondary">{leads.length}</Badge>
              {(data?.newCount ?? 0) > 0 && (
                <Badge className="bg-red-100 text-red-700">{data!.newCount} new</Badge>
              )}
            </CardTitle>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, phone, email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-3 border-b">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === key
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-muted-foreground">Loading leads…</span>
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-12">
              <Target className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">
                {search.trim() ? 'No leads match your search.' : 'No leads yet.'}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[150px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map(lead => (
                    <TableRow key={lead.id} className={lead.status === 'new' ? 'bg-blue-50/40 dark:bg-blue-950/10' : ''}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {lead.status === 'new' && (
                            <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" title="New" />
                          )}
                          <span>{lead.name || '—'}</span>
                          {lead.isTest && (
                            <Badge variant="outline" className="text-[10px]">test</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm">
                          {lead.phone && (
                            <div className="flex items-center gap-2">
                              <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:text-primary">
                                <Phone className="h-3.5 w-3.5" /> {lead.phone}
                              </a>
                              <a
                                href={`https://wa.me/${digits(lead.phone)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 hover:text-green-700"
                                title="WhatsApp"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          )}
                          {lead.email && (
                            <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-muted-foreground hover:text-primary">
                              <Mail className="h-3.5 w-3.5" /> {lead.email}
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        {lead.notes ? (
                          <p className="text-sm text-muted-foreground whitespace-pre-line">{lead.notes}</p>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {relativeTime(lead.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {lead.status === 'new' && <Badge className="bg-blue-100 text-blue-700">New</Badge>}
                        {lead.status === 'contacted' && <Badge className="bg-green-100 text-green-700">Contacted</Badge>}
                        {lead.status === 'archived' && <Badge variant="secondary">Archived</Badge>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {lead.status !== 'contacted' && (
                            <Button
                              variant="ghost" size="sm" className="h-8 px-2"
                              title="Mark contacted"
                              onClick={() => updateMutation.mutate({ id: lead.id, status: 'contacted' })}
                            >
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          {lead.status !== 'archived' && (
                            <Button
                              variant="ghost" size="sm" className="h-8 px-2"
                              title="Archive"
                              onClick={() => updateMutation.mutate({ id: lead.id, status: 'archived' })}
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost" size="sm" className="h-8 px-2"
                            title="Delete"
                            onClick={() => {
                              if (confirm('Delete this lead permanently?')) deleteMutation.mutate(lead.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
