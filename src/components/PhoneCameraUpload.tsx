'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Peer, { DataConnection } from 'peerjs'
import QRCode from 'qrcode'
import { Loader2, Smartphone, CheckCircle2, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PhoneCameraUploadProps {
  onCapture: (base64: string) => void
  onClose: () => void
}

type Status = 'initializing' | 'waiting' | 'connected' | 'received' | 'error'

export function PhoneCameraUpload({ onCapture, onClose }: PhoneCameraUploadProps) {
  const [status, setStatus] = useState<Status>('initializing')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [photoCount, setPhotoCount] = useState(0)
  const peerRef = useRef<Peer | null>(null)
  const connRef = useRef<DataConnection | null>(null)

  const handleData = useCallback((rawData: unknown) => {
    try {
      const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData
      if (parsed.type === 'photo' && parsed.data) {
        setPhotoCount(prev => prev + 1)
        setStatus('received')
        onCapture(parsed.data)
        // Reset to connected after brief feedback
        setTimeout(() => setStatus('connected'), 2000)
      }
    } catch (err) {
      console.error('[PhoneCameraUpload] Failed to parse data:', err)
    }
  }, [onCapture])

  useEffect(() => {
    const peer = new Peer()
    peerRef.current = peer

    peer.on('open', (id) => {
      console.log('[PhoneCameraUpload] Peer open with ID:', id)
      setStatus('waiting')

      // Generate QR code with camera page URL
      const url = `${window.location.origin}/camera?peer=${id}`
      QRCode.toDataURL(url, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      }).then(dataUrl => {
        setQrDataUrl(dataUrl)
      }).catch(err => {
        console.error('[PhoneCameraUpload] QR generation failed:', err)
      })
    })

    peer.on('connection', (conn) => {
      console.log('[PhoneCameraUpload] Phone connected')
      connRef.current = conn
      setStatus('connected')

      conn.on('data', handleData)

      conn.on('close', () => {
        console.log('[PhoneCameraUpload] Phone disconnected')
        connRef.current = null
        // Don't set error if we already received photos
        if (photoCount === 0) {
          setStatus('waiting')
        }
      })
    })

    peer.on('error', (err) => {
      console.error('[PhoneCameraUpload] Peer error:', err)
      setStatus('error')
    })

    return () => {
      peer.destroy()
    }
  }, [handleData, photoCount])

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      {/* Status */}
      {status === 'initializing' && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Setting up connection...</p>
        </div>
      )}

      {status === 'waiting' && qrDataUrl && (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Smartphone className="h-4 w-4" />
            <span>Scan this QR code with your phone</span>
          </div>
          <div className="bg-white p-3 rounded-xl shadow-sm border">
            <img src={qrDataUrl} alt="QR Code" className="w-56 h-56" />
          </div>
          <p className="text-xs text-muted-foreground text-center max-w-[280px]">
            Your phone&apos;s camera will open. Take a photo and it will appear here instantly.
          </p>
        </>
      )}

      {status === 'connected' && (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="flex items-center gap-2 text-green-600">
            <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium">Phone connected</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {photoCount > 0
              ? `${photoCount} photo${photoCount !== 1 ? 's' : ''} received — take another or close`
              : 'Take a photo on your phone — it will appear here'
            }
          </p>
          {qrDataUrl && (
            <div className="bg-white p-2 rounded-lg border opacity-50 scale-75">
              <img src={qrDataUrl} alt="QR Code" className="w-32 h-32" />
            </div>
          )}
        </div>
      )}

      {status === 'received' && (
        <div className="flex flex-col items-center gap-3 py-8">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
          <p className="text-sm font-medium text-green-600">Photo received!</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-3 py-8">
          <WifiOff className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Connection failed</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      )}

      {/* Done button */}
      {photoCount > 0 && status !== 'received' && (
        <Button onClick={onClose} className="mt-2">
          Done ({photoCount} photo{photoCount !== 1 ? 's' : ''})
        </Button>
      )}
    </div>
  )
}
