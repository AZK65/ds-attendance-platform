import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// DELETE /api/registrations/[id] — Admin rejects/discards a registration
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const registration = await prisma.studentRegistration.findUnique({ where: { id } })
    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    }

    await prisma.studentRegistration.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Registrations] Delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete registration' },
      { status: 500 }
    )
  }
}
