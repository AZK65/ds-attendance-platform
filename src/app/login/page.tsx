'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Image from 'next/image'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        setError('Wrong password')
        setPassword('')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <motion.div
        className="w-full max-w-sm mx-auto p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          className="flex flex-col items-center mb-8"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Image
            src="/qazi-logo.png"
            alt="Qazi Driving School"
            width={80}
            height={80}
            className="mb-4"
          />
          <h1 className="text-xl font-semibold">Qazi Groups</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter password to continue</p>
        </motion.div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            disabled={loading}
          />
          <AnimatePresence>
            {error && (
              <motion.p
                className="text-sm text-red-500 text-center"
                initial={{ opacity: 0, y: -5, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -5, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
          <Button type="submit" className="w-full" disabled={loading || !password}>
            {loading ? 'Checking...' : 'Login'}
          </Button>
        </form>
      </motion.div>
    </div>
  )
}
