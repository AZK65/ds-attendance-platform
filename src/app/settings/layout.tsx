'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, DollarSign, Laptop, GraduationCap, MessageCircle } from 'lucide-react'

const TABS = [
  { href: '/settings/pricing', label: 'Pricing', icon: DollarSign },
  { href: '/settings/reminders', label: 'Reminders', icon: MessageCircle },
  { href: '/settings/devices', label: 'Devices', icon: Laptop },
  { href: '/settings/instructors', label: 'Instructors', icon: GraduationCap },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="platform-page-heading">
        <div><h1>Settings</h1><p>Manage pricing, reminders, connected devices and instructors.</p></div>
        <Link href="/scheduling">
          <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4" />Schedule</Button>
        </Link>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map(t => {
          const active = pathname.startsWith(t.href)
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Link>
          )
        })}
      </div>

      {children}
    </main>
  )
}
