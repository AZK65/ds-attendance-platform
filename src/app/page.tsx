'use client'

import { useQuery } from '@tanstack/react-query'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Link as LinkIcon, Users, ClipboardList, ArrowRight, Award, CalendarDays } from 'lucide-react'
import Link from 'next/link'

export default function Home() {
  const { data: status } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/status')
      return res.json()
    },
    refetchInterval: 5000
  })

  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const res = await fetch('/api/groups')
      return res.json()
    }
  })

  const isConnected = status?.isConnected ?? false
  const groupCount = groupsData?.groups?.length ?? 0

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Qazi Groups</h1>
          <ConnectionStatus />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Qazi Groups
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Manage your groups, track attendance, and sync members
              all in one place.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-12">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="h-5 w-5" />
                  Connect
                </CardTitle>
                <CardDescription>
                  Link your account by scanning a QR code
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Badge variant={isConnected ? 'default' : 'secondary'}>
                    {isConnected ? 'Connected' : 'Not Connected'}
                  </Badge>
                  <Link href="/connect">
                    <Button variant="ghost" size="sm">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Groups
                </CardTitle>
                <CardDescription>
                  View and select groups to manage
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{groupCount} groups</Badge>
                  <Link href="/groups">
                    <Button variant="ghost" size="sm">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Attendance
                </CardTitle>
                <CardDescription>
                  Track attendance and export to PDF
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Badge variant="outline">PDF Export</Badge>
                  <Link href="/groups">
                    <Button variant="ghost" size="sm">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Certificates
                </CardTitle>
                <CardDescription>
                  Generate driving course certificates with OCR
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Badge variant="outline">OCR Scan</Badge>
                  <Link href="/certificate">
                    <Button variant="ghost" size="sm">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Scheduling
                </CardTitle>
                <CardDescription>
                  Schedule classes for teachers via calendar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Badge variant="outline">Teamup</Badge>
                  <Link href="/scheduling">
                    <Button variant="ghost" size="sm">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-accent/50">
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">
                  1
                </div>
                <div>
                  <h4 className="font-medium">Connect</h4>
                  <p className="text-sm text-muted-foreground">
                    Go to the Connect page and scan the QR code with your
                    phone
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">
                  2
                </div>
                <div>
                  <h4 className="font-medium">Select a Group</h4>
                  <p className="text-sm text-muted-foreground">
                    Choose a group from your list to create an
                    attendance sheet
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">
                  3
                </div>
                <div>
                  <h4 className="font-medium">Manage Attendance</h4>
                  <p className="text-sm text-muted-foreground">
                    Add or remove people, mark attendance status, and add notes
                    for each person
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">
                  4
                </div>
                <div>
                  <h4 className="font-medium">Download PDF</h4>
                  <p className="text-sm text-muted-foreground">
                    Export your attendance sheet as a professional PDF document
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="mt-8 text-center">
            <Link href={isConnected ? '/groups' : '/connect'}>
              <Button size="lg">
                {isConnected ? 'View Groups' : 'Get Started'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
