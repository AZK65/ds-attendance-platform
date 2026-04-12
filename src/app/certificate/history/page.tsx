'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Award, Search, Edit3, Trash2, Download, Loader2,
  Phone, MapPin, ArrowLeft, Database,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'

interface CertificateRecord {
  id: string
  studentId: string
  certificateType: string
  contractNumber: string | null
  attestationNumber: string | null
  generatedAt: string
  source?: string
  student: {
    id: string
    name: string
    phone: string | null
    licenceNumber: string | null
    address: string | null
    municipality: string | null
    postalCode: string | null
  }
}

export default function CertificateHistoryPage() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const { data, isLoading } = useQuery<{ certificates: CertificateRecord[] }>({
    queryKey: ['certificate-history'],
    queryFn: async () => {
      const res = await fetch('/api/certificate/history')
      return res.json()
    },
  })

  const certificates = data?.certificates || []

  const filtered = search.trim()
    ? certificates.filter(c => {
        const q = search.toLowerCase()
        return (
          c.student.name?.toLowerCase().includes(q) ||
          c.student.phone?.includes(q) ||
          c.contractNumber?.includes(q) ||
          c.attestationNumber?.includes(q)
        )
      })
    : certificates

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/certificate/history?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificate-history'] })
      setDeleteConfirm(null)
    },
  })

  const regenerateMutation = useMutation({
    mutationFn: async (cert: CertificateRecord) => {
      const res = await fetch('/api/certificate/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: cert.studentId,
          certificateId: cert.id,
          certificateType: cert.certificateType,
        }),
      })
      if (!res.ok) throw new Error('Failed to regenerate')
      return res.blob()
    },
    onSuccess: (blob, cert) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `certificate-${cert.student.name}-${cert.certificateType}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
  })

  const handleEdit = (cert: CertificateRecord) => {
    // Redirect to certificate page in Database mode with this student pre-loaded
    router.push(`/certificate?mode=database&search=${encodeURIComponent(cert.student.name)}`)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  }

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <Link href="/certificate">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Award className="h-6 w-6" />
              Certificate History
            </h1>
            <p className="text-sm text-muted-foreground">
              {certificates.length} certificate{certificates.length !== 1 ? 's' : ''} generated
            </p>
          </div>
        </div>
      </motion.div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, contract or attestation number..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </motion.div>

      {/* Certificates List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {search ? 'No certificates match your search' : 'No certificates generated yet'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map((cert, i) => (
              <motion.div
                key={cert.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card className="hover:border-primary/30 transition-colors">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold truncate">{cert.student.name}</p>
                          <Badge variant={cert.certificateType === 'full' ? 'default' : 'secondary'} className="text-xs shrink-0">
                            {cert.certificateType === 'full' ? 'Full' : 'Phase 1'}
                          </Badge>
                          {cert.source === 'mysql' && (
                            <Badge variant="outline" className="text-xs shrink-0"><Database className="h-3 w-3 mr-1" />MySQL</Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          {cert.student.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {cert.student.phone}
                            </span>
                          )}
                          {cert.student.municipality && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {cert.student.municipality}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-x-4 mt-2 text-sm">
                          {cert.contractNumber && (
                            <span>Contract: <span className="font-mono font-medium">{cert.contractNumber}</span></span>
                          )}
                          {cert.attestationNumber && (
                            <span>Attestation: <span className="font-mono font-medium">{cert.attestationNumber}</span></span>
                          )}
                          <span className="text-muted-foreground">{formatDate(cert.generatedAt)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleEdit(cert)}
                          title="Edit in certificate maker"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => regenerateMutation.mutate(cert)}
                          disabled={regenerateMutation.isPending}
                          title="Download PDF"
                        >
                          {regenerateMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500"
                          onClick={() => setDeleteConfirm(cert.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Certificate?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete this certificate record. The student data will not be affected.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
