# Invoice balance reconciliation — review required

This branch is **not ready for an unattended production deployment**. It adds an explicit account ledger instead of treating the latest invoice's remaining-balance snapshot as the source of truth. No historical balance is migrated by a request, build, or schema update.

## Meaning of the amounts

- Course charge: the full agreed, tax-inclusive obligation, entered once.
- Installment invoice: a request/receipt for part of that obligation; adds no second course charge.
- New service invoice: adds its own tax-inclusive charge.
- Paid: confirmed receipt. Unpaid does not reduce the account balance.
- Account credit: confirmed payments exceed recorded obligations; shown separately from zero debt.
- Refund: preserves the original receipt and a linked credit note. Refunding an installment restores the course balance; refunding a standalone service also cancels that service charge. This endpoint records a refund; it does not move money through Clover.

An invoice PDF distinguishes the amount due on that invoice, confirmed payments through its receipt date, and the current account balance. Reopening an older receipt does not include later payments in its payment-history total. The current balance is deliberately labelled current, not a frozen historical statement.

## Review before rollout

1. Back up production before any schema or financial-data operation.
2. Run `scripts/reconcile-invoice-balances.ts --stdin --output output/invoice-reconciliation.json` with a read-only invoice export. HTML and JSON contain personal data: keep them local and out of Git.
3. Review each account against its contract and actual receipts. A consistent snapshot proposal is not proof of the full course price. Never infer credits or obligations from conflicting snapshots.
4. Review and approve individual plans with a written reason. The apply command requires both `approved: true` and `--confirm-reviewed`; it rechecks fingerprints and rejects stale data. Do not bulk approve unresolved accounts.
5. Only after explicit deployment and financial-change approval, apply the additive schema and reviewed plans in a controlled maintenance window. Validate selected student profiles, invoices and payment transitions before enabling normal invoicing.

**Rollout blocker:** existing unlinked accounts cannot create new manual invoices, edit monetary amounts, delete invoices or record refunds until reconciled. Their old balance is preserved and labelled “Needs review.” Registration-generated receipts remain unlinked when their course obligation cannot be established. Do not deploy this branch without a practical reconciliation plan for those students.

The old “edit the last receipt's balance” shortcut is disabled. New-course cancellation and later manual account adjustments need an audited adjustment workflow; the initial reconciliation script is not a general account editor. Paid receipts cannot be deleted. Partial refunds are not implemented.

## Verification

`npm run test:invoice-billing` exercises synthetic SQLite accounts and actual route handlers, including pending/paid/refunded transitions, duplicate receipt saves, deletion, course installments, new charges, credits, PDF history, explicit review approval and stale-plan rejection.

Also run `npm run test:class1-contract`, `npm run test:invoice-email`, `node --test scripts/invoice-match.test.mjs`, and a production build with `QAZI_DISABLE_BACKGROUND_JOBS=1` and no production environment file.

`node scripts/verify-invoice-billing-ui.cjs` uses only mocked requests against an isolated local server on port 3102. It must never be pointed at production.
