import { NextRequest, NextResponse } from 'next/server'

const FALLBACK_MEETING_ID = '4171672829'

// GET /api/zoom/live-meeting/debug?meetingId=<id>
// Calls Zoom's Dashboard API directly and reports the raw response so we
// can tell which failure mode we're hitting (401/403/404 plan limit vs.
// empty participant list vs. wrong endpoint, etc.)
export async function GET(request: NextRequest) {
  const meetingId = request.nextUrl.searchParams.get('meetingId') || FALLBACK_MEETING_ID

  // Re-implement getAccessToken inline so we can also report token state.
  const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env
  if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) {
    return NextResponse.json({ error: 'Zoom env vars missing' }, { status: 500 })
  }

  let token: string
  try {
    const credentials = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64')
    const tokenRes = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`,
      { method: 'POST', headers: { Authorization: `Basic ${credentials}` } },
    )
    if (!tokenRes.ok) {
      return NextResponse.json({ error: 'token failed', status: tokenRes.status, body: await tokenRes.text() })
    }
    const tokenData = await tokenRes.json()
    token = tokenData.access_token
  } catch (err) {
    return NextResponse.json({ error: 'token fetch threw', detail: String(err) })
  }

  // Try Dashboard API first
  const dashUrl = `https://api.zoom.us/v2/metrics/meetings/${meetingId}/participants?type=live&page_size=300`
  let dashRes
  try {
    dashRes = await fetch(dashUrl, { headers: { Authorization: `Bearer ${token}` } })
  } catch (err) {
    return NextResponse.json({ stage: 'dashboard fetch threw', detail: String(err) })
  }
  const dashStatus = dashRes.status
  const dashBody = await dashRes.text()

  // Also try the regular meeting details for comparison
  let detailsBody = ''
  let detailsStatus = 0
  try {
    const detailsRes = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    detailsStatus = detailsRes.status
    detailsBody = await detailsRes.text()
  } catch {}

  return NextResponse.json({
    meetingId,
    dashboard: {
      url: dashUrl,
      status: dashStatus,
      body: dashBody.slice(0, 2000),
    },
    meetingDetails: {
      status: detailsStatus,
      bodyPreview: detailsBody.slice(0, 500),
    },
  })
}
