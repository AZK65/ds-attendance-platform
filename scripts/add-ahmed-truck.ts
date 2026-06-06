/**
 * One-off: create the "Ahmed Truck" Teamup subcalendar mirroring "Ahmed Car",
 * and stamp teacherKey="ahmed" on both TeacherPhone rows so the scheduler
 * treats them as one person for double-booking.
 *
 * Run inside the Docker container so we pick up the production env:
 *   docker compose cp scripts/add-ahmed-truck.ts app:/app/scripts/
 *   docker compose exec app npx tsx scripts/add-ahmed-truck.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const BASE_URL = 'https://api.teamup.com'

async function main() {
  const apiKey = process.env.TEAMUP_API_KEY
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY
  if (!apiKey || !calendarKey) {
    console.error('❌ TEAMUP_API_KEY and TEAMUP_CALENDAR_KEY are required')
    process.exit(1)
  }

  // 1. Fetch all subcalendars to find Ahmed's existing car cal.
  const subRes = await fetch(`${BASE_URL}/${calendarKey}/subcalendars`, {
    headers: { 'Teamup-Token': apiKey },
  })
  if (!subRes.ok) {
    console.error('❌ Failed to fetch subcalendars:', subRes.status, await subRes.text())
    process.exit(1)
  }
  const data = await subRes.json() as { subcalendars?: Array<{ id: number; name: string; color: number; active: boolean }> }
  const subcals = data.subcalendars || []

  console.log(`📋 Found ${subcals.length} subcalendars on the calendar.`)

  const ahmedCar = subcals.find(s => /\bahmed\b/i.test(s.name) && /\bcar\b/i.test(s.name) && s.active)
  if (!ahmedCar) {
    console.error('❌ Could not find an active Ahmed Car subcalendar.')
    console.error('   Available subcalendars:')
    for (const s of subcals) console.error(`     - ${s.name} (id=${s.id}, active=${s.active})`)
    process.exit(1)
  }
  console.log(`✅ Found Ahmed Car: "${ahmedCar.name}" (id=${ahmedCar.id}, color=${ahmedCar.color})`)

  // Check for a pre-existing Ahmed Truck.
  const existingTruck = subcals.find(s => /\bahmed\b/i.test(s.name) && /\btruck\b/i.test(s.name))
  let truckId: number
  let truckName: string
  if (existingTruck) {
    console.log(`ℹ️  Ahmed Truck already exists on Teamup: "${existingTruck.name}" (id=${existingTruck.id}). Reusing it.`)
    truckId = existingTruck.id
    truckName = existingTruck.name
  } else {
    const newName = 'Ahmed Truck'
    console.log(`➕ Creating Teamup subcalendar "${newName}" (mirroring color ${ahmedCar.color})…`)
    const createRes = await fetch(`${BASE_URL}/${calendarKey}/subcalendars`, {
      method: 'POST',
      headers: { 'Teamup-Token': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subcalendar: {
          name: newName,
          color: ahmedCar.color,
          overlap: true,
          type: 'personal',
          active: true,
        },
      }),
    })
    if (!createRes.ok) {
      const txt = await createRes.text()
      console.error('❌ Teamup create failed:', createRes.status, txt.slice(0, 500))
      console.error('   The API key needs admin permission on the calendar to create subcalendars.')
      process.exit(1)
    }
    const created = await createRes.json() as { subcalendar?: { id: number; name: string } }
    if (!created.subcalendar?.id) {
      console.error('❌ Teamup did not return a subcalendar id:', JSON.stringify(created))
      process.exit(1)
    }
    truckId = created.subcalendar.id
    truckName = created.subcalendar.name
    console.log(`✅ Created Teamup subcalendar id=${truckId} name="${truckName}"`)
  }

  // 2. Stamp teacherKey="ahmed" on the existing car row + mirror phone to the new truck row.
  const carRow = await prisma.teacherPhone.findUnique({ where: { subcalendarId: ahmedCar.id } })
  const phone = carRow?.phone || ''
  console.log(`📞 Existing car row phone: ${phone || '(none)'}`)

  await prisma.teacherPhone.upsert({
    where: { subcalendarId: ahmedCar.id },
    update: { teacherKey: 'ahmed' },
    create: { subcalendarId: ahmedCar.id, name: ahmedCar.name, phone, teacherKey: 'ahmed' },
  })
  console.log(`✅ Set teacherKey="ahmed" on car row (subcalendarId=${ahmedCar.id})`)

  await prisma.teacherPhone.upsert({
    where: { subcalendarId: truckId },
    update: { name: truckName, phone, teacherKey: 'ahmed' },
    create: { subcalendarId: truckId, name: truckName, phone, teacherKey: 'ahmed' },
  })
  console.log(`✅ Created truck row (subcalendarId=${truckId}, phone="${phone}", teacherKey="ahmed")`)

  console.log('\n🎉 Done. Ahmed Truck is live on Teamup and grouped with Ahmed Car.')
  console.log('   Refresh /scheduling and both calendars will share a clash check.')
}

main()
  .catch(err => { console.error('❌ Crash:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
