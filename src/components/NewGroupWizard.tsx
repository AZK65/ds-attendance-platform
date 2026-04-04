'use client'

import { useState, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Users, Loader2, CheckCircle2, AlertCircle, ArrowLeft, ArrowRight,
  UserPlus, CalendarDays, BookOpen, FileText, XCircle, Phone,
} from 'lucide-react'

interface ParsedStudent {
  name: string
  phone: string
}

interface ProgressEntry {
  action: string
  status: 'pending' | 'success' | 'warning' | 'error'
  detail: string
}

type WizardStep = 'students' | 'group' | 'setup' | 'executing' | 'done'

interface NewGroupWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewGroupWizard({ open, onOpenChange }: NewGroupWizardProps) {
  const queryClient = useQueryClient()

  // Step state
  const [step, setStep] = useState<WizardStep>('students')

  // Step 1: Students
  const [bulkText, setBulkText] = useState('')

  // Step 2: Group
  const [groupName, setGroupName] = useState('')

  // Step 3: Setup
  const [moduleNumber, setModuleNumber] = useState(1)
  const [classDate, setClassDate] = useState('')
  const [classTimeStart, setClassTimeStart] = useState('17:00')
  const [classTimeEnd, setClassTimeEnd] = useState('19:00')
  const [shouldSetDescription, setShouldSetDescription] = useState(true)
  const [shouldSendPdf, setShouldSendPdf] = useState(false)
  const [pdfFile, setPdfFile] = useState<{ base64: string; filename: string } | null>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  // Execution
  const [progress, setProgress] = useState<ProgressEntry[]>([])
  const [executionPhase, setExecutionPhase] = useState('')
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null)

  // WhatsApp verification
  // Map of phone → 'checking' | 'valid' | 'invalid' | 'error'
  const [waStatus, setWaStatus] = useState<Record<string, 'checking' | 'valid' | 'invalid' | 'error'>>({})
  const [verifying, setVerifying] = useState(false)

  const verifyNumbers = useCallback(async (students: ParsedStudent[]) => {
    setVerifying(true)
    const newStatus: Record<string, 'checking' | 'valid' | 'invalid' | 'error'> = {}
    for (const s of students) {
      newStatus[s.phone] = 'checking'
    }
    setWaStatus({ ...newStatus })

    for (const s of students) {
      try {
        const res = await fetch(`/api/whatsapp/check-number?phone=${encodeURIComponent(s.phone)}`)
        if (res.ok) {
          const data = await res.json()
          newStatus[s.phone] = data.registered ? 'valid' : 'invalid'
        } else {
          newStatus[s.phone] = 'error'
        }
      } catch {
        newStatus[s.phone] = 'error'
      }
      setWaStatus({ ...newStatus })
    }
    setVerifying(false)
  }, [])

  // Parse bulk text into students
  const parsedStudents: ParsedStudent[] = bulkText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      // Try "Name, Phone" or "Name Phone" — phone is the last token that looks like a number
      const parts = line.split(/[,\t]+/).map(p => p.trim())
      if (parts.length >= 2) {
        const phone = parts[parts.length - 1].replace(/\D/g, '')
        const name = parts.slice(0, -1).join(' ').trim()
        if (phone.length >= 7 && name) {
          return { name, phone: phone.length === 10 ? '1' + phone : phone }
        }
      }
      // Fallback: split on last space-separated number
      const match = line.match(/^(.+?)\s+([\d\s()-]{7,})$/)
      if (match) {
        const phone = match[2].replace(/\D/g, '')
        return { name: match[1].trim(), phone: phone.length === 10 ? '1' + phone : phone }
      }
      return null
    })
    .filter((s): s is ParsedStudent => s !== null)

  const formatTime12h = (time24: string) => {
    const [h, m] = time24.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
  }

  const classTimeDisplay = `${formatTime12h(classTimeStart)} to ${formatTime12h(classTimeEnd)}`

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setPdfFile({ base64: ev.target?.result as string, filename: file.name })
    }
    reader.readAsDataURL(file)
  }

  const addProgress = (entry: ProgressEntry) => {
    setProgress(prev => [...prev, entry])
  }

  const handleExecute = async () => {
    setStep('executing')
    setProgress([])
    const students = [...parsedStudents]
    const phones: string[] = []

    // Phase A: Create students in MySQL
    setExecutionPhase(`Creating students (0/${students.length})`)
    for (let i = 0; i < students.length; i++) {
      const s = students[i]
      setExecutionPhase(`Creating students (${i + 1}/${students.length})`)
      try {
        const res = await fetch('/api/students/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: s.name,
            phone_number: s.phone,
            permit_number: '',
            full_address: '',
            city: 'Montréal',
            postal_code: '',
            dob: '2000-01-01',
            email: '',
          }),
        })
        if (res.ok) {
          phones.push(s.phone)
          addProgress({ action: `Create ${s.name}`, status: 'success', detail: 'Added to database' })
        } else {
          const err = await res.json().catch(() => ({ error: 'failed' }))
          phones.push(s.phone) // still try to add to group
          addProgress({ action: `Create ${s.name}`, status: 'warning', detail: err.error || 'MySQL error (may already exist)' })
        }
      } catch (err) {
        phones.push(s.phone)
        addProgress({ action: `Create ${s.name}`, status: 'error', detail: err instanceof Error ? err.message : 'Network error' })
      }
    }

    if (phones.length === 0) {
      addProgress({ action: 'Abort', status: 'error', detail: 'No students to add' })
      setStep('done')
      return
    }

    // Phase B: Create WhatsApp group with ALL students at once
    setExecutionPhase(`Creating group with ${phones.length} members...`)
    let groupId: string | null = null
    try {
      const res = await fetch('/api/groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupName, participants: phones }),
      })
      if (res.ok) {
        const data = await res.json()
        groupId = data.groupId
        setCreatedGroupId(groupId)
        addProgress({ action: `Create group "${groupName}" with ${phones.length} members`, status: 'success', detail: data.whatsappWarning || 'Group created' })
      } else {
        const err = await res.json().catch(() => ({ error: 'failed' }))
        addProgress({ action: `Create group "${groupName}"`, status: 'error', detail: err.error || 'Failed to create group' })
        setStep('done')
        return
      }
    } catch (err) {
      addProgress({ action: `Create group "${groupName}"`, status: 'error', detail: err instanceof Error ? err.message : 'Network error creating group' })
      setStep('done')
      return
    }

    // Wait for WhatsApp to settle after group creation
    await new Promise(r => setTimeout(r, 3000))

    // Phase D: Send welcome message to group
    setExecutionPhase('Sending welcome message...')
    try {
      const welcomeMessage = `Welcome to Qazi Driving School!\n\nThank you for choosing us for your driving education. We're excited to have you on board!\n\nA few things to know:\n- You will receive a PDF booklet — please keep it handy as it is required during your classes.\n- Classes are held on Zoom. Please download it before your first class.\n- When joining Zoom, please use your *full name* so we can mark your attendance.\n\nIf you have any questions, feel free to message here. See you in class!`

      const res = await fetch(`/api/groups/${encodeURIComponent(groupId!)}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: welcomeMessage }),
      })
      if (res.ok) {
        addProgress({ action: 'Welcome message', status: 'success', detail: 'Sent to group' })
      } else {
        addProgress({ action: 'Welcome message', status: 'warning', detail: 'Failed to send' })
      }
    } catch {
      addProgress({ action: 'Welcome message', status: 'warning', detail: 'Failed to send' })
    }

    // Phase E: Send PDF to group (separate from setup to avoid 10MB body limit)
    if (shouldSendPdf && pdfFile) {
      setExecutionPhase('Sending PDF to group...')
      try {
        // Strip the data URL prefix to get raw base64
        const rawBase64 = pdfFile.base64.replace(/^data:[^;]+;base64,/, '')
        const res = await fetch(`/api/groups/${encodeURIComponent(groupId!)}/setup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sendPdf: true,
            pdfBase64: rawBase64,
            pdfFilename: pdfFile.filename,
          }),
        })
        if (res.ok) {
          addProgress({ action: 'Send PDF to group', status: 'success', detail: 'Sent' })
        } else {
          addProgress({ action: 'Send PDF to group', status: 'warning', detail: 'Failed to send' })
        }
      } catch {
        addProgress({ action: 'Send PDF to group', status: 'warning', detail: 'Failed to send' })
      }
    }

    // Phase F: Class setup (description, notifications, reminders, calendar — no PDF)
    if (classDate) {
      setExecutionPhase('Setting up class...')
      const zoomLink = 'https://us02web.zoom.us/j/4171672829?pwd=ZTlHSEdmTGRYV1QraU5MaThqaC9Rdz09'
      const description = shouldSetDescription
        ? `Zoom Meeting:\n${zoomLink}\nPassword: qazi\n\nDownload Zoom:\niPhone: https://apps.apple.com/app/zoom/id546505307\nAndroid: https://play.google.com/store/apps/details?id=us.zoom.videomeetings\n\nPlease use your full name when joining Zoom.`
        : undefined

      try {
        const res = await fetch(`/api/groups/${encodeURIComponent(groupId!)}/setup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            setDescription: shouldSetDescription,
            description,
            memberPhones: phones,
            scheduleClass: true,
            moduleNumber,
            classDate: new Date(classDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            }),
            classDateISO: classDate,
            classTime: classTimeDisplay,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          for (const r of (data.results || [])) {
            addProgress({
              action: r.action,
              status: r.status.startsWith('Failed') ? 'error' : 'success',
              detail: r.status,
            })
          }
        } else {
          addProgress({ action: 'Class setup', status: 'error', detail: 'Setup request failed' })
        }
      } catch {
        addProgress({ action: 'Class setup', status: 'error', detail: 'Network error during setup' })
      }
    }

    setExecutionPhase('')
    setStep('done')
  }

  const handleClose = () => {
    if (step === 'executing') return // don't close during execution
    // Reset everything
    setStep('students')
    setBulkText('')
    setGroupName('')
    setModuleNumber(1)
    setClassDate('')
    setClassTimeStart('17:00')
    setClassTimeEnd('19:00')
    setShouldSetDescription(true)
    setShouldSendPdf(false)
    setPdfFile(null)
    setProgress([])
    setExecutionPhase('')
    setCreatedGroupId(null)
    setWaStatus({})
    setVerifying(false)
    if (step === 'done') {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['groups-list'] })
      queryClient.invalidateQueries({ queryKey: ['batch-match'] })
      queryClient.invalidateQueries({ queryKey: ['groups', 'participants'] })
    }
    onOpenChange(false)
  }

  const stepNumber = step === 'students' ? 1 : step === 'group' ? 2 : step === 'setup' ? 3 : step === 'executing' ? 4 : 4

  return (
    <Dialog open={open} onOpenChange={step === 'executing' ? () => {} : handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            New Group
          </DialogTitle>
          <DialogDescription>
            {step === 'students' && 'Step 1/3 — Add students'}
            {step === 'group' && 'Step 2/3 — Name the group'}
            {step === 'setup' && 'Step 3/3 — Schedule first class'}
            {step === 'executing' && 'Creating...'}
            {step === 'done' && 'Complete'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        {(step === 'students' || step === 'group' || step === 'setup') && (
          <div className="flex items-center gap-2 px-1">
            {[
              { n: 1, label: 'Students', icon: UserPlus },
              { n: 2, label: 'Group', icon: Users },
              { n: 3, label: 'Class', icon: CalendarDays },
            ].map(({ n, label, icon: Icon }) => (
              <div key={n} className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
                n === stepNumber ? 'bg-primary text-primary-foreground' : n < stepNumber ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
              }`}>
                {n < stepNumber ? <CheckCircle2 className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                {label}
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-2 space-y-4">
          {/* Step 1: Add Students */}
          {step === 'students' && (
            <>
              <div>
                <Label>Students (one per line: Name, Phone)</Label>
                <textarea
                  className="w-full mt-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[200px] font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={"Ahmed Khan, 5141234567\nSara Mohamed, 4389876543\nAli Hassan, 5147654321"}
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {parsedStudents.length > 0 ? (
                    <span className="text-green-600 font-medium">{parsedStudents.length} student{parsedStudents.length !== 1 ? 's' : ''} detected</span>
                  ) : 'Enter name and phone number separated by comma or tab'}
                </p>
              </div>

              {parsedStudents.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {Object.values(waStatus).filter(s => s === 'valid').length > 0 && (
                        <span className="text-green-600">{Object.values(waStatus).filter(s => s === 'valid').length} valid</span>
                      )}
                      {Object.values(waStatus).filter(s => s === 'invalid').length > 0 && (
                        <span className="text-red-600 ml-2">{Object.values(waStatus).filter(s => s === 'invalid').length} not on WhatsApp</span>
                      )}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => verifyNumbers(parsedStudents)}
                      disabled={verifying}
                    >
                      {verifying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Phone className="h-3 w-3 mr-1" />}
                      {verifying ? 'Verifying...' : 'Verify WhatsApp'}
                    </Button>
                  </div>
                  <div className="border rounded-lg divide-y max-h-[150px] overflow-y-auto">
                    {parsedStudents.map((s, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
                        <div className="flex items-center gap-2">
                          {waStatus[s.phone] === 'checking' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                          {waStatus[s.phone] === 'valid' && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                          {waStatus[s.phone] === 'invalid' && <XCircle className="h-3.5 w-3.5 text-red-500" />}
                          {waStatus[s.phone] === 'error' && <AlertCircle className="h-3.5 w-3.5 text-amber-500" />}
                          <span className="font-medium">{s.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {waStatus[s.phone] === 'invalid' && <span className="text-red-500 text-xs">No WhatsApp</span>}
                          <span className="text-muted-foreground font-mono text-xs">{s.phone}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* Step 2: Group Name */}
          {step === 'group' && (
            <>
              <div>
                <Label>WhatsApp Group Name</Label>
                <Input
                  className="mt-1.5"
                  placeholder={`Module ${moduleNumber} - ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`}
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                />
              </div>

              <div>
                <Label className="text-muted-foreground text-xs">Members ({parsedStudents.length})</Label>
                <div className="border rounded-lg divide-y max-h-[200px] overflow-y-auto mt-1.5">
                  {parsedStudents.map((s, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
                      <span>{s.name}</span>
                      <span className="text-muted-foreground font-mono text-xs">{s.phone}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Step 3: Class Setup */}
          {step === 'setup' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Module Number</Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    className="mt-1.5"
                    value={moduleNumber}
                    onChange={e => setModuleNumber(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div>
                  <Label>Class Date</Label>
                  <Input
                    type="date"
                    className="mt-1.5"
                    value={classDate}
                    onChange={e => setClassDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    className="mt-1.5"
                    value={classTimeStart}
                    onChange={e => setClassTimeStart(e.target.value)}
                  />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    className="mt-1.5"
                    value={classTimeEnd}
                    onChange={e => setClassTimeEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="set-desc"
                    checked={shouldSetDescription}
                    onCheckedChange={v => setShouldSetDescription(!!v)}
                  />
                  <label htmlFor="set-desc" className="text-sm cursor-pointer">Set group description with Zoom link</label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="send-pdf"
                    checked={shouldSendPdf}
                    onCheckedChange={v => setShouldSendPdf(!!v)}
                  />
                  <label htmlFor="send-pdf" className="text-sm cursor-pointer">Send course book PDF</label>
                </div>

                {shouldSendPdf && (
                  <div className="pl-6">
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={handlePdfUpload}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => pdfInputRef.current?.click()}
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      {pdfFile ? pdfFile.filename : 'Choose PDF'}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Executing / Done */}
          {(step === 'executing' || step === 'done') && (
            <>
              {executionPhase && (
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {executionPhase}
                </div>
              )}

              <div className="border rounded-lg divide-y max-h-[350px] overflow-y-auto">
                {progress.map((p, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                    {p.status === 'success' && <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />}
                    {p.status === 'warning' && <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />}
                    {p.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />}
                    {p.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin mt-0.5 shrink-0" />}
                    <div className="min-w-0">
                      <span className="font-medium">{p.action}</span>
                      <span className={`ml-2 ${
                        p.status === 'success' ? 'text-green-600' :
                        p.status === 'warning' ? 'text-amber-600' :
                        p.status === 'error' ? 'text-red-600' : 'text-muted-foreground'
                      }`}>{p.detail}</span>
                    </div>
                  </div>
                ))}
              </div>

              {step === 'done' && (
                <div className="text-center pt-2">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mx-auto mb-2">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  </div>
                  <p className="text-sm font-medium">
                    {createdGroupId ? 'Group created and class scheduled!' : 'Completed with errors'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          {step === 'students' && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => setStep('group')} disabled={parsedStudents.length === 0 || verifying}>
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
          {step === 'group' && (
            <>
              <Button variant="outline" onClick={() => setStep('students')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep('setup')} disabled={!groupName.trim()}>
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
          {step === 'setup' && (
            <>
              <Button variant="outline" onClick={() => setStep('group')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={handleExecute}>
                <BookOpen className="h-4 w-4 mr-1" />
                Create Group & Setup
              </Button>
            </>
          )}
          {step === 'executing' && (
            <Button disabled>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Working...
            </Button>
          )}
          {step === 'done' && (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
