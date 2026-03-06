import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import QRCode from 'qrcode'

// POST /api/registrations — Admin generates a new registration token + QR code
export async function POST(request: NextRequest) {
  try {
    const registration = await prisma.studentRegistration.create({
      data: {
        status: 'pending_scan',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    })

    // Build the enrollment URL — prefer NEXT_PUBLIC_APP_URL for consistent QR links
    const forwardedHost = request.headers.get('x-forwarded-host')
    const origin =
      process.env.NEXT_PUBLIC_APP_URL
      || (forwardedHost ? `https://${forwardedHost}` : null)
      || request.headers.get('origin')
      || 'http://localhost:3000'
    const enrollUrl = `${origin}/enroll/${registration.id}`

    // Generate QR code data URL (same pattern as /api/whatsapp/qr/route.ts)
    const qrDataUrl = await QRCode.toDataURL(enrollUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })

    return NextResponse.json({
      success: true,
      id: registration.id,
      enrollUrl,
      qrDataUrl,
      expiresAt: registration.expiresAt,
    })
  } catch (error) {
    console.error('[Registrations] Create error:', error)
    return NextResponse.json(
      { error: 'Failed to create registration', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET /api/registrations — Admin lists registrations (optionally filtered by status)
export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get('status')

    // Auto-expire stale pending_scan registrations
    await prisma.studentRegistration.updateMany({
      where: {
        status: 'pending_scan',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'expired' },
    })

    const where: Record<string, string> = {}
    if (status) where.status = status

    const registrations = await prisma.studentRegistration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ registrations })
  } catch (error) {
    console.error('[Registrations] Fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch registrations' },
      { status: 500 }
    )
  }
}
