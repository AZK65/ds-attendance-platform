import { BRAND } from './brand'

export function buildSchedulingPrintHtml(input: {
  title: string
  subtitle: string
  headers: string[]
  tableRowsHtml: string
  rowCount: number
  logoHtml: string
  landscape: boolean
  generatedLabel: string
}) {
  return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${input.title}</title>
        <style>
          @page { margin: 40px; size: ${input.landscape ? 'landscape' : 'portrait'}; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; color: ${BRAND.ink}; }
          .stripe { display: flex; height: 6px; margin: -20px -20px 16px; }
          .stripe span { flex: 1; }
          .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid ${BRAND.rule}; }
          .header-left { display: flex; align-items: center; gap: 16px; }
          .header-text h1 { font-size: 18px; margin: 0 0 2px 0; color: ${BRAND.blue}; }
          .header-text .subtitle { font-size: 12px; color: ${BRAND.ink70}; margin: 0; }
          .count-badge { background: ${BRAND.surfaceMuted}; border-radius: 6px; padding: 4px 12px; font-size: 12px; color: ${BRAND.ink70}; font-weight: 500; }
          table { width: 100%; border-collapse: collapse; }
          th { text-align: left; padding: 8px 10px; background: ${BRAND.blue700}; border-bottom: 2px solid ${BRAND.blue700}; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND.onBlue}; }
          tr:nth-child(even) td { background: ${BRAND.surfaceMuted}; }
          .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid ${BRAND.rule}; font-size: 10px; color: ${BRAND.ink70}; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="stripe">
          <span style="background:${BRAND.blue}"></span>
          <span style="background:${BRAND.red}"></span>
          <span style="background:${BRAND.green}"></span>
        </div>
        <div class="header">
          <div class="header-left">
            ${input.logoHtml}
            <div class="header-text">
              <h1>${input.title}</h1>
              <div class="subtitle">${input.subtitle}</div>
            </div>
          </div>
          <div class="count-badge">${input.rowCount} class${input.rowCount !== 1 ? 'es' : ''}</div>
        </div>
        <table>
          <thead><tr>${input.headers.map(header => `<th>${header}</th>`).join('')}</tr></thead>
          <tbody>${input.tableRowsHtml}</tbody>
        </table>
        <div class="footer">
          <span>Qazi Driving School</span>
          <span>Generated ${input.generatedLabel}</span>
        </div>
      </body>
      </html>
    `
}
