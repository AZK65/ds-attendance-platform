'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays, FileText, GraduationCap, LayoutDashboard, Loader2,
  Receipt, Search, Settings, Target, UserRound, Users,
} from 'lucide-react'
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem,
  CommandList, CommandSeparator,
} from '@/components/ui/command'

type GlobalSearchResult = {
  id: string
  type: 'student' | 'group-member' | 'group' | 'invoice' | 'registration' | 'lead'
  title: string
  subtitle: string
  meta?: string
  href: string
}

const QUICK_LINKS = [
  { title: 'Schedule', subtitle: 'Classes, teachers and sign-in mode', href: '/scheduling', icon: CalendarDays },
  { title: 'Students', subtitle: 'Profiles, registrations and progress', href: '/students', icon: UserRound },
  { title: 'Groups', subtitle: 'Class 5 and Class 1 cohorts', href: '/groups', icon: Users },
  { title: 'Invoices', subtitle: 'Create and review invoices', href: '/invoice', icon: Receipt },
  { title: 'Leads', subtitle: 'New and unfinished registrations', href: '/leads', icon: Target },
  { title: 'LMS', subtitle: 'Lessons, exams and student activity', href: '/lms', icon: GraduationCap },
  { title: 'Settings', subtitle: 'Pricing, devices and platform settings', href: '/settings', icon: Settings },
]

const resultIcons: Record<GlobalSearchResult['type'], typeof Search> = {
  student: UserRound,
  'group-member': UserRound,
  group: Users,
  invoice: Receipt,
  registration: FileText,
  lead: Target,
}

const groupLabels: Record<GlobalSearchResult['type'], string> = {
  student: 'Students',
  'group-member': 'Group members',
  group: 'Groups',
  invoice: 'Invoices',
  registration: 'Registrations',
  lead: 'Leads',
}

export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 180)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen(value => !value)
      }
    }
    const openSearch = () => setOpen(true)
    document.addEventListener('keydown', keydown)
    window.addEventListener('qazi:open-search', openSearch)
    return () => {
      document.removeEventListener('keydown', keydown)
      window.removeEventListener('qazi:open-search', openSearch)
    }
  }, [])

  const { data, isFetching } = useQuery<{ results: GlobalSearchResult[] }>({
    queryKey: ['global-search', debouncedQuery],
    queryFn: async () => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
      if (!response.ok) throw new Error('Search failed')
      return response.json()
    },
    enabled: open && debouncedQuery.length >= 2,
    staleTime: 20_000,
  })

  const grouped = useMemo(() => {
    const map = new Map<string, GlobalSearchResult[]>()
    for (const result of data?.results || []) {
      const label = groupLabels[result.type]
      map.set(label, [...(map.get(label) || []), result])
    }
    return Array.from(map.entries())
  }, [data?.results])

  const go = (href: string) => {
    setOpen(false)
    setQuery('')
    setDebouncedQuery('')
    router.push(href)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setQuery('')
      setDebouncedQuery('')
    }
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Search Qazi"
      description="Search students, groups, invoices, registrations and leads"
      shouldFilter={false}
      className="max-w-2xl overflow-hidden"
    >
      <div className="relative">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search a name, phone, invoice, group, licence…"
        />
        {isFetching && <Loader2 className="absolute right-4 top-3.5 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      <CommandList className="max-h-[min(560px,70vh)]">
        {query.trim().length < 2 ? (
          <CommandGroup heading="Go to">
            {QUICK_LINKS.map(item => (
              <CommandItem key={item.href} value={item.href} onSelect={() => go(item.href)} className="gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : (
          <>
            {!isFetching && grouped.length === 0 && (
              <CommandEmpty>No records found for “{query.trim()}”.</CommandEmpty>
            )}
            {grouped.map(([label, results], groupIndex) => (
              <div key={label}>
                {groupIndex > 0 && <CommandSeparator />}
                <CommandGroup heading={label}>
                  {results.map(result => {
                    const Icon = resultIcons[result.type]
                    return (
                      <CommandItem
                        key={result.id}
                        value={result.id}
                        onSelect={() => go(result.href)}
                        className="gap-3 py-3"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{result.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{result.subtitle}</span>
                        </span>
                        {result.meta && (
                          <span className="hidden max-w-32 truncate rounded-full bg-muted px-2 py-1 text-[10px] capitalize text-muted-foreground sm:block">
                            {result.meta}
                          </span>
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </div>
            ))}
          </>
        )}
      </CommandList>
      <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><LayoutDashboard className="h-3 w-3" /> Search across Qazi</span>
        <span className="flex items-center gap-2"><kbd className="rounded border bg-background px-1.5 py-0.5">↑↓</kbd> navigate <kbd className="rounded border bg-background px-1.5 py-0.5">↵</kbd> open</span>
      </div>
    </CommandDialog>
  )
}
