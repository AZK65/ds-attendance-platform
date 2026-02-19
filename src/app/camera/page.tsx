'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Peer, { DataConnection } from 'peerjs'

type Status = 'connecting' | 'connected' | 'sent' | 'error'

function CameraPage() {
  const searchParams = useSearchParams()
  const peerId = searchParams.get('peer')

  const [status, setStatus] = useState<Status>('connecting')
  const [errorMsg, setErrorMsg] = useState('')
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [flash, setFlash] = useState(false)
  const [photoCount, setPhotoCount] = useState(0)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const connRef = useRef<DataConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const peerRef = useRef<Peer | null>(null)

  // Start camera
  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    // Stop existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      console.error('Camera error:', err)
      setErrorMsg('Camera access denied. Please allow camera permission.')
      setStatus('error')
    }
  }, [])

  // Connect to desktop peer
  useEffect(() => {
    if (!peerId) {
      setErrorMsg('No peer ID provided')
      setStatus('error')
      return
    }

    const peer = new Peer()
    peerRef.current = peer

    peer.on('open', () => {
      console.log('[camera] Peer open, connecting to:', peerId)
      const conn = peer.connect(peerId, { reliable: true })
      connRef.current = conn

      conn.on('open', () => {
        console.log('[camera] Connected to desktop')
        setStatus('connected')
        startCamera('environment')
      })

      conn.on('error', (err) => {
        console.error('[camera] Connection error:', err)
        setErrorMsg('Connection lost. Please re-scan the QR code.')
        setStatus('error')
      })

      conn.on('close', () => {
        console.log('[camera] Connection closed')
        setErrorMsg('Connection closed by desktop.')
        setStatus('error')
      })
    })

    peer.on('error', (err) => {
      console.error('[camera] Peer error:', err)
      setErrorMsg('Failed to connect. Please try again.')
      setStatus('error')
    })

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
      peer.destroy()
    }
  }, [peerId, startCamera])

  // Capture photo
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !connRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)
    const base64 = canvas.toDataURL('image/jpeg', 0.85)

    // Flash effect
    setFlash(true)
    setTimeout(() => setFlash(false), 150)

    // Send over data channel — split into chunks if too large
    try {
      // PeerJS can handle large data, send as JSON message
      connRef.current.send(JSON.stringify({ type: 'photo', data: base64 }))
      setPhotoCount(prev => prev + 1)
      setStatus('sent')
      // Reset back to connected after brief feedback
      setTimeout(() => setStatus('connected'), 1500)
    } catch (err) {
      console.error('[camera] Send error:', err)
      setErrorMsg('Failed to send photo. Try again.')
    }
  }

  // Switch camera
  const switchCamera = () => {
    const newFacing = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(newFacing)
    startCamera(newFacing)
  }

  if (!peerId) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="text-center text-white">
          <p className="text-xl font-bold mb-2">Invalid Link</p>
          <p className="text-white/60">Please scan the QR code from the certificate page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex flex-col relative overflow-hidden">
      {/* Status Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${
            status === 'connected' ? 'bg-green-500' :
            status === 'sent' ? 'bg-blue-500' :
            status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            'bg-red-500'
          }`} />
          <span className="text-white/80 text-sm font-medium">
            {status === 'connecting' && 'Connecting...'}
            {status === 'connected' && 'Connected — Ready'}
            {status === 'sent' && 'Photo sent!'}
            {status === 'error' && 'Disconnected'}
          </span>
        </div>
        {photoCount > 0 && (
          <span className="text-white/60 text-sm">{photoCount} photo{photoCount !== 1 ? 's' : ''} sent</span>
        )}
      </div>

      {/* Camera Viewfinder */}
      {status !== 'error' && (
        <div className="flex-1 relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Flash overlay */}
          {flash && (
            <div className="absolute inset-0 bg-white z-10" />
          )}
          {/* Hidden canvas for capture */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {/* Error State */}
      {status === 'error' && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center text-white">
            <div className="text-5xl mb-4">📷</div>
            <p className="text-lg font-medium mb-2">Connection Error</p>
            <p className="text-white/60 text-sm mb-6">{errorMsg}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-white text-black px-6 py-3 rounded-full font-medium"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Connecting State */}
      {status === 'connecting' && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center text-white">
            <div className="text-5xl mb-4 animate-pulse">📡</div>
            <p className="text-lg font-medium mb-2">Connecting to Desktop...</p>
            <p className="text-white/60 text-sm">Please wait</p>
          </div>
        </div>
      )}

      {/* Controls */}
      {(status === 'connected' || status === 'sent') && (
        <div className="absolute bottom-0 left-0 right-0 z-20 pb-10 pt-6 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center justify-center gap-8">
            {/* Switch Camera */}
            <button
              onClick={switchCamera}
              className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center active:bg-white/30"
            >
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            {/* Capture Button */}
            <button
              onClick={capturePhoto}
              disabled={status === 'sent'}
              className={`h-20 w-20 rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform ${
                status === 'sent' ? 'bg-blue-500' : 'bg-white/10'
              }`}
            >
              {status === 'sent' ? (
                <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <div className="h-16 w-16 rounded-full bg-white" />
              )}
            </button>

            {/* Spacer */}
            <div className="h-12 w-12" />
          </div>
        </div>
      )}
    </div>
  )
}

export default function CameraPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white animate-pulse">Loading camera...</div>
      </div>
    }>
      <CameraPage />
    </Suspense>
  )
}
