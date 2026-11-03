'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { motion, AnimatePresence } from 'motion/react'
import { Home, Users, Award, Receipt, UserPlus, MessageCircle, Sun, Moon, BarChart3, Target, Monitor, Settings, GraduationCap, MoreHorizontal, ChevronDown, Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConnectionStatus } from './ConnectionStatus'
import { NotificationBell } from './NotificationBell'
import { InboxAttentionBell } from './InboxAttentionBell'
import { LeadAttentionBar } from './LeadAttentionBar'
import { useEffect, useRef, useState } from 'react'

// Tabs shown directly in the bar — the day-to-day ones.
const PRIMARY_ITEMS = [
  { href: '/scheduling', label: 'Schedule', icon: Home },
  { href: '/groups', label: 'Groups', icon: Users },
  { href: '/students', label: 'Students', icon: UserPlus },
  { href: '/certificate', label: 'Certificates', icon: Award },
  { href: '/invoice', label: 'Invoices', icon: Receipt },
  { href: '/inbox', label: 'Inbox', icon: MessageCircle },
]

// Tabs tucked under the "More" dropdown to keep the bar uncrowded.
// (Home already opens /scheduling, so there's no separate Scheduling tab.)
const MORE_ITEMS = [
  { href: '/leads', label: 'Leads', icon: Target },
  { href: '/kiosks', label: 'Kiosks', icon: Monitor },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/lms', label: 'LMS', icon: GraduationCap },
  { href: '/settings', label: 'Settings', icon: Settings },
]

function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

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
            <Moon className="h-[18px] w-[18px] text-muted-foreground" />
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  )
}

export function Navbar() {
  const pathname = usePathname()
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--platform-header-height', `${nav.getBoundingClientRect().height}px`)
    })
    observer.observe(nav)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty('--platform-header-height')
    }
  }, [])

  // New-lead count for the badge on the Leads tab. Polls so leads coming in
  // from Google Ads surface without a refresh.
  const { data: leadData, isError: leadCountError } = useQuery<{ newCount: number }>({
    queryKey: ['leads', 'newCount'],
    queryFn: async () => {
      const res = await fetch('/api/leads?countOnly=1', { cache: 'no-store' })
      // An expired admin session is not a submissions connection failure.
      // The heartbeat redirects to login; keep this query quiet in the brief
      // interval before that navigation completes.
      if (res.status === 401) return { newCount: 0 }
      if (!res.ok) throw new Error('Lead notifications unavailable')
      return res.json()
    },
    refetchInterval: 15000,
    staleTime: 10000,
    refetchOnWindowFocus: true,
  })
  const newLeadCount = leadData?.newCount || 0

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }
  const moreActive = MORE_ITEMS.some(item => isActive(item.href))
  const currentPage = [...PRIMARY_ITEMS, ...MORE_ITEMS].find(item => isActive(item.href))

  return (
    <nav ref={navRef} aria-label="Main navigation" className="platform-nav">
      <LeadAttentionBar count={newLeadCount} unavailable={leadCountError} />
      <div className="platform-nav-inner">
          {/* Logo */}
          <Link href="/" className="justify-self-start rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <Image
              src="/qazi-logo.png"
              alt="Qazi Driving School"
              width={100}
              height={34}
              className="h-8 w-auto dark:rounded-sm dark:bg-white dark:ring-4 dark:ring-white sm:h-10"
            />
          </Link>

          {/* Nav Links */}
          <div className="platform-nav-links">
            {PRIMARY_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                aria-current={isActive(href) ? 'page' : undefined}
                className="platform-nav-link"
              >
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </span>
              </Link>
            ))}

            {/* More dropdown for the less-frequent tabs */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="platform-nav-link"
                  data-active={moreActive}
                  aria-label="More pages"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span>More</span>
                  <ChevronDown className="h-3 w-3 opacity-70" />
                  {/* Red dot so new leads are noticeable without opening the menu */}
                  {newLeadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48 p-2">
                {MORE_ITEMS.map(({ href, label, icon: Icon }) => (
                  <DropdownMenuItem key={label} asChild>
                    <Link
                      href={href}
                      className={`flex items-center gap-2 cursor-pointer ${
                        isActive(href) ? 'font-medium text-foreground' : ''
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                      {href === '/leads' && newLeadCount > 0 && (
                        <span className="ml-auto min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none">
                          {newLeadCount > 99 ? '99+' : newLeadCount}
                        </span>
                      )}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="platform-mobile-nav">
            <span className="text-sm font-semibold">{currentPage?.label || 'Qazi platform'}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="platform-nav-link" aria-label="Browse all pages">All pages<ChevronDown className="h-4 w-4" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-2">
                {[...PRIMARY_ITEMS, ...MORE_ITEMS].map(({ href, label, icon: Icon }) => (
                  <DropdownMenuItem key={href} asChild>
                    <Link href={href} aria-current={isActive(href) ? 'page' : undefined} className={`min-h-10 gap-3 ${isActive(href) ? 'bg-muted font-semibold' : ''}`}>
                      <Icon className="h-4 w-4" />{label}
                      {href === '/leads' && newLeadCount > 0 && <span className="ml-auto text-xs">{newLeadCount} new</span>}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Theme Toggle + Notification Bell + Connection Status */}
          <div className="platform-nav-tools">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('qazi:open-search'))}
              className="platform-search-trigger"
              aria-label="Search everything"
              title="Search everything (Command K)"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Search className="h-4 w-4 shrink-0" />
                <span className="platform-search-label">Search anything</span>
              </span>
              <kbd className="platform-search-shortcut">⌘ K</kbd>
            </button>
            <ThemeToggle />
            <InboxAttentionBell />
            <NotificationBell />
            <ConnectionStatus />
          </div>
      </div>
    </nav>
  )
}
