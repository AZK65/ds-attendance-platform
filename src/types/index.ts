export interface GroupInfo {
  id: string
  name: string
  participantCount: number
  lastSynced: Date
}

export interface ContactInfo {
  id: string
  phone: string
  name: string | null
  pushName: string | null
}

export interface AttendanceRecord {
  id: string
  contactId: string
  contact: ContactInfo
  status: 'present' | 'absent' | 'excused'
  notes: string | null
  date: Date
}

export interface AttendanceSheetData {
  id: string
  groupId: string
  name: string
  records: AttendanceRecord[]
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'qr'
