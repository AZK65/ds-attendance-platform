'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { Home, Users, Award, CalendarDays, Link as LinkIcon } from 'lucide-react'
import { ConnectionStatus } from './ConnectionStatus'
import { NotificationBell } from './NotificationBell'

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
          {/* Logo */}
          <Link href="/" className="flex-shrink-0 mr-4">
            <Image
              src="/qazi-logo.png"
              alt="Qazi Driving School"
              width={100}
              height={34}
              className="h-9 w-auto"
            />
          </Link>

          {/* Nav Links */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive(href)
                    ? 'text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {isActive(href) && (
                  <motion.div
                    layoutId="activeNavTab"
                    className="absolute inset-0 bg-primary rounded-md"
                    transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon className="h-4 w-4" />
                  <span className="hidden md:inline">{label}</span>
                </span>
              </Link>
            ))}
          </div>

          {/* Notification Bell + Connection Status */}
          <div className="ml-4 flex-shrink-0 flex items-center gap-2">
            <NotificationBell />
            <ConnectionStatus />
          </div>
        </div>
      </div>
    </nav>
  )
}
