import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { reconciliationPreview, applyReviewedBalance, type ReconciliationInvoice, type ReviewedBalancePlan } from '../src/lib/invoice-reconciliation'

async function main() {
  const args=process.argv.slice(2)
  // Offline preview: pipe a minimal read-only export into this process. No DB connection.
  if(args.includes('--stdin')) {
    const rows=JSON.parse(readFileSync(0,'utf8')) as ReconciliationInvoice[]
    const accounts=reconciliationPreview(rows)
    const result={generatedAt:new Date().toISOString(),readOnly:true,accounts}
    const output=args.indexOf('--output')
    if(output>=0) {
      const target=path.resolve(args[output+1]);mkdirSync(path.dirname(target),{recursive:true})
      writeFileSync(target,JSON.stringify(result,null,2),{mode:0o600})
      const escape=(s:unknown)=>String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
      const money=(n:number|null)=>n==null?'Review needed':new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(n)
      const changed=accounts.filter(a=>a.proposedBalance!=null&&a.proposedBalance!==a.currentBalance)
      const render=(rows:typeof accounts)=>rows.map(a=>`<tr><td>${escape(a.studentName)}<br><small>${escape(a.identityKey)}</small></td><td>${escape(a.invoiceNumbers.join(', '))}</td><td>${money(a.currentBalance)}</td><td>${money(a.proposedBalance)}</td><td>${escape(a.issues.join('; ')||'Consistent snapshots; approval still required')}</td></tr>`).join('')
      writeFileSync(target.replace(/\.json$/,'.html'),`<!doctype html><meta charset="utf-8"><title>Invoice balance reconciliation — review only</title><style>body{font:16px system-ui;margin:32px;color:#181818}table{border-collapse:collapse;width:100%}th,td{text-align:left;vertical-align:top;padding:12px;border:1px solid #ddd}small{color:#666}h2{margin-top:32px}</style><h1>Invoice balance reconciliation</h1><p>Read-only preview, generated ${escape(result.generatedAt)}. No payments, invoice amounts, or balances have been changed.</p><p>${accounts.length} accounts · ${changed.length} proposed balance changes · ${accounts.filter(a=>a.issues.length).length} need manual review. A proposal is inferred from consistent saved snapshots, not independent proof of the agreed course price. Missing course totals are never assumed.</p><h2>Proposed changes for approval</h2><table><tr><th>Student</th><th>Invoices</th><th>Currently shown</th><th>Proposed</th><th>Review notes</th></tr>${render(changed)}</table><h2>All accounts</h2><table><tr><th>Student</th><th>Invoices</th><th>Currently shown</th><th>Proposed</th><th>Review notes</th></tr>${render(accounts)}</table>`,{mode:0o600})
      console.log(JSON.stringify({accounts:accounts.length,changed:changed.map(a=>({student:a.studentName,invoices:a.invoiceNumbers,before:a.currentBalance,proposed:a.proposedBalance})),manualReview:accounts.filter(a=>a.issues.length).length,output:target},null,2))
    } else console.log(JSON.stringify(result,null,2))
    return
  }
  const {prisma}=await import('../src/lib/db')
  try {
    const index=args.indexOf('--apply-reviewed-plan')
    if(index>=0) {
      if(!args.includes('--confirm-reviewed') || !args[index+1])throw new Error('Explicit --confirm-reviewed and a reviewed plan file are required')
      const plans=JSON.parse(readFileSync(args[index+1],'utf8')) as ReviewedBalancePlan[]
      if(!Array.isArray(plans))throw new Error('Expected an array of reviewed account plans')
      const result=await prisma.$transaction(async tx=>{
        const results=[]
        for(const plan of plans)results.push(await applyReviewedBalance(tx,plan))
        return results
      },{timeout:60000})
      console.log(JSON.stringify(result,null,2))
    } else {
      console.log(JSON.stringify({generatedAt:new Date().toISOString(),readOnly:true,accounts:reconciliationPreview(await prisma.invoice.findMany())},null,2))
    }
  } finally {await prisma.$disconnect()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
