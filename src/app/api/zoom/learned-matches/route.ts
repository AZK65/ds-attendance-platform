import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET - Load all learned matches (used by matching logic)
export async function GET() {
  try {
    const matches = await prisma.zoomNameMatch.findMany({
      orderBy: { updatedAt: 'desc' }
    })

    return NextResponse.json({ matches })
  } catch (error) {
    console.error('Get learned matches error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch learned matches' },
      { status: 500 }
    )
  }
}

// POST - Save new learned matches (called when saving attendance with manual matches)
export async function POST(request: NextRequest) {
  try {
    const { matches } = await request.json() as {
      matches: Array<{
        zoomName: string
        whatsappPhone: string
        whatsappName: string
      }>
    }

    if (!matches || !Array.isArray(matches) || matches.length === 0) {
      return NextResponse.json(
        { error: 'No matches provided' },
        { status: 400 }
      )
    }

    let saved = 0
    for (const match of matches) {
      if (!match.zoomName || !match.whatsappPhone) continue

      await prisma.zoomNameMatch.upsert({
        where: {
          zoomName_whatsappPhone: {
            zoomName: match.zoomName,
            whatsappPhone: match.whatsappPhone
          }
        },
        update: {
          whatsappName: match.whatsappName,
          updatedAt: new Date()
        },
        create: {
          zoomName: match.zoomName,
          whatsappPhone: match.whatsappPhone,
          whatsappName: match.whatsappName
        }
      })
      saved++
    }

    console.log(`[Learned Matches] Saved ${saved} matches`)
    return NextResponse.json({ success: true, saved })
  } catch (error) {
    console.error('Save learned matches error:', error)
    return NextResponse.json(
      { error: 'Failed to save learned matches' },
      { status: 500 }
    )
  }
}
