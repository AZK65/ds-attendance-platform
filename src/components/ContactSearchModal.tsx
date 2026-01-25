'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, UserPlus, Loader2, Phone, CheckCircle2 } from 'lucide-react'

interface Contact {
  id: string
  phone: string
  name: string | null
  pushName: string | null
}

interface ContactSearchModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  isConnected: boolean
}

export function ContactSearchModal({
  open,
  onOpenChange,
  groupId,
  isConnected
}: ContactSearchModalProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Reset added IDs when modal opens
  useEffect(() => {
    if (open) {
      setAddedIds(new Set())
    }
  }, [open])

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', debouncedSearch, groupId],
    queryFn: async () => {
      const params = new URLSearchParams({
        search: debouncedSearch,
        excludeGroupId: groupId
      })
      const res = await fetch(`/api/contacts?${params}`)
      return res.json()
    },
    enabled: open && isConnected
  })

  const addMemberMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId })
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to add member')
      }
      return res.json()
    },
    onSuccess: (_, contactId) => {
      // Force refetch with fresh data
      queryClient.invalidateQueries({ queryKey: ['group', groupId] })
      queryClient.refetchQueries({ queryKey: ['group', groupId] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setAddedIds(prev => new Set(prev).add(contactId))
    }
  })

  const addByPhoneMutation = useMutation({
    mutationFn: async (phone: string) => {
      const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to add member')
      }
      return res.json()
    },
    onSuccess: () => {
      // Force refetch with fresh data
      queryClient.invalidateQueries({ queryKey: ['group', groupId] })
      queryClient.refetchQueries({ queryKey: ['group', groupId] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setSearch('')
      // Close modal after 1.5s to show success message
      setTimeout(() => onOpenChange(false), 1500)
    }
  })

  const formatPhoneDisplay = (phone: string) => {
    // Format phone number for better readability
    if (phone.length >= 10) {
      // Try to format as international number
      return '+' + phone.replace(/(\d{1,3})(\d{3})(\d{3})(\d{4})/, '$1 $2 $3 $4').trim()
    }
    return phone
  }

  const isPhoneNumber = (str: string) => {
    const cleaned = str.replace(/[^0-9+]/g, '')
    return cleaned.length >= 10
  }

  const handleAddByPhone = () => {
    const cleaned = search.replace(/[^0-9]/g, '')
    addByPhoneMutation.mutate(cleaned)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Person to Group</DialogTitle>
          <DialogDescription>
            Enter a phone number to add someone to the WhatsApp group
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Enter phone number (e.g. 14155551234)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {!isConnected && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              WhatsApp is not connected. Connect WhatsApp first to add members.
            </div>
          )}

          {isPhoneNumber(search) && (
            <div className="border-2 border-primary rounded-lg p-4 bg-primary/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{formatPhoneDisplay(search.replace(/[^0-9]/g, ''))}</p>
                    <p className="text-sm text-muted-foreground">Add this number to the group</p>
                  </div>
                </div>
                <Button
                  onClick={handleAddByPhone}
                  disabled={addByPhoneMutation.isPending || !isConnected}
                >
                  {addByPhoneMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add
                    </>
                  )}
                </Button>
              </div>
              {addByPhoneMutation.isError && (
                <p className="text-sm text-red-600 mt-2">
                  {addByPhoneMutation.error.message}
                </p>
              )}
              {addByPhoneMutation.isSuccess && (
                <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Added successfully!
                </p>
              )}
            </div>
          )}

          {isConnected && data?.contacts?.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Or select from existing contacts:
              </p>
              <div className="max-h-[250px] overflow-y-auto space-y-2">
                {data.contacts.map((contact: Contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{formatPhoneDisplay(contact.phone)}</p>
                        {(contact.name || contact.pushName) && (
                          <p className="text-sm text-muted-foreground">
                            {contact.name || contact.pushName}
                          </p>
                        )}
                      </div>
                    </div>
                    {addedIds.has(contact.id) ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Added
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addMemberMutation.mutate(contact.id)}
                        disabled={addMemberMutation.isPending || !isConnected}
                      >
                        {addMemberMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <UserPlus className="mr-2 h-4 w-4" />
                            Add
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {isConnected && isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isPhoneNumber(search) && !isLoading && data?.contacts?.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Enter a phone number to add someone</p>
              <p className="text-sm">Include country code (e.g. 14155551234)</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
