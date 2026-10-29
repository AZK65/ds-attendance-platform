/**
 * Qazi Driving School brand, taken from the marketing site
 * (Cloudflare Pages project qazi-driving-web, published as qazidrivingschool.com;
 * fetched from https://qazi-driving-web.pages.dev because the apex host did not
 * resolve here). Values are the CSS custom properties in assets/index-*.css:
 *
 *   --color-brand-red: #e32726
 *   --color-brand-red-600: #c5121f
 *   --color-brand-blue: #1e3fcb
 *   --color-brand-blue-700: #162c8e
 *   --color-brand-green: #2fa94a
 *   --color-brand-green-700: #1f8235
 *   --color-ink: #0e1116
 *   --color-ink-70: #3b4150
 *   --color-rule: #e5e7ec
 *   --color-surface: #fff
 *   --color-surface-muted: #f4f5f8
 *   --color-cream: #fafaf7
 *
 * The wordmark is public/qazi-logo.png. It is byte-identical to
 * https://qazi-driving-web.pages.dev/qazi-logo.png (1265×493 PNG,
 * sha256 bce8ee98350abadeb9b977c4f9be295478b8071ca9be42f22b10662d9f292a4b).
 * The site has no full-logo SVG. favicon.svg is only the Q mark.
 */
export const BRAND = {
  red: '#E32726',
  red600: '#C5121F',
  blue: '#1E3FCB',
  blue700: '#162C8E',
  green: '#2FA94A',
  green700: '#1F8235',
  ink: '#0E1116',
  ink70: '#3B4150',
  rule: '#E5E7EC',
  surface: '#FFFFFF',
  surfaceMuted: '#F4F5F8',
  cream: '#FAFAF7',
  /** White on blue700. Dark enough that a grayscale copy stays readable. */
  onBlue: '#FFFFFF',
} as const

export const LOGO_SHA256 = 'bce8ee98350abadeb9b977c4f9be295478b8071ca9be42f22b10662d9f292a4b'

/** Intrinsic pixel size of public/qazi-logo.png. */
export const LOGO_PIXELS = { width: 1265, height: 493 } as const

export function logoHeightForWidth(width: number) {
  return width * (LOGO_PIXELS.height / LOGO_PIXELS.width)
}

export function hexToUnit(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '')
  const value = Number.parseInt(normalized, 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

/** Inline letterhead placed above existing email copy. Wording stays in the caller. */
export function emailLetterheadHtml() {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px;">
      <tr>
        <td width="33%" height="6" style="background:${BRAND.blue};font-size:0;line-height:0;">&nbsp;</td>
        <td width="34%" height="6" style="background:${BRAND.red};font-size:0;line-height:0;">&nbsp;</td>
        <td width="33%" height="6" style="background:${BRAND.green};font-size:0;line-height:0;">&nbsp;</td>
      </tr>
    </table>
    <img src="cid:qazi-logo" width="150" height="58" alt="Qazi Driving School" style="display:block;border:0;outline:none;margin:0 0 16px;" />
  `.trim()
}
