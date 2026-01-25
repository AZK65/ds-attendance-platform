'use client'

import { QRCodeDisplay } from '@/components/QRCodeDisplay'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ConnectPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold">Connect WhatsApp</h1>
          </div>
          <ConnectionStatus />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <QRCodeDisplay />
      </main>
    </div>
  )
}
