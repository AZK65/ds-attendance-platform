'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Navbar } from './Navbar'

// Pages that should NOT show the navbar (public/student-facing)
const HIDE_NAVBAR_PATHS = ['/enroll', '/login', '/register', '/exam', '/book']

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const hideNavbar = HIDE_NAVBAR_PATHS.some(path => pathname.startsWith(path))

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,   // 5 min default — pages override with longer times
            gcTime: 30 * 60 * 1000,      // Keep unused cache for 30 min
            refetchOnWindowFocus: false,
          }
        }
      })
  )

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        {!hideNavbar && <Navbar />}
        {children}
      </QueryClientProvider>
    </ThemeProvider>
  )
}
