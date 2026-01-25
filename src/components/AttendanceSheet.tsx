'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Trash2, Check, X, Clock } from 'lucide-react'
import { useState } from 'react'

interface AttendanceRecord {
  id: string
  contactId: string
  contact: {
    id: string
    phone: string
    name: string | null
    pushName: string | null
  }
  status: string
  notes: string | null
  date: string
}

interface AttendanceSheetProps {
  groupId: string
  records: AttendanceRecord[]
  onRemoveMember: (contactId: string, recordId: string) => void
  isConnected: boolean
}

export function AttendanceSheet({
  groupId,
  records,
  onRemoveMember,
  isConnected
}: AttendanceSheetProps) {
  const queryClient = useQueryClient()
  const [editingNotes, setEditingNotes] = useState<string | null>(null)
  const [notesValue, setNotesValue] = useState('')

  const updateMutation = useMutation({
    mutationFn: async ({
      recordId,
      status,
      notes
    }: {
      recordId: string
      status?: string
      notes?: string
    }) => {
      const res = await fetch('/api/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, status, notes })
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance', groupId] })
    }
  })

  const handleStatusChange = (recordId: string, status: string) => {
    updateMutation.mutate({ recordId, status })
  }

  const handleNotesEdit = (record: AttendanceRecord) => {
    setEditingNotes(record.id)
    setNotesValue(record.notes || '')
  }

  const handleNotesSave = (recordId: string) => {
    updateMutation.mutate({ recordId, notes: notesValue })
    setEditingNotes(null)
    setNotesValue('')
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'present':
        return (
          <Badge className="bg-green-600 gap-1">
            <Check className="h-3 w-3" />
            Present
          </Badge>
        )
      case 'absent':
        return (
          <Badge variant="destructive" className="gap-1">
            <X className="h-3 w-3" />
            Absent
          </Badge>
        )
      case 'excused':
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            Excused
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getDisplayName = (contact: AttendanceRecord['contact']) => {
    return contact.name || contact.pushName || contact.phone
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <p className="text-muted-foreground">
          No members in attendance sheet yet.
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Add members using the &quot;Add Person&quot; button above.
        </p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Name</TableHead>
            <TableHead className="w-[150px]">Phone</TableHead>
            <TableHead className="w-[130px]">Status</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.id}>
              <TableCell className="font-medium">
                {getDisplayName(record.contact)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {record.contact.phone}
              </TableCell>
              <TableCell>
                <Select
                  value={record.status}
                  onValueChange={(value) => handleStatusChange(record.id, value)}
                  disabled={updateMutation.isPending}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue>
                      {getStatusBadge(record.status)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">
                      <div className="flex items-center gap-2">
                        <Check className="h-3 w-3 text-green-600" />
                        Present
                      </div>
                    </SelectItem>
                    <SelectItem value="absent">
                      <div className="flex items-center gap-2">
                        <X className="h-3 w-3 text-destructive" />
                        Absent
                      </div>
                    </SelectItem>
                    <SelectItem value="excused">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        Excused
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                {editingNotes === record.id ? (
                  <div className="flex gap-2">
                    <Textarea
                      value={notesValue}
                      onChange={(e) => setNotesValue(e.target.value)}
                      className="min-h-[60px]"
                      placeholder="Add notes..."
                    />
                    <div className="flex flex-col gap-1">
                      <Button
                        size="sm"
                        onClick={() => handleNotesSave(record.id)}
                        disabled={updateMutation.isPending}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingNotes(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="text-sm cursor-pointer hover:bg-accent rounded p-1 min-h-[40px]"
                    onClick={() => handleNotesEdit(record)}
                  >
                    {record.notes || (
                      <span className="text-muted-foreground italic">
                        Click to add notes...
                      </span>
                    )}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onRemoveMember(record.contactId, record.id)}
                  disabled={!isConnected}
                  title={!isConnected ? 'Connect first to remove members' : 'Remove from group'}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
