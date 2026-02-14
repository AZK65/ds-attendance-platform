'use client'

import { QRCodeDisplay } from '@/components/QRCodeDisplay'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ConnectPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <QRCodeDisplay />
      </main>
    </div>
  )
}
