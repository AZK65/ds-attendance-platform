'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { motion, AnimatePresence } from 'motion/react'
import { Home, Users, Award, CalendarDays, Link as LinkIcon, Receipt, UserPlus, MessageCircle, Sun, Moon, BarChart3 } from 'lucide-react'
import { ConnectionStatus } from './ConnectionStatus'
import { NotificationBell } from './NotificationBell'
import { useEffect, useState } from 'react'

const NAV_ITEMS = [
  { href: '/scheduling', label: 'Home', icon: Home },
  { href: '/groups', label: 'Groups', icon: Users },
  { href: '/certificate', label: 'Certificates', icon: Award },
  { href: '/scheduling', label: 'Scheduling', icon: CalendarDays },
  { href: '/invoice', label: 'Invoices', icon: Receipt },
  { href: '/students', label: 'Students', icon: UserPlus },
  { href: '/inbox', label: 'Inbox', icon: MessageCircle },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
]

function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return <div className="w-9 h-9" />

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="relative w-9 h-9 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.div
            key="sun"
            initial={{ rotate: -90, scale: 0, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <Sun className="h-[18px] w-[18px] text-amber-400" />
          </motion.div>
        ) : (
          <motion.div
            key="moon"
            initial={{ rotate: 90, scale: 0, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: -90, scale: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <Moon className="h-[18px] w-[18px] text-slate-700" />
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  )
}

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

          {/* Theme Toggle + Notification Bell + Connection Status */}
          <div className="ml-4 flex-shrink-0 flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
            <ConnectionStatus />
          </div>
        </div>
      </div>
    </nav>
  )
}
