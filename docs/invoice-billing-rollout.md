# Invoice balance reconciliation — review required

This update adds an explicit account ledger instead of treating the latest invoice's remaining-balance snapshot as the source of truth. No historical balance is migrated by a read request, build, or schema update. Staff approve accounts individually at **Invoices → Balance review** (`/invoice/balances`). The user requested this screen before release.

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
4. Use the screen to inspect receipts, enter the independently verified tax-inclusive full obligation, and preview the resulting balance or credit. Staff must enter their name and evidence note and explicitly confirm the review. No suggested amount is prefilled. The server requires an authenticated registered device session, derives invoice IDs itself, and rejects stale or conflicting identities. It records reviewer, device session, timestamp, previous balance, paid total and fingerprint. The device session token is never returned to the browser.
5. Deploy the additive schema after backup and verification, without applying historical plans. Staff can then approve individual accounts on the screen. The optional CLI apply command still requires `approved: true` and `--confirm-reviewed`. Do not bulk approve unresolved accounts.

**Normal invoice workflow:** a custom invoice defaults to a new charge, even if the student already owes money. Staff can choose payment toward an existing balance (zero new charge), or a new course agreement with a tax-inclusive full price, with or without a package. Saved course charges do not follow later package-price changes.

**Incomplete history:** new charges can be invoiced immediately into the ledger while old unlinked receipts stay untouched. The UI shows new activity separately, and the PDF does not present an unconfirmed historical balance as final. Old payments are not treated as credit against new charges. When staff next take an installment, they can confirm the full agreed historical charges directly in that invoice, with one amount and a checkbox. The authenticated device session is recorded; confirmation and invoice save are one transaction. Stale history rejects the save. After confirmation, all payments calculate automatically. Existing separately recorded charges are retained and deducted from the opening-charge entry to avoid duplication. The advanced review screen remains optional. Legacy invoice monetary edits/deletion/refunds still require reconciliation; ambiguous identities are never guessed. Registration receipts without a saved full obligation still need that one-time confirmation.

The old “edit the last receipt's balance” shortcut is disabled. New-course cancellation and later manual account adjustments need an audited adjustment workflow; the initial reconciliation script is not a general account editor. Paid receipts cannot be deleted. Partial refunds are not implemented.

## Verification

`npm run test:invoice-billing` exercises synthetic SQLite accounts and actual route handlers, including pending/paid/refunded transitions, duplicate receipt saves, deletion, course installments, new charges, credits, PDF history, explicit review approval and stale-plan rejection.

Also run `npm run test:class1-contract`, `npm run test:invoice-email`, `node --test scripts/invoice-match.test.mjs`, and a production build with `QAZI_DISABLE_BACKGROUND_JOBS=1` and no production environment file.

`node scripts/verify-invoice-billing-ui.cjs` uses only mocked requests against an isolated local server on port 3102. It must never be pointed at production.
