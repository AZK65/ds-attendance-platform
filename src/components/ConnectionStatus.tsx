'use client'

import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Wifi, WifiOff, Loader2 } from 'lucide-react'

export function ConnectionStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/status')
      return res.json()
    },
    refetchInterval: 3000
  })

  if (isLoading) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking...
      </Badge>
    )
  }

  if (data?.isConnected) {
    return (
      <Badge variant="default" className="gap-1 bg-green-600">
        <Wifi className="h-3 w-3" />
        Connected
      </Badge>
    )
  }

  if (data?.isConnecting) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Connecting...
      </Badge>
    )
  }

  return (
    <Badge variant="destructive" className="gap-1">
      <WifiOff className="h-3 w-3" />
      Disconnected
    </Badge>
  )
}
