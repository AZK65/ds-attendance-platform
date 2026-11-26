import { NextRequest, NextResponse } from 'next/server'
import { saveCertificateStudent } from '@/lib/certificate-assignment'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const result = await saveCertificateStudent(body)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ student: result.student, certificate: result.certificate })
  } catch (error) {
    console.error('Student save error:', error)
    return NextResponse.json(
      { error: 'Failed to save student' },
      { status: 500 },
    )
  }
}
