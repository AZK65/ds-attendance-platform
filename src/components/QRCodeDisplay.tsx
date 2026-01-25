'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, RefreshCw, Check } from 'lucide-react'
import Image from 'next/image'

export function QRCodeDisplay() {
  const queryClient = useQueryClient()

  const { data: status } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/status')
      return res.json()
    },
    refetchInterval: 2000
  })

  const { data: qrData, isLoading: qrLoading } = useQuery({
    queryKey: ['whatsapp-qr'],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/qr')
      return res.json()
    },
    refetchInterval: 2000,
    enabled: !status?.isConnected
  })

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/whatsapp/connect', { method: 'POST' })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-qr'] })
    }
  })

  if (status?.isConnected) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-600">
            <Check className="h-5 w-5" />
            Connected to WhatsApp
          </CardTitle>
          <CardDescription>
            Your WhatsApp is connected. You can now manage your groups.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild className="w-full">
            <a href="/groups">Go to Groups</a>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Connect to WhatsApp</CardTitle>
        <CardDescription>
          Scan the QR code with your WhatsApp to connect
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {!status?.isConnecting && !qrData?.qrImage && (
          <Button
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
          >
            {connectMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              'Start Connection'
            )}
          </Button>
        )}

        {(status?.isConnecting || qrLoading) && !qrData?.qrImage && (
          <div className="flex flex-col items-center gap-2 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Generating QR code...
            </p>
          </div>
        )}

        {qrData?.qrImage && (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-lg">
              <Image
                src={qrData.qrImage}
                alt="WhatsApp QR Code"
                width={256}
                height={256}
                className="rounded"
              />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Open WhatsApp on your phone, go to Settings → Linked Devices → Link a Device
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['whatsapp-qr'] })
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh QR
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
