'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpRight, CalendarDays, FileText, GraduationCap, LayoutDashboard, AlertCircle,
  Receipt, Search, Settings, Target, UserRound, Users, X,
} from 'lucide-react'
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem,
  CommandList, CommandSeparator,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'

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

  const { data, isFetching, isError, refetch } = useQuery<{ results: GlobalSearchResult[] }>({
    queryKey: ['global-search', debouncedQuery],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`, { signal })
      if (!response.ok) throw new Error('Search failed')
      return response.json()
    },
    enabled: open && debouncedQuery.length >= 2,
    staleTime: 20_000,
    retry: 1,
  })
  const isDebouncing = query.trim() !== debouncedQuery
  const isSearching = isDebouncing || isFetching

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
      showCloseButton={false}
      className="top-[8dvh] flex w-[calc(100%-1.5rem)] max-h-[84dvh] flex-col gap-0 max-w-3xl translate-y-0 overflow-hidden rounded-2xl border-foreground/10 shadow-2xl sm:top-[12dvh] sm:max-w-3xl"
    >
      <div className="relative shrink-0 bg-popover">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search students, phone numbers, groups, invoices…"
          className="h-14 pr-28 text-base"
          aria-label="Search students, groups, invoices and leads"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-12 top-2 flex h-8 items-center justify-center rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
          >
            Clear
          </button>
        )}
        <button type="button" onClick={() => handleOpenChange(false)} aria-label="Close search" className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <CommandList className="min-h-0 max-h-[60dvh] flex-1" aria-busy={isSearching}>
        {query.trim().length === 0 ? (
          <CommandGroup
            heading="Quick access"
            className="p-3 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium sm:[&_[cmdk-group-items]]:grid sm:[&_[cmdk-group-items]]:grid-cols-2 sm:[&_[cmdk-group-items]]:gap-1"
          >
            {QUICK_LINKS.map(item => (
              <CommandItem key={item.href} value={item.href} onSelect={() => go(item.href)} className="group gap-3 rounded-xl px-3 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-data-[selected=true]:opacity-100" />
              </CommandItem>
            ))}
          </CommandGroup>
        ) : query.trim().length < 2 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border bg-muted/40">
              <Search className="h-5 w-5 text-muted-foreground" />
            </span>
            <p className="font-medium">Keep typing</p>
            <p className="mt-1 text-sm text-muted-foreground">Enter at least two characters to search every record.</p>
          </div>
        ) : isSearching ? (
          <div className="space-y-2 p-4" role="status">
            <span className="sr-only">Searching across Qazi</span>
            {[ 'w-2/3', 'w-1/2', 'w-3/4' ].map((width) => (
              <div key={width} className="flex items-center gap-3 rounded-lg p-3 motion-safe:animate-pulse" aria-hidden="true">
                <div className="h-10 w-10 shrink-0 rounded-lg bg-muted" />
                <div className="flex-1 space-y-2"><div className={`h-3 rounded bg-muted ${width}`} /><div className="h-2 w-1/3 rounded bg-muted" /></div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex min-h-52 flex-col items-center justify-center gap-3 px-6 text-center" role="alert">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
            <p className="font-medium">Search is unavailable</p>
            <p className="text-sm text-muted-foreground">Your records haven’t changed. Try connecting again.</p>
            <Button variant="outline" onClick={() => void refetch()}>Try again</Button>
          </div>
        ) : (
          <>
            {!isFetching && grouped.length === 0 && (
              <CommandEmpty className="py-16">
                <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border bg-muted/40">
                  <Search className="h-5 w-5 text-muted-foreground" />
                </span>
                <span className="block font-medium">No results for “{query.trim()}”</span>
                <span className="mt-1 block text-xs text-muted-foreground">Try a phone number, email, invoice number, or shorter name.</span>
              </CommandEmpty>
            )}
            {grouped.map(([label, results], groupIndex) => (
              <div key={label}>
                {groupIndex > 0 && <CommandSeparator />}
                <CommandGroup
                  heading={`${label} · ${results.length}`}
                  className="p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium"
                >
                  {results.map(result => {
                    const Icon = resultIcons[result.type]
                    return (
                      <CommandItem
                        key={result.id}
                        value={result.id}
                        onSelect={() => go(result.href)}
                        className="group gap-3 rounded-xl px-3 py-3"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{result.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{result.subtitle}</span>
                        </span>
                        {result.meta && (
                          <span className="hidden max-w-32 truncate text-xs capitalize text-muted-foreground sm:block" title={result.meta}>
                            {result.meta}
                          </span>
                        )}
                        <ArrowUpRight className="hidden h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-data-[selected=true]:opacity-100 sm:block" />
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </div>
            ))}
          </>
        )}
      </CommandList>
      <div className="flex shrink-0 items-center justify-between border-t bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><LayoutDashboard className="h-3 w-3" /> Search across Qazi</span>
        <span className="hidden items-center gap-2 sm:flex"><kbd className="rounded border bg-background px-1.5 py-0.5">↑↓</kbd> navigate <kbd className="rounded border bg-background px-1.5 py-0.5">↵</kbd> open <kbd className="rounded border bg-background px-1.5 py-0.5">Esc</kbd> close</span>
      </div>
    </CommandDialog>
  )
}
