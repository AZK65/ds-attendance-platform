'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { ContactSearchModal } from '@/components/ContactSearchModal'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  UserPlus,
  FileDown,
  Loader2,
  RefreshCw,
  Users,
  AlertTriangle,
  Trash2,
  Shield,
  Send,
  BookOpen,
  CheckCircle,
  Video,
  UserCheck,
  UserX,
  Clock,
  Save,
  X,
  Undo2
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import Link from 'next/link'

interface Participant {
  id: string
  phone: string
  name?: string | null
  pushName?: string | null
  isAdmin?: boolean
  isSuperAdmin?: boolean
}

export default function GroupDetailPage() {
  const params = useParams()
  const groupId = decodeURIComponent(params.groupId as string)
  const queryClient = useQueryClient()

  const [showAddModal, setShowAddModal] = useState(false)
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)
  const [showSendClassMessage, setShowSendClassMessage] = useState(false)
  const [messageSentSuccess, setMessageSentSuccess] = useState(false)
  const [showZoomAttendance, setShowZoomAttendance] = useState(false)
  const [zoomMeetingId, setZoomMeetingId] = useState('4171672829') // Default meeting ID from your link
  const [selectedMeetingUUID, setSelectedMeetingUUID] = useState<string | null>(null)
  const [recentMeetings, setRecentMeetings] = useState<Array<{
    uuid: string
    startTime: string
    endTime: string
    duration: number
    participantsCount: number
  }>>([])
  const [zoomAttendanceData, setZoomAttendanceData] = useState<{
    matched: Array<{ whatsappName: string; whatsappPhone: string; zoomName: string; duration: number }>
    absent: Array<{ name: string; phone: string }>
    unmatchedZoom: Array<{ name: string; duration: number }>
  } | null>(null)
  const [zoomLoading, setZoomLoading] = useState(false)
  const [loadingMeetings, setLoadingMeetings] = useState(false)
  const [zoomError, setZoomError] = useState<string | null>(null)
  const [selectedAbsent, setSelectedAbsent] = useState<number | null>(null)
  const [manualMatches, setManualMatches] = useState<Array<{ whatsappName: string; whatsappPhone: string; zoomName: string; duration: number }>>([])
  const [removedAutoMatches, setRemovedAutoMatches] = useState<Array<{ whatsappName: string; whatsappPhone: string; zoomName: string; duration: number }>>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [loadedFromSave, setLoadedFromSave] = useState(false)

  const { data: statusData } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/status')
      return res.json()
    },
    refetchInterval: 5000
  })

  const {
    data: groupData,
    isLoading,
    isFetching,
    refetch
  } = useQuery({
    queryKey: ['group', groupId],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}`)
      return res.json()
    }
  })

  const removeMemberMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId })
      })
      if (!res.ok) throw new Error('Failed to remove member')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', groupId] })
      setRemoveConfirm(null)
    }
  })

  const sendClassMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      console.log('Sending class message:', message)
      const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        console.error('Send message failed:', res.status, errorData)
        throw new Error(errorData.error || 'Failed to send message')
      }
      return res.json()
    },
    onSuccess: () => {
      console.log('Message sent successfully!')
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['group', groupId] })
      setMessageSentSuccess(true)
      // Auto-close after 2 seconds
      setTimeout(() => {
        setShowSendClassMessage(false)
        setMessageSentSuccess(false)
      }, 2000)
    },
    onError: (error) => {
      console.error('Send message mutation error:', error)
      alert(`Failed to send message: ${error.message}`)
    }
  })

  const handleDownloadPDF = async () => {
    window.open(
      `/api/groups/${encodeURIComponent(groupId)}/pdf`,
      '_blank'
    )
  }

  const isConnected = statusData?.isConnected ?? false
  const group = groupData?.group
  const participants: Participant[] = groupData?.participants || []
  const currentModuleNumber = groupData?.moduleNumber || 0
  const lastModuleMessageDate = groupData?.lastModuleMessageDate ? new Date(groupData.lastModuleMessageDate) : null

  const getDisplayName = (p: Participant) => {
    return p.name || p.pushName || null
  }

  const formatPhone = (phone: string) => {
    // Format phone number with + prefix
    return '+' + phone
  }

  // Generate the next class message with module number +1
  const getNextClassMessage = () => {
    const nextModule = currentModuleNumber + 1
    return `Today's Module ${nextModule} Class will be from 5 pm to 7 pm. Please make sure to put your full name when joining the Zoom class. Invite Link : https://us02web.zoom.us/j/4171672829?pwd=ZTlHSEdmTGRYV1QraU5MaThqaC9Rdz09 — Password : qazi`
  }

  const handleSendClassMessage = () => {
    console.log('handleSendClassMessage called')
    const message = getNextClassMessage()
    console.log('Message to send:', message)
    console.log('Mutation state:', sendClassMessageMutation.status)
    sendClassMessageMutation.mutate(message)
  }

  // Fetch past meeting instances when dialog opens or meeting ID changes
  const handleFetchMeetingInstances = async () => {
    if (!zoomMeetingId) return

    setLoadingMeetings(true)
    setZoomError(null)
    setRecentMeetings([])
    setSelectedMeetingUUID(null)
    setZoomAttendanceData(null)

    try {
      const res = await fetch('/api/zoom/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: zoomMeetingId })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to fetch meeting instances')
      }

      const data = await res.json()
      const meetings = data.meetings || []
      setRecentMeetings(meetings)

      // Auto-select based on module message date if available
      if (meetings.length > 0) {
        let selectedUUID = meetings[0].uuid // Default to most recent

        // If we have a last module message date, find the meeting on the same day
        if (lastModuleMessageDate) {
          const matchingMeeting = meetings.find((m: { startTime: string }) =>
            isSameDay(new Date(m.startTime), lastModuleMessageDate)
          )
          if (matchingMeeting) {
            selectedUUID = matchingMeeting.uuid
            console.log(`Auto-selected meeting from ${matchingMeeting.startTime} to match module message date`)
          }
        }

        setSelectedMeetingUUID(selectedUUID)
      }
    } catch (error) {
      console.error('Fetch meetings error:', error)
      setZoomError(error instanceof Error ? error.message : 'Failed to fetch meeting instances')
    } finally {
      setLoadingMeetings(false)
    }
  }

  const handleCheckZoomAttendance = async () => {
    if (!selectedMeetingUUID) {
      setZoomError('Please select a meeting session first')
      return
    }

    setZoomLoading(true)
    setZoomError(null)
    setZoomAttendanceData(null)
    setManualMatches([])
    setRemovedAutoMatches([])
    setSelectedAbsent(null)
    setHasUnsavedChanges(false)
    setLoadedFromSave(false)
    setSaveSuccess(false)

    try {
      // First check if we have saved data for this meeting
      const savedRes = await fetch(`/api/zoom/attendance?groupId=${encodeURIComponent(groupId)}&meetingUUID=${encodeURIComponent(selectedMeetingUUID)}`)
      const savedData = await savedRes.json()

      if (savedData.found) {
        // Load from saved data
        setZoomAttendanceData({
          matched: savedData.data.matched,
          absent: savedData.data.absent,
          unmatchedZoom: savedData.data.unmatchedZoom
        })
        setLoadedFromSave(true)
        setZoomLoading(false)
        return
      }

      // No saved data, fetch fresh from Zoom API
      const res = await fetch('/api/zoom/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: selectedMeetingUUID,
          groupId: groupId
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to fetch Zoom attendance')
      }

      const data = await res.json()
      setZoomAttendanceData(data)
    } catch (error) {
      console.error('Zoom attendance error:', error)
      setZoomError(error instanceof Error ? error.message : 'Failed to fetch Zoom attendance')
    } finally {
      setZoomLoading(false)
    }
  }

  const handleSaveAttendance = async () => {
    if (!zoomAttendanceData || !selectedMeetingUUID) return

    setIsSaving(true)
    setSaveSuccess(false)

    try {
      // Get the effective matched/absent lists (accounting for manual changes)
      const effectiveMatched = [
        ...zoomAttendanceData.matched.filter(m => !removedAutoMatches.some(r => r.whatsappPhone === m.whatsappPhone)),
        ...manualMatches
      ]
      const effectiveAbsent = zoomAttendanceData.absent.filter(
        a => !manualMatches.some(m => m.whatsappPhone === a.phone)
      )
      // Add back people who were removed from auto-match to absent
      const removedToAbsent = removedAutoMatches.map(r => ({ name: r.whatsappName, phone: r.whatsappPhone }))
      const allAbsent = [...effectiveAbsent, ...removedToAbsent]

      // Get unmatched zoom (excluding those that were manually matched)
      const effectiveUnmatched = zoomAttendanceData.unmatchedZoom.filter(
        u => !manualMatches.some(m => m.zoomName === u.name)
      )
      // Add back zoom names from removed auto-matches
      const removedZoomNames = removedAutoMatches.map(r => ({ name: r.zoomName, duration: r.duration }))
      const allUnmatched = [...effectiveUnmatched, ...removedZoomNames]

      const selectedMeeting = recentMeetings.find(m => m.uuid === selectedMeetingUUID)
      const meetingDate = selectedMeeting?.startTime || new Date().toISOString()

      console.log('Saving attendance:', {
        groupId,
        meetingUUID: selectedMeetingUUID,
        meetingDate,
        matched: effectiveMatched.length,
        absent: allAbsent.length,
        unmatchedZoom: allUnmatched.length
      })

      const res = await fetch('/api/zoom/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          meetingUUID: selectedMeetingUUID,
          meetingDate,
          moduleNumber: currentModuleNumber || undefined,
          matched: effectiveMatched,
          absent: allAbsent,
          unmatchedZoom: allUnmatched
        })
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        console.error('Save response error:', errorData)
        throw new Error(errorData.error || 'Failed to save attendance')
      }

      // Save manual matches as learned matches for future auto-matching
      if (manualMatches.length > 0) {
        try {
          await fetch('/api/zoom/learned-matches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              matches: manualMatches.map(m => ({
                zoomName: m.zoomName,
                whatsappPhone: m.whatsappPhone,
                whatsappName: m.whatsappName
              }))
            })
          })
          console.log(`Saved ${manualMatches.length} learned matches for future use`)
        } catch (learnedError) {
          console.error('Failed to save learned matches:', learnedError)
          // Don't fail the whole save if learned matches fail
        }
      }

      setSaveSuccess(true)
      setHasUnsavedChanges(false)
      // Update the local state to reflect saved data
      setZoomAttendanceData({
        matched: effectiveMatched,
        absent: allAbsent,
        unmatchedZoom: allUnmatched
      })
      setManualMatches([])
      setRemovedAutoMatches([])
      setLoadedFromSave(true)

      // Hide success message after 2 seconds
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (error) {
      console.error('Save attendance error:', error)
      alert('Failed to save attendance')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemoveMatch = (match: { whatsappName: string; whatsappPhone: string; zoomName: string; duration: number }, isManual: boolean) => {
    if (isManual) {
      // Remove from manual matches
      setManualMatches(prev => prev.filter(m => m.whatsappPhone !== match.whatsappPhone))
    } else {
      // Add to removed auto-matches
      setRemovedAutoMatches(prev => [...prev, match])
    }
    setHasUnsavedChanges(true)
  }

  const handleUndoRemove = (match: { whatsappName: string; whatsappPhone: string; zoomName: string; duration: number }) => {
    setRemovedAutoMatches(prev => prev.filter(m => m.whatsappPhone !== match.whatsappPhone))
    setHasUnsavedChanges(true)
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    if (mins < 60) return `${mins} min`
    const hours = Math.floor(mins / 60)
    const remainingMins = mins % 60
    return `${hours}h ${remainingMins}m`
  }

  // Helper to identify generic/device names that need manual matching
  const isGenericZoomName = (name: string): boolean => {
    const lowerName = name.toLowerCase().trim()
    const genericPatterns = [
      'iphone', 'ipad', 'android', 'samsung', 'pixel', 'galaxy',
      'zoom user', 'mobile user', 'phone', 'tablet', 'device',
      'user', 'guest', 'unknown', 'participant'
    ]
    // Check if name matches common device/generic patterns
    return genericPatterns.some(pattern => lowerName.includes(pattern)) ||
           // Also flag very short names (1-2 chars) or pure numbers
           lowerName.length <= 2 ||
           /^\d+$/.test(lowerName)
  }

  // Helper to check if two dates are on the same day
  const isSameDay = (date1: Date, date2: Date) => {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate()
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/groups">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold">
                {group?.name || 'Loading...'}
              </h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-3 w-3" />
                {participants.length} members
              </div>
            </div>
          </div>
          <ConnectionStatus />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              <Users className="h-3 w-3 mr-1" />
              {participants.length} members
            </Badge>
            {currentModuleNumber > 0 && (
              <Badge variant="default">
                <BookOpen className="h-3 w-3 mr-1" />
                Module {currentModuleNumber}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadPDF}
              disabled={participants.length === 0}
            >
              <FileDown className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
            <Button onClick={() => setShowAddModal(true)} disabled={!isConnected}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Person
            </Button>
            <Button
              onClick={() => setShowSendClassMessage(true)}
              disabled={!isConnected}
              variant="default"
            >
              <Send className="mr-2 h-4 w-4" />
              Send Class Message
            </Button>
            <Button
              onClick={() => setShowZoomAttendance(true)}
              variant="default"
            >
              <Video className="mr-2 h-4 w-4" />
              Process Attendance
            </Button>
          </div>
        </div>

        {!isConnected && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800">
                Not connected
              </p>
              <p className="text-sm text-yellow-700">
                Connect first to add or remove members.
              </p>
            </div>
            <Link href="/connect" className="ml-auto">
              <Button size="sm">Connect</Button>
            </Link>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : participants.length === 0 ? (
          <div className="text-center py-12 border rounded-lg">
            <p className="text-muted-foreground">
              No members found in this group.
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Name / Phone</TableHead>
                  <TableHead className="w-[100px]">Role</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {participants.map((participant, index) => (
                  <TableRow key={participant.id}>
                    <TableCell className="text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <div>
                        {getDisplayName(participant) ? (
                          <>
                            <p className="font-medium">{getDisplayName(participant)}</p>
                            <p className="text-sm text-muted-foreground">{formatPhone(participant.phone)}</p>
                          </>
                        ) : (
                          <p className="font-medium">{formatPhone(participant.phone)}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {participant.isSuperAdmin ? (
                        <Badge variant="secondary" className="gap-1">
                          <Shield className="h-3 w-3" />
                          Owner
                        </Badge>
                      ) : participant.isAdmin ? (
                        <Badge variant="secondary" className="gap-1">
                          <Shield className="h-3 w-3" />
                          Admin
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Member</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setRemoveConfirm(participant.id)}
                        disabled={!isConnected || participant.isSuperAdmin}
                        title={
                          participant.isSuperAdmin
                            ? "Can't remove group owner"
                            : !isConnected
                            ? 'Connect first to remove members'
                            : 'Remove from group'
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      <ContactSearchModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        groupId={groupId}
        isConnected={isConnected}
      />

      <Dialog
        open={removeConfirm !== null}
        onOpenChange={() => setRemoveConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              This will remove the person from the group. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeConfirm && removeMemberMutation.mutate(removeConfirm)}
              disabled={removeMemberMutation.isPending}
            >
              {removeMemberMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showSendClassMessage}
        onOpenChange={(open) => {
          if (!open) {
            setShowSendClassMessage(false)
            setMessageSentSuccess(false)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          {messageSentSuccess ? (
            <>
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <div className="rounded-full bg-green-100 p-3">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-green-800">Message Sent!</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Module {currentModuleNumber + 1} class message has been sent to the group.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Send Class Message
                </DialogTitle>
                <DialogDescription>
                  This will send the following message to the group:
                </DialogDescription>
              </DialogHeader>
              <div className="bg-muted p-4 rounded-lg text-sm whitespace-pre-wrap">
                {getNextClassMessage()}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <BookOpen className="h-4 w-4" />
                Current: Module {currentModuleNumber || 'N/A'} → Next: Module {currentModuleNumber + 1}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowSendClassMessage(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSendClassMessage}
                  disabled={sendClassMessageMutation.isPending}
                >
                  {sendClassMessageMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send Message
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showZoomAttendance}
        onOpenChange={(open) => {
          if (!open) {
            setShowZoomAttendance(false)
            setZoomAttendanceData(null)
            setZoomError(null)
          }
        }}
      >
        <DialogContent className="max-w-6xl w-[95vw] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Process Attendance
            </DialogTitle>
            <DialogDescription>
              Match Zoom participants with WhatsApp group members and generate attendance report.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Step 1: Enter Meeting ID and fetch instances */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Step 1: Enter Meeting ID</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Zoom Meeting ID (e.g., 4171672829)"
                  value={zoomMeetingId}
                  onChange={(e) => setZoomMeetingId(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={handleFetchMeetingInstances}
                  disabled={loadingMeetings || !zoomMeetingId}
                  variant="secondary"
                >
                  {loadingMeetings ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Load Sessions
                </Button>
              </div>
            </div>

            {/* Step 2: Select meeting session */}
            {recentMeetings.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Step 2: Select Class Session</label>
                {lastModuleMessageDate && (
                  <p className="text-xs text-muted-foreground">
                    Module {currentModuleNumber} message was sent on{' '}
                    <span className="font-medium">
                      {lastModuleMessageDate.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                    {' '}- matching session auto-selected
                  </p>
                )}
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                  {recentMeetings.map((meeting) => {
                    const meetingDate = new Date(meeting.startTime)
                    const isMatchingDate = lastModuleMessageDate && isSameDay(meetingDate, lastModuleMessageDate)

                    return (
                      <div
                        key={meeting.uuid}
                        className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                          selectedMeetingUUID === meeting.uuid ? 'bg-primary/10 border-l-4 border-l-primary' : ''
                        }`}
                        onClick={() => setSelectedMeetingUUID(meeting.uuid)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium flex items-center gap-2">
                              {meetingDate.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                              {isMatchingDate && (
                                <Badge variant="secondary" className="text-xs">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Matches Module {currentModuleNumber}
                                </Badge>
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {meetingDate.toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit'
                              })}
                              {' - '}
                              {new Date(meeting.endTime).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">{meeting.participantsCount} joined</p>
                            <p className="text-xs text-muted-foreground">{formatDuration(meeting.duration * 60)}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Check attendance */}
            {selectedMeetingUUID && (
              <div className="flex justify-end">
                <Button
                  onClick={handleCheckZoomAttendance}
                  disabled={zoomLoading}
                >
                  {zoomLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserCheck className="mr-2 h-4 w-4" />
                  )}
                  Check Attendance
                </Button>
              </div>
            )}

            {zoomError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
                <p className="font-medium">Error</p>
                <p className="text-sm">{zoomError}</p>
              </div>
            )}

            {zoomAttendanceData && (
              <div className="space-y-6">
                {/* Calculate stats including manual matches and removed matches */}
                {(() => {
                  const effectiveAutoMatches = zoomAttendanceData.matched.filter(
                    m => !removedAutoMatches.some(r => r.whatsappPhone === m.whatsappPhone)
                  )
                  const totalPresent = effectiveAutoMatches.length + manualMatches.length
                  // Remaining absent = original absent - manually matched + removed auto matches
                  const originalAbsentNotManuallyMatched = zoomAttendanceData.absent.filter(
                    a => !manualMatches.some(m => m.whatsappPhone === a.phone)
                  )
                  const remainingAbsent = originalAbsentNotManuallyMatched.length + removedAutoMatches.length
                  // Remaining unmatched zoom = original unmatched - manually matched + removed auto matches zoom names
                  const originalUnmatchedNotManuallyMatched = zoomAttendanceData.unmatchedZoom.filter(
                    u => !manualMatches.some(m => m.zoomName === u.name)
                  )
                  const remainingUnmatched = [
                    ...originalUnmatchedNotManuallyMatched,
                    ...removedAutoMatches.map(r => ({ name: r.zoomName, duration: r.duration }))
                  ]
                  const genericNames = remainingUnmatched.filter(u => isGenericZoomName(u.name))
                  const needsManualMatch = genericNames.length

                  return (
                    <>
                      {/* Summary */}
                      <div className="grid grid-cols-4 gap-3">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                          <div className="flex items-center justify-center gap-2 text-green-700">
                            <UserCheck className="h-5 w-5" />
                            <span className="text-2xl font-bold">{totalPresent}</span>
                          </div>
                          <p className="text-sm text-green-600">Present</p>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                          <div className="flex items-center justify-center gap-2 text-red-700">
                            <UserX className="h-5 w-5" />
                            <span className="text-2xl font-bold">{remainingAbsent}</span>
                          </div>
                          <p className="text-sm text-red-600">Absent</p>
                        </div>
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                          <div className="flex items-center justify-center gap-2 text-orange-700">
                            <AlertTriangle className="h-5 w-5" />
                            <span className="text-2xl font-bold">{needsManualMatch}</span>
                          </div>
                          <p className="text-sm text-orange-600">Need Match</p>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                          <div className="flex items-center justify-center gap-2 text-gray-700">
                            <Users className="h-5 w-5" />
                            <span className="text-2xl font-bold">{remainingUnmatched.length - needsManualMatch}</span>
                          </div>
                          <p className="text-sm text-gray-600">Other</p>
                        </div>
                      </div>

                      {/* Warning about generic names */}
                      {needsManualMatch > 0 && (
                        <div className="bg-orange-50 border border-orange-300 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="font-medium text-orange-800">
                                {needsManualMatch} student{needsManualMatch > 1 ? 's' : ''} joined with device names instead of real names
                              </p>
                              <p className="text-sm text-orange-700 mt-1">
                                The following Zoom names couldn&apos;t be auto-matched. You can manually match them below,
                                or remind students to set their proper name in Zoom settings.
                              </p>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {genericNames.map((g, i) => (
                                  <Badge key={i} variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">
                                    {g.name} ({formatDuration(g.duration)})
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}

                {/* Load status indicator */}
                {loadedFromSave && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-600" />
                    <span className="text-sm text-blue-800">Loaded from saved data</span>
                  </div>
                )}

                {/* Unsaved changes warning */}
                {hasUnsavedChanges && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm text-yellow-800">You have unsaved changes</span>
                  </div>
                )}

                {/* Removed matches (can be undone) */}
                {removedAutoMatches.length > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">Removed matches ({removedAutoMatches.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {removedAutoMatches.map((m, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="text-xs bg-gray-100 text-gray-600 border-gray-300 cursor-pointer hover:bg-gray-200"
                          onClick={() => handleUndoRemove(m)}
                        >
                          {m.whatsappName} ↔ {m.zoomName}
                          <Undo2 className="h-3 w-3 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Present Students - Auto-matched + Manual matches */}
                {(() => {
                  const effectiveAutoMatches = zoomAttendanceData.matched.filter(
                    m => !removedAutoMatches.some(r => r.whatsappPhone === m.whatsappPhone)
                  )
                  const totalPresent = effectiveAutoMatches.length + manualMatches.length

                  if (totalPresent === 0) return null

                  return (
                    <div>
                      <h4 className="font-semibold text-green-700 mb-2 flex items-center gap-2">
                        <UserCheck className="h-4 w-4" />
                        Present ({totalPresent})
                        {manualMatches.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {manualMatches.length} manually matched
                          </Badge>
                        )}
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>WhatsApp Name</TableHead>
                              <TableHead>Zoom Name</TableHead>
                              <TableHead>Duration</TableHead>
                              <TableHead className="w-[80px]">Match</TableHead>
                              <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {/* Auto-matched (excluding removed) */}
                            {effectiveAutoMatches.map((m, i) => (
                              <TableRow key={`auto-${i}`} className="bg-green-50/50">
                                <TableCell>
                                  <div>
                                    <p className="font-medium">{m.whatsappName}</p>
                                    <p className="text-xs text-muted-foreground">+{m.whatsappPhone}</p>
                                  </div>
                                </TableCell>
                                <TableCell>{m.zoomName}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1 text-green-700">
                                    <Clock className="h-3 w-3" />
                                    {formatDuration(m.duration)}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs text-green-700">Auto</Badge>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-gray-400 hover:text-red-500"
                                    onClick={() => handleRemoveMatch(m, false)}
                                    title="Remove this match"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                            {/* Manual matches */}
                            {manualMatches.map((m, i) => (
                              <TableRow key={`manual-${i}`} className="bg-blue-50/50">
                                <TableCell>
                                  <div>
                                    <p className="font-medium">{m.whatsappName}</p>
                                    <p className="text-xs text-muted-foreground">+{m.whatsappPhone}</p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    {m.zoomName}
                                    {isGenericZoomName(m.zoomName) && (
                                      <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">device</Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1 text-green-700">
                                    <Clock className="h-3 w-3" />
                                    {formatDuration(m.duration)}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs text-blue-700 border-blue-300">Manual</Badge>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-gray-400 hover:text-red-500"
                                    onClick={() => handleRemoveMatch(m, true)}
                                    title="Remove this match"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )
                })()}

                {/* Manual Matching Section - Interactive */}
                {(() => {
                  // Remaining absent = original absent - manually matched + removed auto matches
                  const originalAbsentNotManuallyMatched = zoomAttendanceData.absent.filter(
                    a => !manualMatches.some(m => m.whatsappPhone === a.phone)
                  )
                  const removedToAbsent = removedAutoMatches.map(r => ({ name: r.whatsappName, phone: r.whatsappPhone }))
                  const remainingAbsent = [...originalAbsentNotManuallyMatched, ...removedToAbsent]

                  // Remaining unmatched zoom = original unmatched - manually matched + removed auto matches zoom names
                  const originalUnmatchedNotManuallyMatched = zoomAttendanceData.unmatchedZoom.filter(
                    u => !manualMatches.some(m => m.zoomName === u.name)
                  )
                  const removedZoomNames = removedAutoMatches.map(r => ({ name: r.zoomName, duration: r.duration }))
                  const remainingUnmatched = [...originalUnmatchedNotManuallyMatched, ...removedZoomNames]

                  if (remainingAbsent.length === 0 && remainingUnmatched.length === 0) {
                    return null
                  }

                  return (
                    <div>
                      <h4 className="font-semibold text-orange-700 mb-2 flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Manual Matching
                      </h4>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                        <p className="text-sm text-blue-800">
                          <strong>How to match:</strong> Click a WhatsApp name on the left to select it (turns blue),
                          then click the corresponding Zoom name on the right to link them.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {/* Absent (WhatsApp members not matched) */}
                        <div>
                          <p className="text-sm font-medium text-red-700 mb-2 flex items-center gap-2">
                            <UserX className="h-4 w-4" />
                            Unmatched WhatsApp ({remainingAbsent.length})
                          </p>
                          <div className="border border-red-200 rounded-lg max-h-64 overflow-y-auto">
                            {remainingAbsent.map((a, i) => (
                              <div
                                key={i}
                                className={`p-2 border-b border-red-100 last:border-b-0 cursor-pointer transition-colors ${
                                  selectedAbsent === i
                                    ? 'bg-blue-100 border-l-4 border-l-blue-500'
                                    : 'bg-red-50/50 hover:bg-red-100'
                                }`}
                                onClick={() => setSelectedAbsent(selectedAbsent === i ? null : i)}
                              >
                                <p className="font-medium text-sm">{a.name}</p>
                                <p className="text-xs text-muted-foreground">+{a.phone}</p>
                                {selectedAbsent === i && (
                                  <p className="text-xs text-blue-600 mt-1">Selected - now click a Zoom name →</p>
                                )}
                              </div>
                            ))}
                            {remainingAbsent.length === 0 && (
                              <p className="p-2 text-sm text-green-600">All members matched!</p>
                            )}
                          </div>
                        </div>

                        {/* Unmatched Zoom Participants */}
                        <div>
                          <p className="text-sm font-medium text-yellow-700 mb-2 flex items-center gap-2">
                            <Video className="h-4 w-4" />
                            Unmatched Zoom ({remainingUnmatched.length})
                          </p>
                          <div className="border border-yellow-200 rounded-lg max-h-64 overflow-y-auto">
                            {remainingUnmatched.map((u, i) => {
                              const isGeneric = isGenericZoomName(u.name)
                              const selectedPerson = selectedAbsent !== null ? remainingAbsent[selectedAbsent] : null

                              return (
                                <div
                                  key={i}
                                  className={`p-2 border-b border-yellow-100 last:border-b-0 transition-colors ${
                                    isGeneric ? 'bg-orange-50' : 'bg-yellow-50/50'
                                  } ${
                                    selectedAbsent !== null
                                      ? 'cursor-pointer hover:bg-green-100'
                                      : ''
                                  }`}
                                  onClick={() => {
                                    if (selectedAbsent !== null && selectedPerson) {
                                      setManualMatches([...manualMatches, {
                                        whatsappName: selectedPerson.name,
                                        whatsappPhone: selectedPerson.phone,
                                        zoomName: u.name,
                                        duration: u.duration
                                      }])
                                      setSelectedAbsent(null)
                                      setHasUnsavedChanges(true)
                                    }
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-sm">{u.name}</p>
                                    {isGeneric && (
                                      <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-300">
                                        device name
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">{formatDuration(u.duration)}</p>
                                  {selectedAbsent !== null && selectedPerson && (
                                    <p className="text-xs text-green-600 mt-1 font-medium">
                                      Click to match with &quot;{selectedPerson.name}&quot;
                                    </p>
                                  )}
                                </div>
                              )
                            })}
                            {remainingUnmatched.length === 0 && (
                              <p className="p-2 text-sm text-green-600">All participants matched!</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Current selection indicator */}
                      {selectedAbsent !== null && remainingAbsent[selectedAbsent] && (
                        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                          <p className="text-sm text-blue-800">
                            <strong>Selected:</strong> &quot;{remainingAbsent[selectedAbsent].name}&quot;
                            — Click a Zoom name to match, or click the name again to deselect.
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedAbsent(null)}
                            className="text-blue-700"
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowZoomAttendance(false)}>
              Close
            </Button>
            {zoomAttendanceData && (
              <>
                {/* Save Button */}
                <Button
                  variant={hasUnsavedChanges ? "default" : "outline"}
                  onClick={handleSaveAttendance}
                  disabled={isSaving}
                  className={saveSuccess ? "bg-green-600 hover:bg-green-700" : ""}
                >
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : saveSuccess ? (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {saveSuccess ? "Saved!" : hasUnsavedChanges ? "Save Changes" : "Save"}
                </Button>

                {/* Download PDF Button */}
                <Button
                  onClick={async () => {
                    // Get effective auto-matched (excluding removed)
                    const effectiveAutoMatches = zoomAttendanceData.matched.filter(
                      m => !removedAutoMatches.some(r => r.whatsappPhone === m.whatsappPhone)
                    )
                    // Combine effective auto-matched + manual matches as present
                    const allMatched = [...effectiveAutoMatches, ...manualMatches]

                    // Get remaining absent (those not manually matched + removed auto matches)
                    const originalAbsentNotManuallyMatched = zoomAttendanceData.absent.filter(
                      a => !manualMatches.some(m => m.whatsappPhone === a.phone)
                    )
                    const removedToAbsent = removedAutoMatches.map(r => ({ name: r.whatsappName, phone: r.whatsappPhone }))
                    const remainingAbsent = [...originalAbsentNotManuallyMatched, ...removedToAbsent]

                    // Build records for PDF
                    const records = [
                      ...allMatched.map(m => ({
                        whatsappName: m.whatsappName,
                        whatsappPhone: m.whatsappPhone,
                        zoomName: m.zoomName,
                        duration: m.duration,
                        status: 'present' as const
                      })),
                      ...remainingAbsent.map(a => ({
                        whatsappName: a.name,
                        whatsappPhone: a.phone,
                        zoomName: '',
                        duration: 0,
                        status: 'absent' as const
                      }))
                    ]

                    // Get selected meeting date for the PDF
                    const selectedMeeting = recentMeetings.find(m => m.uuid === selectedMeetingUUID)
                    const meetingDate = selectedMeeting
                      ? new Date(selectedMeeting.startTime).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })
                      : undefined

                    try {
                      const res = await fetch('/api/attendance/zoom-pdf', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          groupName: group?.name || 'Unknown Group',
                          records,
                          date: meetingDate,
                          moduleNumber: currentModuleNumber || undefined
                        })
                      })

                      if (!res.ok) {
                        throw new Error('Failed to generate PDF')
                      }

                      // Download the PDF
                      const blob = await res.blob()
                      const url = window.URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `attendance-${(group?.name || 'group').replace(/[^a-z0-9]/gi, '-')}-${new Date().toISOString().split('T')[0]}.pdf`
                      document.body.appendChild(a)
                      a.click()
                      window.URL.revokeObjectURL(url)
                      document.body.removeChild(a)
                    } catch (error) {
                      console.error('PDF download error:', error)
                      alert('Failed to download PDF')
                    }
                  }}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
