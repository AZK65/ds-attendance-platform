'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useState, useMemo } from 'react'
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
  Undo2,
  Bell,
  Check,
  XCircle,
  CalendarDays
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import { motion } from 'motion/react'

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
}

const fadeSlideUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
}

const MotionTableBody = motion.create(TableBody)
const MotionTableRow = motion.create(TableRow)

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

  // Send Reminder state
  const [showSendReminder, setShowSendReminder] = useState(false)
  const [reminderModule, setReminderModule] = useState<number>(0)
  const [reminderTime, setReminderTime] = useState('5 pm to 7 pm')
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [reminderSending, setReminderSending] = useState(false)
  const [reminderLog, setReminderLog] = useState<Array<{ phone: string; name: string; status: 'sent' | 'failed' | 'pending'; error?: string }>>([])
  const [reminderDone, setReminderDone] = useState(false)
  const [reminderSummary, setReminderSummary] = useState<{ sent: number; failed: number; total: number } | null>(null)
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduleSuccess, setScheduleSuccess] = useState(false)
  const [classDate, setClassDate] = useState('')
  const [scheduleGroupReminder, setScheduleGroupReminder] = useState(true) // Auto-schedule group reminder at 12pm on class day

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

  // Fetch last/next class for all participants
  const participantPhones = useMemo(() => participants.map(p => p.phone), [participants])

  const { data: batchClassesData } = useQuery({
    queryKey: ['batch-classes', groupId, participantPhones],
    queryFn: async () => {
      const res = await fetch('/api/scheduling/batch-classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones: participantPhones }),
      })
      if (!res.ok) return { results: {} }
      return res.json() as Promise<{
        results: Record<string, {
          lastClass: { date: string; title: string } | null
          nextClass: { date: string; title: string } | null
        }>
      }>
    },
    enabled: participantPhones.length > 0,
    staleTime: 60 * 1000,
  })

  const getClassInfo = (phone: string) => {
    return batchClassesData?.results?.[phone] || { lastClass: null, nextClass: null }
  }

  const formatRelativeDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      // Future
      const absDays = Math.abs(diffDays)
      if (absDays === 0) return 'Today'
      if (absDays === 1) return 'Tomorrow'
      if (absDays < 7) return `In ${absDays}d`
      if (absDays < 30) return `In ${Math.floor(absDays / 7)}w`
      return `In ${Math.floor(absDays / 30)}mo`
    } else {
      if (diffDays === 0) return 'Today'
      if (diffDays === 1) return '1d ago'
      if (diffDays < 7) return `${diffDays}d ago`
      if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
      return `${Math.floor(diffDays / 30)}mo ago`
    }
  }

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
    // Strip parenthesized content to get the "real" name portion
    const nameWithoutParens = lowerName.replace(/\s*\([^)]*\)/g, '').trim()
    const genericPatterns = [
      'iphone', 'ipad', 'android', 'samsung', 'pixel', 'galaxy',
      'zoom user', 'mobile user', 'phone', 'tablet', 'device',
      'user', 'guest', 'unknown', 'participant'
    ]
    // Only flag as generic if the name WITHOUT parenthesized content is itself
    // a device/generic name, empty, very short, or pure numbers.
    // "Ahmed (iPhone)" -> nameWithoutParens = "ahmed" -> NOT generic
    // "iPhone" -> nameWithoutParens = "iphone" -> generic
    // "Ahmed's iPhone" -> nameWithoutParens = "ahmed's iphone" -> check if entire name is generic
    if (!nameWithoutParens || nameWithoutParens.length <= 2 || /^\d+$/.test(nameWithoutParens)) {
      return true
    }
    // Check if the stripped name itself is entirely a device/generic term
    return genericPatterns.some(pattern => nameWithoutParens === pattern) ||
           // Also check possessive device names like "ahmed's iphone"
           genericPatterns.some(pattern => /^[\w']+ /.test(nameWithoutParens) && nameWithoutParens.endsWith(pattern))
  }

  // Helper to check if two dates are on the same day
  const isSameDay = (date1: Date, date2: Date) => {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate()
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
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

          <motion.div
            className="flex flex-wrap gap-2"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={fadeSlideUp}>
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
            </motion.div>
            <motion.div variants={fadeSlideUp}>
              <Button
                variant="outline"
                onClick={handleDownloadPDF}
                disabled={participants.length === 0}
              >
                <FileDown className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
            </motion.div>
            <motion.div variants={fadeSlideUp}>
              <Button onClick={() => setShowAddModal(true)} disabled={!isConnected}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Person
              </Button>
            </motion.div>
            <motion.div variants={fadeSlideUp}>
              <Button
                onClick={() => setShowSendClassMessage(true)}
                disabled={!isConnected}
                variant="default"
              >
                <Send className="mr-2 h-4 w-4" />
                Send Class Message
              </Button>
            </motion.div>
            <motion.div variants={fadeSlideUp}>
              <Button
                onClick={() => {
                  setReminderModule(currentModuleNumber + 1)
                  setReminderTime('5 pm to 7 pm')
                  setSelectedMembers(new Set(participants.filter(p => !p.isSuperAdmin).map(p => p.phone)))
                  setReminderLog([])
                  setReminderDone(false)
                  setReminderSummary(null)
                  setReminderSending(false)
                  setScheduleMode('now')
                  setScheduleDate('')
                  setScheduleTime('')
                  setScheduleSuccess(false)
                  setClassDate('')
                  setShowSendReminder(true)
                }}
                disabled={!isConnected || participants.length === 0}
                variant="outline"
              >
                <Bell className="mr-2 h-4 w-4" />
                Send Reminder
              </Button>
            </motion.div>
            <motion.div variants={fadeSlideUp}>
              <Link href={`/groups/${encodeURIComponent(groupId)}/attendance`}>
                <Button variant="default">
                  <Video className="mr-2 h-4 w-4" />
                  Live Attendance
                </Button>
              </Link>
            </motion.div>
            <motion.div variants={fadeSlideUp}>
              <Button
                onClick={() => setShowZoomAttendance(true)}
                variant="outline"
              >
                <Video className="mr-2 h-4 w-4" />
                Process Attendance
              </Button>
            </motion.div>
          </motion.div>
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
          <div className="border rounded-lg overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Name / Phone</TableHead>
                  <TableHead className="w-[120px]">Last Class</TableHead>
                  <TableHead className="w-[120px]">Next Class</TableHead>
                  <TableHead className="w-[100px]">Role</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <MotionTableBody
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {participants.map((participant, index) => (
                  <MotionTableRow key={participant.id} variants={fadeSlideUp}>
                    <TableCell className="text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/groups/${encodeURIComponent(groupId)}/student/${encodeURIComponent(participant.id)}`}
                        className="block hover:underline"
                      >
                        {getDisplayName(participant) ? (
                          <>
                            <p className="font-medium">{getDisplayName(participant)}</p>
                            <p className="text-sm text-muted-foreground">{formatPhone(participant.phone)}</p>
                          </>
                        ) : (
                          <p className="font-medium">{formatPhone(participant.phone)}</p>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const { lastClass } = getClassInfo(participant.phone)
                        if (!lastClass) return <span className="text-muted-foreground text-xs">—</span>
                        const relative = formatRelativeDate(lastClass.date)
                        const dateObj = new Date(lastClass.date)
                        const formatted = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        // Color code: red if > 14 days ago, yellow if > 7 days
                        const diffDays = Math.floor((Date.now() - dateObj.getTime()) / (1000 * 60 * 60 * 24))
                        const color = diffDays > 14 ? 'text-red-600' : diffDays > 7 ? 'text-yellow-600' : 'text-muted-foreground'
                        return (
                          <div className="text-xs">
                            <p className="font-medium">{formatted}</p>
                            <p className={color}>{relative}</p>
                          </div>
                        )
                      })()}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const { nextClass } = getClassInfo(participant.phone)
                        if (!nextClass) return <span className="text-muted-foreground text-xs">—</span>
                        const relative = formatRelativeDate(nextClass.date)
                        const dateObj = new Date(nextClass.date)
                        const formatted = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        return (
                          <div className="text-xs">
                            <p className="font-medium">{formatted}</p>
                            <p className="text-green-600">{relative}</p>
                          </div>
                        )
                      })()}
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
                  </MotionTableRow>
                ))}
              </MotionTableBody>
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
        <DialogContent className="w-[95vw] sm:max-w-6xl max-h-[80vh] overflow-y-auto">
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
                <div className="border rounded-lg divide-y max-h-[50vh] sm:max-h-48 overflow-y-auto">
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
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                      <div className="border rounded-lg overflow-x-auto">
                        <Table className="min-w-[600px]">
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
                                    className="h-8 w-8 sm:h-6 sm:w-6 text-gray-400 hover:text-red-500"
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
                                    className="h-8 w-8 sm:h-6 sm:w-6 text-gray-400 hover:text-red-500"
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

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Absent (WhatsApp members not matched) */}
                        <div>
                          <p className="text-sm font-medium text-red-700 mb-2 flex items-center gap-2">
                            <UserX className="h-4 w-4" />
                            Unmatched WhatsApp ({remainingAbsent.length})
                          </p>
                          <div className="border border-red-200 rounded-lg max-h-[40vh] sm:max-h-64 overflow-y-auto">
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
                          <div className="border border-yellow-200 rounded-lg max-h-[40vh] sm:max-h-64 overflow-y-auto">
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

      {/* Send Reminder Dialog */}
      <Dialog
        open={showSendReminder}
        onOpenChange={(open) => {
          if (!open && !reminderSending) {
            setShowSendReminder(false)
          }
        }}
      >
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {scheduleSuccess ? (
            <>
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <div className="rounded-full bg-green-100 p-3">
                  <CalendarDays className="h-8 w-8 text-green-600" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-green-800">Reminder Scheduled!</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Module {reminderModule} reminder will be sent to {selectedMembers.size} members on{' '}
                    {new Date(`${scheduleDate}T${scheduleTime}`).toLocaleString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            </>
          ) : !reminderSending && !reminderDone ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Send Private Reminder
                </DialogTitle>
                <DialogDescription>
                  Send individual private messages to selected members about an upcoming class.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Module, Date & Time */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium">Module Number</label>
                    <Input
                      type="number"
                      value={reminderModule}
                      onChange={(e) => setReminderModule(parseInt(e.target.value) || 0)}
                      min={1}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Class Date</label>
                    <Input
                      type="date"
                      value={classDate}
                      onChange={(e) => setClassDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Class Time</label>
                    <Input
                      type="text"
                      value={reminderTime}
                      onChange={(e) => setReminderTime(e.target.value)}
                      placeholder="e.g., 5 pm to 7 pm"
                    />
                  </div>
                </div>

                {/* Schedule Option */}
                <div>
                  <label className="text-sm font-medium mb-2 block">When to Send</label>
                  <div className="flex gap-2">
                    <Button
                      variant={scheduleMode === 'now' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setScheduleMode('now')}
                      className="flex-1"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Send Now
                    </Button>
                    <Button
                      variant={scheduleMode === 'later' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setScheduleMode('later')}
                      className="flex-1"
                    >
                      <CalendarDays className="h-4 w-4 mr-2" />
                      Schedule
                    </Button>
                  </div>
                </div>

                {/* Schedule Date/Time */}
                {scheduleMode === 'later' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg border">
                    <div>
                      <label className="text-sm font-medium">Date</label>
                      <Input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Time</label>
                      <Input
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                      />
                    </div>
                    {scheduleDate && scheduleTime && (
                      <div className="col-span-1 sm:col-span-2 text-sm text-muted-foreground flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Will send on {new Date(`${scheduleDate}T${scheduleTime}`).toLocaleString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Auto-schedule Group Reminder */}
                {classDate && (
                  <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                    <input
                      type="checkbox"
                      id="scheduleGroupReminder"
                      checked={scheduleGroupReminder}
                      onChange={(e) => setScheduleGroupReminder(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <label htmlFor="scheduleGroupReminder" className="text-sm flex-1">
                      <span className="font-medium">Auto-schedule group reminder</span>
                      <p className="text-muted-foreground text-xs mt-0.5">
                        Send a reminder to the group at 12:00 PM on {new Date(classDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                      </p>
                    </label>
                  </div>
                )}

                {/* Message Preview */}
                <div>
                  <label className="text-sm font-medium">Message Preview</label>
                  <div className="bg-muted p-3 rounded-lg text-sm mt-1 whitespace-pre-wrap">
                    {`Hey! Your Module ${reminderModule} class is scheduled for ${classDate ? new Date(classDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '[select date]'} from ${reminderTime}. You'll receive another reminder on the day of the class. Please make sure to put your full name when joining Zoom. Invite Link: https://us02web.zoom.us/j/4171672829?pwd=ZTlHSEdmTGRYV1QraU5MaThqaC9Rdz09 — Password: qazi`}
                  </div>
                </div>

                {/* Member Selection */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">
                      Select Members ({selectedMembers.size} of {participants.filter(p => !p.isSuperAdmin).length})
                    </label>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedMembers(new Set(participants.filter(p => !p.isSuperAdmin).map(p => p.phone)))}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedMembers(new Set())}
                      >
                        Deselect All
                      </Button>
                    </div>
                  </div>
                  <div className="border rounded-lg max-h-[40vh] sm:max-h-60 overflow-y-auto divide-y">
                    {participants.filter(p => !p.isSuperAdmin).map((p) => {
                      const displayName = getDisplayName(p)
                      const isSelected = selectedMembers.has(p.phone)
                      return (
                        <div
                          key={p.id}
                          className={`flex items-center gap-3 p-2 cursor-pointer transition-colors ${
                            isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'
                          }`}
                          onClick={() => {
                            const next = new Set(selectedMembers)
                            if (isSelected) {
                              next.delete(p.phone)
                            } else {
                              next.add(p.phone)
                            }
                            setSelectedMembers(next)
                          }}
                        >
                          <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'bg-primary border-primary' : 'border-gray-300'
                          }`}>
                            {isSelected && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            {displayName ? (
                              <>
                                <p className="text-sm font-medium truncate">{displayName}</p>
                                <p className="text-xs text-muted-foreground">+{p.phone}</p>
                              </>
                            ) : (
                              <p className="text-sm font-medium">+{p.phone}</p>
                            )}
                          </div>
                          {p.isAdmin && (
                            <Badge variant="secondary" className="text-xs flex-shrink-0">
                              <Shield className="h-3 w-3 mr-1" />
                              Admin
                            </Badge>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowSendReminder(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (selectedMembers.size === 0) return

                    // Handle scheduling
                    if (scheduleMode === 'later') {
                      if (!scheduleDate || !scheduleTime) {
                        alert('Please select a date and time for scheduling')
                        return
                      }

                      const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`)
                      if (scheduledAt <= new Date()) {
                        alert('Scheduled time must be in the future')
                        return
                      }

                      try {
                        const formattedClassDate = classDate ? new Date(classDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''
                        const message = `Hey! Your Module ${reminderModule} class is scheduled for ${formattedClassDate} from ${reminderTime}. You'll receive another reminder on the day of the class. Please make sure to put your full name when joining Zoom. Invite Link: https://us02web.zoom.us/j/4171672829?pwd=ZTlHSEdmTGRYV1QraU5MaThqaC9Rdz09 — Password: qazi`

                        const res = await fetch('/api/scheduled-messages', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            groupId,
                            message,
                            scheduledAt: scheduledAt.toISOString(),
                            memberPhones: Array.from(selectedMembers),
                            moduleNumber: reminderModule,
                            classDateISO: classDate,
                            classTime: reminderTime,
                          })
                        })

                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}))
                          throw new Error(err.error || 'Failed to schedule reminder')
                        }

                        setScheduleSuccess(true)
                        setTimeout(() => {
                          setShowSendReminder(false)
                          setScheduleSuccess(false)
                        }, 2000)
                      } catch (error) {
                        console.error('Schedule error:', error)
                        alert(`Failed to schedule: ${error instanceof Error ? error.message : 'Unknown error'}`)
                      }
                      return
                    }

                    // Handle immediate sending
                    setReminderSending(true)
                    setReminderLog(
                      Array.from(selectedMembers).map(phone => {
                        const p = participants.find(pt => pt.phone === phone)
                        return {
                          phone,
                          name: p ? (getDisplayName(p) || phone) : phone,
                          status: 'pending' as const
                        }
                      })
                    )

                    try {
                      const formattedClassDate = classDate ? new Date(classDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''
                      const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/notify`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          module: reminderModule,
                          time: reminderTime,
                          classDate: formattedClassDate,
                          classDateISO: classDate, // ISO format for scheduling group reminder
                          memberPhones: Array.from(selectedMembers),
                          scheduleGroupReminder: scheduleGroupReminder && !!classDate
                        })
                      })

                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}))
                        throw new Error(err.error || 'Failed to send reminders')
                      }

                      const reader = res.body?.getReader()
                      if (!reader) throw new Error('No response stream')

                      const decoder = new TextDecoder()
                      let buffer = ''

                      while (true) {
                        const { done, value } = await reader.read()
                        if (done) break

                        buffer += decoder.decode(value, { stream: true })
                        const lines = buffer.split('\n')
                        buffer = lines.pop() || ''

                        for (const line of lines) {
                          if (!line.trim()) continue
                          try {
                            const event = JSON.parse(line)
                            if (event.type === 'summary') {
                              setReminderSummary(event)
                            } else {
                              setReminderLog(prev =>
                                prev.map(entry =>
                                  entry.phone === event.phone
                                    ? { ...entry, status: event.status, error: event.error }
                                    : entry
                                )
                              )
                            }
                          } catch {
                            // Skip malformed lines
                          }
                        }
                      }
                    } catch (error) {
                      console.error('Reminder send error:', error)
                      // Mark all pending as failed
                      setReminderLog(prev =>
                        prev.map(entry =>
                          entry.status === 'pending'
                            ? { ...entry, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' }
                            : entry
                        )
                      )
                      setReminderSummary({
                        sent: 0,
                        failed: selectedMembers.size,
                        total: selectedMembers.size
                      })
                    } finally {
                      setReminderSending(false)
                      setReminderDone(true)
                    }
                  }}
                  disabled={selectedMembers.size === 0 || (scheduleMode === 'later' && (!scheduleDate || !scheduleTime))}
                >
                  {scheduleMode === 'later' ? (
                    <>
                      <CalendarDays className="mr-2 h-4 w-4" />
                      Schedule for {selectedMembers.size} {selectedMembers.size === 1 ? 'member' : 'members'}
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send to {selectedMembers.size} {selectedMembers.size === 1 ? 'member' : 'members'}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  {reminderDone ? 'Reminders Sent' : 'Sending Reminders...'}
                </DialogTitle>
                <DialogDescription>
                  {reminderDone
                    ? `Finished sending Module ${reminderModule} reminders.`
                    : `Sending Module ${reminderModule} reminder to ${selectedMembers.size} members...`
                  }
                </DialogDescription>
              </DialogHeader>

              {/* Summary */}
              {reminderSummary && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                    <span className="text-2xl font-bold text-blue-700">{reminderSummary.total}</span>
                    <p className="text-sm text-blue-600">Total</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                    <span className="text-2xl font-bold text-green-700">{reminderSummary.sent}</span>
                    <p className="text-sm text-green-600">Sent</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                    <span className="text-2xl font-bold text-red-700">{reminderSummary.failed}</span>
                    <p className="text-sm text-red-600">Failed</p>
                  </div>
                </div>
              )}

              {/* Send Log */}
              <div className="border rounded-lg max-h-[50vh] sm:max-h-72 overflow-y-auto divide-y">
                {reminderLog.map((entry, i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <div className="flex-shrink-0">
                      {entry.status === 'pending' && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      {entry.status === 'sent' && (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      )}
                      {entry.status === 'failed' && (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">+{entry.phone}</p>
                    </div>
                    <div className="flex-shrink-0">
                      {entry.status === 'sent' && (
                        <span className="text-xs text-green-600">Sent</span>
                      )}
                      {entry.status === 'failed' && (
                        <span className="text-xs text-red-600" title={entry.error}>
                          Failed
                        </span>
                      )}
                      {entry.status === 'pending' && (
                        <span className="text-xs text-muted-foreground">Waiting...</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {!reminderSending && (
                <p className="text-xs text-muted-foreground text-center">
                  {reminderSummary
                    ? `${reminderSummary.sent} sent, ${reminderSummary.failed} failed out of ${reminderSummary.total}`
                    : 'Processing...'}
                </p>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowSendReminder(false)}
                  disabled={reminderSending}
                >
                  {reminderDone ? 'Close' : 'Cancel'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
