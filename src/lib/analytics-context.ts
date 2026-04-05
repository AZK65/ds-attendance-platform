import { prisma } from '@/lib/db'
import { getAllStudents, countStudentsByDateRange } from '@/lib/external-db'

let cachedContext: string | null = null
let cacheTimestamp = 0
const CACHE_TTL = 60000 // 60 seconds

export async function buildDataContext(): Promise<string> {
  if (cachedContext && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedContext
  }

  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthStr = `${lastMonth.getFullYear()}-${(lastMonth.getMonth() + 1).toString().padStart(2, '0')}`

  const sections: string[] = []

  // Student stats from MySQL
  try {
    const thisMonthStart = `${thisMonth}-01`
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]
    const lastMonthStart = `${lastMonthStr}-01`

    const [thisMonthCount, lastMonthCount] = await Promise.all([
      countStudentsByDateRange(thisMonthStart, nextMonthStart).catch(() => [{ count: 0 }]),
      countStudentsByDateRange(lastMonthStart, thisMonthStart).catch(() => [{ count: 0 }]),
    ])

    // Get all students with details
    const allStudents = await getAllStudents().catch(() => [])

    // Build city/neighbourhood breakdown
    const cityBreakdown: Record<string, number> = {}
    for (const s of allStudents) {
      const city = (s.city || 'Unknown').trim() || 'Unknown'
      cityBreakdown[city] = (cityBreakdown[city] || 0) + 1
    }

    // Build monthly enrollment from creation dates
    const enrollmentByMonth: Record<string, number> = {}
    for (const s of allStudents) {
      if (s.dob) { // dob field is actually used, creation_date would be better but not in StudentRecord
        // We use the countStudentsByDateRange for accurate monthly data
      }
    }

    // Include student list with addresses (for location-based queries)
    const studentList = allStudents.slice(0, 500).map(s =>
      `${s.full_name} | ${s.phone_number} | ${s.city || '-'} | ${s.full_address || '-'} | ${s.postal_code || '-'}`
    ).join('\n')

    sections.push(`=== STUDENTS (MySQL) ===
Total students in database: ${allStudents.length}
New enrollments this month (${thisMonth}): ${(thisMonthCount as Array<{ count: number }>)[0]?.count || 0}
New enrollments last month (${lastMonthStr}): ${(lastMonthCount as Array<{ count: number }>)[0]?.count || 0}

City/Area breakdown:
${Object.entries(cityBreakdown).sort((a, b) => b[1] - a[1]).map(([city, count]) => `${city}: ${count}`).join('\n')}

Student details (Name | Phone | City | Address | Postal Code):
${studentList}`)
  } catch {
    sections.push('=== STUDENTS === Data unavailable')
  }

  // Invoice stats from SQLite
  try {
    const [totalInvoices, paidInvoices, unpaidInvoices, invoiceRevenue] = await Promise.all([
      prisma.invoice.count(),
      prisma.invoice.count({ where: { paymentStatus: 'paid' } }),
      prisma.invoice.count({ where: { paymentStatus: 'unpaid' } }),
      prisma.invoice.aggregate({ _sum: { total: true } }),
    ])

    const paidRevenue = await prisma.invoice.aggregate({
      where: { paymentStatus: 'paid' },
      _sum: { total: true },
    })

    const unpaidTotal = await prisma.invoice.aggregate({
      where: { paymentStatus: 'unpaid' },
      _sum: { total: true },
    })

    // Monthly revenue (last 6 months)
    const sixMonthsAgo = new Date(now)
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const recentInvoices = await prisma.invoice.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { total: true, paymentStatus: true, createdAt: true },
    })

    const monthlyRevenue: Record<string, number> = {}
    for (const inv of recentInvoices) {
      const month = inv.createdAt.toISOString().slice(0, 7)
      monthlyRevenue[month] = (monthlyRevenue[month] || 0) + inv.total
    }

    // Get recent invoices for detail
    const allInvoices = await prisma.invoice.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        invoiceNumber: true, studentName: true, total: true,
        paymentStatus: true, invoiceDate: true, lineItems: true,
      },
    })

    const invoiceList = allInvoices.slice(0, 100).map(inv => {
      let items = ''
      try {
        const parsed = JSON.parse(inv.lineItems)
        items = parsed.map((li: { description: string }) => li.description).join(', ')
      } catch { items = '' }
      return `#${inv.invoiceNumber} | ${inv.studentName} | $${inv.total.toFixed(2)} | ${inv.paymentStatus} | ${inv.invoiceDate} | ${items}`
    }).join('\n')

    sections.push(`=== INVOICES & REVENUE (SQLite) ===
Total invoices: ${totalInvoices}
Paid: ${paidInvoices} | Unpaid: ${unpaidInvoices}
Total revenue (all time): $${(invoiceRevenue._sum.total || 0).toFixed(2)}
Paid revenue: $${(paidRevenue._sum.total || 0).toFixed(2)}
Outstanding (unpaid): $${(unpaidTotal._sum.total || 0).toFixed(2)}
Monthly revenue (last 6 months): ${JSON.stringify(monthlyRevenue)}

Recent invoices (Invoice# | Student | Total | Status | Date | Items):
${invoiceList}`)
  } catch {
    sections.push('=== INVOICES === Data unavailable')
  }

  // Group stats
  try {
    const totalGroups = await prisma.group.count()
    const groupsWithModule = await prisma.group.findMany({
      where: { moduleNumber: { not: null } },
      select: { name: true, moduleNumber: true, participantCount: true },
      orderBy: { lastSynced: 'desc' },
      take: 10,
    })

    sections.push(`=== GROUPS (SQLite) ===
Total groups: ${totalGroups}
Active course groups (with module numbers): ${groupsWithModule.length}
Recent groups: ${groupsWithModule.map(g => `${g.name} (Module ${g.moduleNumber}, ${g.participantCount} members)`).join(', ')}`)
  } catch {
    sections.push('=== GROUPS === Data unavailable')
  }

  // Certificate stats
  try {
    const totalCerts = await prisma.certificate.count()
    const certsByType = await prisma.certificate.groupBy({
      by: ['certificateType'],
      _count: true,
    })

    sections.push(`=== CERTIFICATES (SQLite) ===
Total certificates issued: ${totalCerts}
By type: ${certsByType.map(c => `${c.certificateType}: ${c._count}`).join(', ') || 'none'}`)
  } catch {
    sections.push('=== CERTIFICATES === Data unavailable')
  }

  // Attendance stats
  try {
    const totalRecords = await prisma.attendanceRecord.count()
    const presentCount = await prisma.attendanceRecord.count({ where: { status: 'present' } })
    const absentCount = await prisma.attendanceRecord.count({ where: { status: 'absent' } })
    const rate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0

    sections.push(`=== ATTENDANCE (SQLite) ===
Total attendance records: ${totalRecords}
Present: ${presentCount} | Absent: ${absentCount}
Overall attendance rate: ${rate}%`)
  } catch {
    sections.push('=== ATTENDANCE === Data unavailable')
  }

  // Message stats
  try {
    const totalMessages = await prisma.messageLog.count()
    const sentMessages = await prisma.messageLog.count({ where: { status: 'sent' } })
    const failedMessages = await prisma.messageLog.count({ where: { status: 'failed' } })

    sections.push(`=== MESSAGES (SQLite) ===
Total messages logged: ${totalMessages}
Sent: ${sentMessages} | Failed: ${failedMessages}`)
  } catch {
    sections.push('=== MESSAGES === Data unavailable')
  }

  // Invoice services & packages
  try {
    const services = await prisma.invoiceService.findMany({
      select: { name: true, price: true, vehicleType: true },
      orderBy: { sortOrder: 'asc' },
    })
    const packages = await prisma.invoicePackage.findMany({
      select: { name: true, totalPrice: true, vehicleType: true },
      where: { isActive: true },
    })
    if (services.length > 0 || packages.length > 0) {
      sections.push(`=== SERVICES & PRICING ===
Services:
${services.map(s => `${s.name} (${s.vehicleType}): $${s.price.toFixed(2)}`).join('\n')}
${packages.length > 0 ? `\nPackages:\n${packages.map(p => `${p.name} (${p.vehicleType}): $${p.totalPrice.toFixed(2)}`).join('\n')}` : ''}`)
    }
  } catch {
    // skip
  }

  // Teamup calendar — upcoming classes
  try {
    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
    if (apiKey && calendarKey) {
      const today = now.toISOString().split('T')[0]
      const twoWeeks = new Date(now)
      twoWeeks.setDate(twoWeeks.getDate() + 14)
      const endDate = twoWeeks.toISOString().split('T')[0]

      // Also get past 2 weeks
      const twoWeeksAgo = new Date(now)
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
      const pastStart = twoWeeksAgo.toISOString().split('T')[0]

      // Fetch subcalendars (teachers)
      const subCalRes = await fetch(`https://api.teamup.com/${calendarKey}/subcalendars`, {
        headers: { 'Teamup-Token': apiKey },
      })
      const subCalData = subCalRes.ok ? await subCalRes.json() : { subcalendars: [] }
      const teacherMap = new Map((subCalData.subcalendars || []).map((s: { id: number; name: string }) => [s.id, s.name]))

      // Fetch events
      const eventsRes = await fetch(
        `https://api.teamup.com/${calendarKey}/events?startDate=${pastStart}&endDate=${endDate}`,
        { headers: { 'Teamup-Token': apiKey } }
      )

      if (eventsRes.ok) {
        const eventsData = await eventsRes.json()
        const events: Array<{ title: string; start_dt: string; end_dt: string; subcalendar_ids: number[]; notes?: string }> = eventsData.events || []

        const upcoming = events.filter(e => new Date(e.start_dt) >= now)
        const past = events.filter(e => new Date(e.start_dt) < now)

        // Count classes by teacher
        const classesByTeacher: Record<string, number> = {}
        for (const e of events) {
          const teacher = teacherMap.get(e.subcalendar_ids[0]) || 'Unknown'
          classesByTeacher[teacher as string] = ((classesByTeacher[teacher as string]) || 0) + 1
        }

        // Count classes by day of week
        const classesByDay: Record<string, number> = {}
        for (const e of events) {
          const day = new Date(e.start_dt).toLocaleDateString('en-US', { weekday: 'long' })
          classesByDay[day] = (classesByDay[day] || 0) + 1
        }

        const eventList = upcoming.slice(0, 30).map(e => {
          const teacher = teacherMap.get(e.subcalendar_ids[0]) || 'Unknown'
          const date = new Date(e.start_dt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          const time = new Date(e.start_dt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          return `${date} ${time} | ${e.title} | ${teacher}`
        }).join('\n')

        sections.push(`=== CLASS SCHEDULE (Teamup Calendar) ===
Total events (past 2 weeks + next 2 weeks): ${events.length}
Upcoming classes (next 2 weeks): ${upcoming.length}
Past classes (last 2 weeks): ${past.length}

Teachers:
${Array.from(teacherMap.values()).join(', ')}

Classes by teacher (last/next 2 weeks):
${Object.entries(classesByTeacher).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}: ${c}`).join('\n')}

Classes by day of week:
${Object.entries(classesByDay).sort((a, b) => b[1] - a[1]).map(([d, c]) => `${d}: ${c}`).join('\n')}

Upcoming classes:
${eventList || 'None scheduled'}`)
      }
    }
  } catch {
    sections.push('=== SCHEDULE === Data unavailable')
  }

  // Clover payments
  try {
    const merchantId = process.env.CLOVER_MERCHANT_ID
    const apiToken = process.env.CLOVER_API_TOKEN
    const cloverBase = process.env.CLOVER_SANDBOX === 'true'
      ? 'https://sandbox.dev.clover.com'
      : 'https://api.clover.com'

    if (merchantId && apiToken) {
      // Get recent orders (last 30 days)
      const thirtyDaysAgo = new Date(now)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const fromMs = thirtyDaysAgo.getTime()

      const res = await fetch(
        `${cloverBase}/v3/merchants/${merchantId}/orders?expand=lineItems&limit=100&orderBy=createdTime+DESC&filter=createdTime>=${fromMs}`,
        { headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' } }
      )

      if (res.ok) {
        const data = await res.json()
        const orders = (data.elements || []).map((o: { id: string; total: number; createdTime: number; state: string }) => ({
          id: o.id,
          total: (o.total || 0) / 100,
          date: new Date(o.createdTime).toISOString().split('T')[0],
          state: o.state,
        }))

        const totalCloverRevenue = orders.reduce((s: number, o: { total: number }) => s + o.total, 0)
        const paidOrders = orders.filter((o: { state: string }) => o.state === 'locked' || o.state === 'paid')

        sections.push(`=== CLOVER PAYMENTS (Last 30 Days) ===
Total orders: ${orders.length}
Total amount: $${totalCloverRevenue.toFixed(2)}
Paid/completed orders: ${paidOrders.length}

Recent orders:
${orders.slice(0, 20).map((o: { date: string; total: number; state: string; id: string }) => `${o.date} | $${o.total.toFixed(2)} | ${o.state} | ${o.id}`).join('\n')}`)
      }
    }
  } catch {
    sections.push('=== CLOVER === Data unavailable')
  }

  // Zoom attendance data
  try {
    const zoomRecords = await prisma.zoomAttendance.findMany({
      orderBy: { meetingDate: 'desc' },
      take: 20,
      select: { groupId: true, meetingDate: true, moduleNumber: true },
    })
    if (zoomRecords.length > 0) {
      sections.push(`=== ZOOM ATTENDANCE ===
Recent Zoom meetings tracked: ${zoomRecords.length}
${zoomRecords.map(z => `Module ${z.moduleNumber || '?'} | ${z.meetingDate} | Group: ${z.groupId.slice(0, 20)}...`).join('\n')}`)
    }
  } catch {
    // skip
  }

  const context = sections.join('\n\n')
  cachedContext = context
  cacheTimestamp = Date.now()
  return context
}

export const SYSTEM_PROMPT = `You are an analytics assistant for Qazi Driving School (Ecole de Conduite Qazi) in Montreal, Quebec.

You answer questions about business data — students, revenue, classes, attendance, certificates, and invoices.

When you want to show a chart, include a JSON block wrapped in <chart>...</chart> tags:
<chart>
{"type":"bar","title":"Chart Title","data":[{"name":"Jan","value":10},{"name":"Feb","value":15}]}
</chart>

Supported chart types: "bar", "line", "pie"
Each data item should have "name" (label) and "value" (number).

Keep responses concise and data-driven. Use dollar amounts in CAD. Format numbers with commas for readability.`
