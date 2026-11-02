'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, MessageCircle } from 'lucide-react'

export default function ReminderSettingsPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery<{ enabled: boolean }>({
    queryKey: ['class5-payment-reminder'],
    queryFn: async () => {
      const res = await fetch('/api/settings/class5-payment-reminder')
      if (!res.ok) throw new Error('Failed to load reminder setting')
      return res.json()
    },
  })

  const save = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch('/api/settings/class5-payment-reminder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error('Failed to save reminder setting')
      return res.json() as Promise<{ enabled: boolean }>
    },
    onSuccess: (next) => {
      queryClient.setQueryData(['class5-payment-reminder'], next)
    },
  })

  const enabled = data?.enabled === true

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Payment reminders</h2>
        <p className="text-sm text-muted-foreground">
          Automatic WhatsApp follow-up for an unpaid Class 5 registration.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-5 w-5" /> Class 5 unpaid checkout
          </CardTitle>
          <CardDescription>
            About 20 minutes after a Class 5 student opens Clover and the first payment still has not come through, send one WhatsApp message with their payment link. Each registration is messaged at most once. This stays off until you turn it on.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{enabled ? 'On' : 'Off'}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Uses the school WhatsApp already connected to this app. Nothing is sent while WhatsApp is disconnected, and registrations older than 24 hours are left alone.
            </p>
            {save.isError && <p className="text-sm text-destructive mt-2">Could not save. Try again.</p>}
          </div>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Class 5 unpaid payment reminders"
              disabled={isError || save.isPending}
              onClick={() => save.mutate(!enabled)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                enabled ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  enabled ? 'translate-x-5' : ''
                }`}
              />
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
