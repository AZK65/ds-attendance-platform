# Text and number motion

`MorphText` is presentation-only. It displays the current value from existing
state; it never changes money calculations, query timing, or mutation results.
Torph 0.1.3 is pinned in both the platform and marketing repos.

## Platform placements

- Invoice subtotal, taxes and total, including line-item additions/edits.
- Student/filter counts, live attendance counts, paper-exam statistics.
- Document-selection count and preparing-download labels.
- Group schedule save state, exam instructions state, invoice generation and
  email/WhatsApp sending state. Success still requires the existing API response.

The wrapper respects reduced motion, exposes one immediately updated accessible
text value, hides animation glyphs from screen readers, and prints static text.
Use `reserve` only for short labels whose neighbours must not move. Inputs remain
native; don't use it for paragraphs, data-entry fields or every table cell.

## Verification

Run without production credentials, with background jobs disabled. Generate the
Prisma client, build, then start the platform on 127.0.0.1:3103. Start a built
marketing preview on 127.0.0.1:4175.

```sh
node scripts/verify-text-morph.cjs platform
node scripts/verify-text-morph.cjs marketing
```

These browser checks intercept every API call with synthetic fixtures and block
external requests. They do not send messages, charge cards or save invoices.
Checks cover live numeric transitions through 9/10/99/100, two-item totals,
rapid price-tab changes, stable element identity, French/English headline cycles,
390px mobile layout, reduced motion, static printing and browser exceptions.
Screenshots go to ignored `output/text-morph/`.

Both production builds and browser checks passed. Existing lint failures in
Students/GroupScheduleDialog (unescaped apostrophes) and marketing Inscription
(synchronous state in an effect) were reproduced on their base revisions. No
new motion-component lint failures. No deployment or live data changes.
