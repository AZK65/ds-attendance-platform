'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Mail, MessageCircle, Receipt } from 'lucide-react'

function ReminderSwitch({
  queryKey,
  href,
  label,
  title,
  icon: Icon,
  description,
  detail,
}: {
  queryKey: string
  href: string
  label: string
  title: string
  icon: typeof MessageCircle
  description: string
  detail: string
}) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery<{ enabled: boolean }>({
    queryKey: [queryKey],
    queryFn: async () => {
      const res = await fetch(href)
      if (!res.ok) throw new Error('Failed to load reminder setting')
      return res.json()
    },
  })

  const save = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(href, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error('Failed to save reminder setting')
      return res.json() as Promise<{ enabled: boolean }>
    },
    onSuccess: (next) => {
      queryClient.setQueryData([queryKey], next)
    },
  })

  const enabled = data?.enabled === true

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-5 w-5" /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{enabled ? 'On' : 'Off'}</p>
          <p className="text-xs text-muted-foreground mt-1">{detail}</p>
          {save.isError && <p className="text-sm text-destructive mt-2">Could not save. Try again.</p>}
        </div>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={label}
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
  )
}

export default function ReminderSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Payment reminders</h2>
        <p className="text-sm text-muted-foreground">
          Automatic follow-up for an unpaid Class 5 registration. WhatsApp and email are separate, and each stays off until you turn it on.
        </p>
      </div>

      <ReminderSwitch
        queryKey="class5-payment-reminder"
        href="/api/settings/class5-payment-reminder"
        label="Class 5 unpaid payment reminders"
        title="Class 5 unpaid checkout — WhatsApp"
        icon={MessageCircle}
        description="About 20 minutes after a Class 5 student opens Clover and the first payment still has not come through, send one WhatsApp message with their payment link. Each registration is messaged at most once."
        detail="Uses the school WhatsApp already connected to this app. Nothing is sent while WhatsApp is disconnected, and registrations older than 24 hours are left alone."
      />

      <ReminderSwitch
        queryKey="class5-payment-reminder-email"
        href="/api/settings/class5-payment-reminder-email"
        label="Class 5 unpaid payment reminder emails"
        title="Class 5 unpaid checkout — email"
        icon={Mail}
        description="Send the same payment link by email, once per registration. This does not wait for WhatsApp, and a WhatsApp reminder does not replace it."
        detail="Sent through the school’s Resend address. Registrations with no email address, and registrations older than 24 hours, are left alone."
      />

      <div>
        <h2 className="text-lg font-semibold">Online payment receipt</h2>
        <p className="text-sm text-muted-foreground">
          Email the branded invoice after Clover confirms an online registration payment. This stays off until you turn it on.
        </p>
      </div>

      <ReminderSwitch
        queryKey="invoice-email-after-online-payment"
        href="/api/settings/invoice-email-after-online-payment"
        label="Email the invoice after an online payment"
        title="Invoice email after online payment"
        icon={Receipt}
        description="When a student finishes the online registration checkout and the payment is confirmed, email them the branded invoice PDF. Each invoice is sent once."
        detail="Uses the school’s Resend address. Only a checkout confirmed while this switch is on is emailed."
      />
    </div>
  )
}
