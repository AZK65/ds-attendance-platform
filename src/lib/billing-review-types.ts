/** Public review DTO. Never expose the device session token to the browser. */
export interface BillingReviewAccount {
  identityKey: string
  studentName: string
  phone: string | null
  studentId: number | null
  fingerprint: string
  currentBalance: number
  totalPaid: number
  suggestedChargesCents: number | null
  issues: string[]
  canApprove: boolean
  reviewed: boolean
  audit: null | { by: string | null; note: string; at: string; openingCharges: number; previousBalance: number | null; paidAtReview: number | null }
  invoices: Array<{ id: string; number: string; date: string; total: number; status: string; savedBalance: number | null }>
}
