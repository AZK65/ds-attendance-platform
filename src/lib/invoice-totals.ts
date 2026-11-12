/**
 * Invoice line totals shared by the create and edit screens.
 *
 * gstRate and qstRate are percentages (5 means 5%, 9.975 means 9.975%).
 * A tax-inclusive line already contains GST and QST, so the pre-tax amount
 * is extracted and the entered price stays the line total. A tax-exclusive
 * line has those rates added on top. Taxes that are turned off contribute
 * nothing. Per-line amounts are rounded to cents before tax is applied, and
 * the four returned amounts are rounded once at the end — the same order the
 * create page used before this helper existed.
 */
export interface InvoiceTotalLine {
  quantity: number
  unitPrice: number
  /** When true and taxes are enabled, unitPrice already includes GST and QST. */
  taxInclusive?: boolean
}

export interface InvoiceTotals {
  subtotal: number
  gstAmount: number
  qstAmount: number
  total: number
}

export function computeInvoiceTotals(
  lineItems: readonly InvoiceTotalLine[],
  options: { taxesEnabled: boolean; gstRate: number; qstRate: number },
): InvoiceTotals {
  const { taxesEnabled, gstRate, qstRate } = options
  const taxMultiplier = 1 + gstRate / 100 + qstRate / 100

  let totalBeforeTax = 0
  let totalGst = 0
  let totalQst = 0
  let totalAmount = 0

  for (const item of lineItems) {
    const lineTotal = Math.round(item.quantity * item.unitPrice * 100) / 100

    if (taxesEnabled && item.taxInclusive) {
      // Tax-inclusive: price already contains taxes, extract them
      const beforeTax = lineTotal / taxMultiplier
      const gst = beforeTax * gstRate / 100
      const qst = beforeTax * qstRate / 100
      totalBeforeTax += beforeTax
      totalGst += gst
      totalQst += qst
      totalAmount += lineTotal // total stays the same as entered
    } else if (taxesEnabled) {
      // Tax-exclusive: add taxes on top
      const gst = lineTotal * gstRate / 100
      const qst = lineTotal * qstRate / 100
      totalBeforeTax += lineTotal
      totalGst += gst
      totalQst += qst
      totalAmount += lineTotal + gst + qst
    } else {
      // No taxes
      totalBeforeTax += lineTotal
      totalAmount += lineTotal
    }
  }

  return {
    subtotal: Math.round(totalBeforeTax * 100) / 100,
    gstAmount: Math.round(totalGst * 100) / 100,
    qstAmount: Math.round(totalQst * 100) / 100,
    total: Math.round(totalAmount * 100) / 100,
  }
}
