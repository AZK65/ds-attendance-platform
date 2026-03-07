import { NextRequest, NextResponse } from 'next/server'

const CLOVER_BASE = 'https://api.clover.com'

function getCloverCredentials() {
  const merchantId = process.env.CLOVER_MERCHANT_ID
  const apiToken = process.env.CLOVER_API_TOKEN
  if (!merchantId || !apiToken) return null
  return { merchantId, apiToken }
}

export async function GET(request: NextRequest) {
  try {
    const creds = getCloverCredentials()
    if (!creds) {
      return NextResponse.json(
        { error: 'Clover credentials not configured. Add CLOVER_MERCHANT_ID and CLOVER_API_TOKEN to your environment.' },
        { status: 400 }
      )
    }

    const from = request.nextUrl.searchParams.get('from') || ''
    const to = request.nextUrl.searchParams.get('to') || ''
    const orderId = request.nextUrl.searchParams.get('orderId') || ''

    // Fetch single order by ID
    if (orderId) {
      const res = await fetch(
        `${CLOVER_BASE}/v3/merchants/${creds.merchantId}/orders/${orderId}?expand=lineItems,payments`,
        {
          headers: { Authorization: `Bearer ${creds.apiToken}`, Accept: 'application/json' },
        }
      )
      if (!res.ok) {
        const err = await res.text()
        console.error('[Clover] Order fetch error:', err)
        return NextResponse.json({ error: 'Failed to fetch Clover order' }, { status: res.status })
      }
      const order = await res.json()
      return NextResponse.json({
        order: {
          id: order.id,
          total: (order.total || 0) / 100,
          createdTime: order.createdTime,
          state: order.state,
          lineItems: (order.lineItems?.elements || []).map((li: { name: string; price: number; unitQty: number }) => ({
            name: li.name,
            price: (li.price || 0) / 100,
            quantity: li.unitQty || 1,
          })),
        },
      })
    }

    // Fetch orders by date range
    const filters: string[] = []
    if (from) {
      const fromMs = new Date(from).setHours(0, 0, 0, 0)
      filters.push(`filter=createdTime>=${fromMs}`)
    }
    if (to) {
      const toMs = new Date(to).setHours(23, 59, 59, 999)
      filters.push(`filter=createdTime<=${toMs}`)
    }

    const filterStr = filters.length > 0 ? `&${filters.join('&')}` : ''
    const url = `${CLOVER_BASE}/v3/merchants/${creds.merchantId}/orders?expand=lineItems&limit=100&orderBy=createdTime+DESC${filterStr}`

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${creds.apiToken}`, Accept: 'application/json' },
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[Clover] Orders fetch error:', err)
      return NextResponse.json({ error: 'Failed to fetch Clover orders' }, { status: res.status })
    }

    const data = await res.json()
    const orders = (data.elements || []).map((order: { id: string; total: number; createdTime: number; state: string; lineItems?: { elements?: Array<{ name: string; price: number; unitQty: number }> } }) => ({
      id: order.id,
      total: (order.total || 0) / 100,
      createdTime: order.createdTime,
      date: new Date(order.createdTime).toISOString().split('T')[0],
      state: order.state,
      lineItems: (order.lineItems?.elements || []).map((li) => ({
        name: li.name,
        price: (li.price || 0) / 100,
        quantity: li.unitQty || 1,
      })),
    }))

    return NextResponse.json({ orders })
  } catch (error) {
    console.error('[Clover] Error fetching orders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch Clover orders', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
