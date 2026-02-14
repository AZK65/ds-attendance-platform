'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Users, Award, CalendarDays, Link as LinkIcon } from 'lucide-react'
import { ConnectionStatus } from './ConnectionStatus'

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/connect', label: 'Connect', icon: LinkIcon },
  { href: '/groups', label: 'Groups', icon: Users },
  { href: '/certificate', label: 'Certificates', icon: Award },
  { href: '/scheduling', label: 'Scheduling', icon: CalendarDays },
]

export function Navbar() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <nav className="border-b bg-background sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo / Brand */}
          <Link href="/" className="font-semibold text-lg whitespace-nowrap mr-4">
            Qazi DS
          </Link>

          {/* Nav Links */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive(href)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            ))}
          </div>

          {/* Connection Status */}
          <div className="ml-4 flex-shrink-0">
            <ConnectionStatus />
          </div>
        </div>
      </div>
    </nav>
  )
}
