'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, RefreshCw, Check } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export function QRCodeDisplay() {
  const queryClient = useQueryClient()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const { data: status, error: statusError } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/status', { cache: 'no-store' })
      if (!res.ok) throw new Error(res.status === 401 ? 'Your staff login expired. Sign in again to connect WhatsApp.' : 'Could not check the WhatsApp connection.')
      return res.json()
    },
    refetchInterval: 2000
  })

  const { data: qrData, error: qrError, dataUpdatedAt } = useQuery({
    queryKey: ['whatsapp-qr'],
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/whatsapp/qr', { cache: 'no-store', signal })
      if (!res.ok) throw new Error(res.status === 401 ? 'Sign in again to view a fresh QR code.' : 'Could not load the QR code. Retry the connection.')
      return res.json()
    },
    refetchInterval: 2000,
    enabled: !status?.isConnected
  })

  const { data: diagnostics } = useQuery({
    queryKey: ['whatsapp-diagnostics'],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/diagnostics', { cache: 'no-store' })
      if (!res.ok) throw new Error('Could not check session backups')
      return res.json()
    },
    refetchInterval: 10000,
  })

  const connectMutation = useMutation({
    mutationFn: async (action: 'connect' | 'refresh' | 'reconnect' | 'restore') => {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Connection failed')
      return data
    },
    onMutate: () => {
      queryClient.setQueryData(['whatsapp-qr'], { qrImage: null })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-qr'] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-diagnostics'] })
    }
  })
  const error = statusError?.message || qrError?.message || connectMutation.error?.message || status?.lastError
  const qrFresh = qrData?.qrImage && !qrError && !statusError && !status?.authenticatedAt &&
    dataUpdatedAt > now - 15000 && qrData.generatedAt > now - 65000
  const backup = diagnostics?.backup
  const backupInfo = <div className="w-full text-sm text-muted-foreground space-y-2">
    {backup?.lastBackupAt ? <p>Session backup saved {new Date(backup.lastBackupAt).toLocaleString()}.</p> : <p>A session backup will be saved after WhatsApp connects successfully.</p>}
    {backup?.revoked && <p>WhatsApp logged this device out. An old backup cannot replace a new scan.</p>}
    <p>Reconnecting keeps the saved session. WhatsApp may still require you to link the phone again.</p>
  </div>

  if (status?.isConnected) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-600">
            <Check className="h-5 w-5" />
            Connected
          </CardTitle>
          <CardDescription>
            You are connected. You can now manage your groups.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {backupInfo}
          <Button variant="outline" asChild className="w-full">
            <Link href="/groups">Go to groups</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Connect</CardTitle>
        <CardDescription>
          Open WhatsApp → Settings → Linked devices → Link a device. Scan with WhatsApp, not your camera app.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {error && (
          <div className="w-full p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700 text-center">
            {error}
          </div>
        )}

        {!qrFresh && !status?.isConnecting && (
          <Button
            onClick={() => connectMutation.mutate('connect')}
            disabled={connectMutation.isPending}
          >
            {connectMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              connectMutation.isError ? 'Retry Connection' : 'Start Connection'
            )}
          </Button>
        )}

        {status?.isConnecting && !qrFresh && (
          <div className="flex flex-col items-center gap-2 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {status?.authenticatedAt ? 'Phone linked. Syncing WhatsApp…' : 'Preparing a fresh QR code…'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => connectMutation.mutate('reconnect')}
              disabled={connectMutation.isPending}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Reconnect without deleting session
            </Button>
          </div>
        )}

        {qrFresh && (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-lg">
              <Image
                src={qrData.qrImage}
                alt="WhatsApp QR Code"
                width={320}
                height={320}
                unoptimized
                className="h-auto w-full max-w-xs"
              />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Open WhatsApp on your phone, go to Settings → Linked Devices → Link a Device
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={connectMutation.isPending}
              onClick={() => connectMutation.mutate('refresh')}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Get a new QR code
            </Button>
          </div>
        )}
        {!qrFresh && !status?.authenticatedAt && status?.isConnecting && !connectMutation.isPending && (
          <Button variant="outline" onClick={() => connectMutation.mutate('refresh')}>Get a new QR code</Button>
        )}
        {backupInfo}
        {backup?.count > 0 && !backup.revoked && !status?.authenticatedAt && (
          <Button variant="outline" disabled={connectMutation.isPending} onClick={() => connectMutation.mutate('restore')}>Restore saved session</Button>
        )}
      </CardContent>
    </Card>
  )
}
