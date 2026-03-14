import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/preferences?keys=students-search,students-sort
export async function GET(request: NextRequest) {
  const keysParam = request.nextUrl.searchParams.get('keys')
  if (!keysParam) {
    return NextResponse.json({ error: 'keys parameter required' }, { status: 400 })
  }

  const keys = keysParam.split(',').map(k => k.trim()).filter(Boolean)

  const prefs = await prisma.appPreference.findMany({
    where: { key: { in: keys } },
  })

  const result: Record<string, string> = {}
  for (const pref of prefs) {
    result[pref.key] = pref.value
  }

  return NextResponse.json(result)
}

// PUT /api/preferences  { key: "students-search", value: "ahmed" }
export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { key, value } = body

  if (!key || typeof key !== 'string') {
    return NextResponse.json({ error: 'key is required' }, { status: 400 })
  }

  if (value === null || value === undefined || value === '') {
    // Delete the preference
    await prisma.appPreference.deleteMany({ where: { key } })
    return NextResponse.json({ success: true })
  }

  await prisma.appPreference.upsert({
    where: { key },
    update: { value: String(value) },
    create: { key, value: String(value) },
  })

  return NextResponse.json({ success: true })
}
