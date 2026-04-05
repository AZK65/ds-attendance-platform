import { prisma } from '@/lib/db'
import { searchStudents, countStudentsByDateRange } from '@/lib/external-db'

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

    // Get total student count
    const allStudents = await searchStudents('%').catch(() => [])

    sections.push(`=== STUDENTS (MySQL) ===
Total students in database: ${allStudents.length}
New enrollments this month (${thisMonth}): ${(thisMonthCount as Array<{ count: number }>)[0]?.count || 0}
New enrollments last month (${lastMonthStr}): ${(lastMonthCount as Array<{ count: number }>)[0]?.count || 0}`)
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

    sections.push(`=== INVOICES & REVENUE (SQLite) ===
Total invoices: ${totalInvoices}
Paid: ${paidInvoices} | Unpaid: ${unpaidInvoices}
Total revenue (all time): $${(invoiceRevenue._sum.total || 0).toFixed(2)}
Paid revenue: $${(paidRevenue._sum.total || 0).toFixed(2)}
Outstanding (unpaid): $${(unpaidTotal._sum.total || 0).toFixed(2)}
Monthly revenue (last 6 months): ${JSON.stringify(monthlyRevenue)}`)
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

  // Invoice services
  try {
    const services = await prisma.invoiceService.findMany({
      select: { name: true, price: true },
      orderBy: { sortOrder: 'asc' },
    })
    if (services.length > 0) {
      sections.push(`=== SERVICES & PRICING ===
${services.map(s => `${s.name}: $${s.price.toFixed(2)}`).join('\n')}`)
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
