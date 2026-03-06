'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { ScheduledMessageProcessor } from './ScheduledMessageProcessor'
import { Navbar } from './Navbar'

// Pages that should NOT show the navbar (public/student-facing)
const HIDE_NAVBAR_PATHS = ['/enroll', '/login']

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const hideNavbar = HIDE_NAVBAR_PATHS.some(path => pathname.startsWith(path))

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            refetchOnWindowFocus: false
          }
        }
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ScheduledMessageProcessor />
      {!hideNavbar && <Navbar />}
      {children}
    </QueryClientProvider>
  )
}
