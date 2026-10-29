import { BRAND, emailLetterheadHtml } from './brand'

function shell(body: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color:${BRAND.ink};">
      ${emailLetterheadHtml()}
      ${body}
    </div>
  `
}

export function invoiceEmailHtml(input: { studentName?: string; invoiceNumber: string; schoolName: string }) {
  const studentName = input.studentName || ''
  return shell(`
          <h2 style="color: ${BRAND.blue};">Invoice ${input.invoiceNumber}</h2>
          <p>Bonjour ${studentName},</p>
          <p>Please find your invoice <strong>${input.invoiceNumber}</strong> attached to this email.</p>
          <p>If you have any questions about this invoice, please don't hesitate to contact us.</p>
          <br />
          <p>Merci / Thank you,</p>
          <p><strong>${input.schoolName}</strong></p>
  `)
}

export function contractEmailHtml(fullName: string) {
  return shell(`
      <p>Hello ${fullName},</p>
      <p>Please find your <strong>Class 1 service contract</strong> attached to this email,
      including both English and French versions.</p>
      <p>Keep this document until you obtain your licence — it is required by the SAAQ.</p>
      <p>Thank you,<br>Qazi Driving School</p>
  `)
}

export function registrationReceivedEmailHtml(input: {
  firstName: string
  schoolName: string
  fullName: string
  courseNameEn: string
  courseNameFr: string
  submittedEn: string
  submittedFr: string
  depositDollars: string
}) {
  return shell(`
                <h2 style="color:${BRAND.blue};margin-bottom:6px;">Registration received</h2>
                <p style="color:#555;margin-top:0;">Pending approval — usually within 72 hours.</p>

                <p>Hi ${input.firstName || 'there'},</p>
                <p>Thanks for registering with <strong>${input.schoolName}</strong>. Our team is reviewing your file and will confirm once your spot is secured. You'll get a second email the moment your registration is approved.</p>

                <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
                  <tr><td style="padding:6px 0;color:#777;width:140px;">Program</td><td style="padding:6px 0;"><strong>${input.courseNameEn}</strong></td></tr>
                  <tr><td style="padding:6px 0;color:#777;">Name</td><td style="padding:6px 0;">${input.fullName}</td></tr>
                  <tr><td style="padding:6px 0;color:#777;">Submitted</td><td style="padding:6px 0;">${input.submittedEn}</td></tr>
                  <tr><td style="padding:6px 0;color:#777;">Deposit on file</td><td style="padding:6px 0;">$${input.depositDollars} CAD <span style="color:#777;">(authorized only — no charge until approved)</span></td></tr>
                </table>

                <p style="color:#555;">Questions in the meantime? Just reply to this email, or call us at <strong>(514) 274-6948</strong>.</p>

                <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />

                <h3 style="color:${BRAND.blue};margin-bottom:6px;">Inscription reçue</h3>
                <p style="color:#555;margin-top:0;">En attente d'approbation — habituellement dans les 72 heures.</p>

                <p>Bonjour ${input.firstName},</p>
                <p>Merci pour votre inscription à <strong>${input.schoolName}</strong>. Notre équipe examine votre dossier et confirmera votre place dès que possible. Vous recevrez un deuxième courriel dès l'approbation.</p>

                <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
                  <tr><td style="padding:6px 0;color:#777;width:140px;">Programme</td><td style="padding:6px 0;"><strong>${input.courseNameFr}</strong></td></tr>
                  <tr><td style="padding:6px 0;color:#777;">Nom</td><td style="padding:6px 0;">${input.fullName}</td></tr>
                  <tr><td style="padding:6px 0;color:#777;">Soumis le</td><td style="padding:6px 0;">${input.submittedFr}</td></tr>
                  <tr><td style="padding:6px 0;color:#777;">Dépôt au dossier</td><td style="padding:6px 0;">${input.depositDollars} $ CAD <span style="color:#777;">(autorisation seulement — aucun débit avant l'approbation)</span></td></tr>
                </table>

                <p style="color:#555;">Des questions ? Répondez simplement à ce courriel, ou appelez-nous au <strong>(514) 274-6948</strong>.</p>

                <br/>
                <p>Merci / Thank you,<br/><strong>${input.schoolName}</strong></p>
  `)
}

export function registrationConfirmedEmailHtml(input: {
  firstName: string
  schoolName: string
  courseName: string
}) {
  return shell(`
                <h2 style="color:${BRAND.blue};">You're registered! 🎉</h2>
                <p>Hi ${input.firstName || 'there'},</p>
                <p>Your registration for the <strong>${input.courseName}</strong> course at
                   <strong>${input.schoolName}</strong> has been confirmed. Welcome aboard!</p>
                <p>Our team will be in touch with your class schedule and next steps. If you have any
                   questions in the meantime, just reply to this email.</p>
                <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
                <p style="color:#555;">Bonjour ${input.firstName}, votre inscription au cours
                   <strong>${input.courseName}</strong> est confirmée. Bienvenue&nbsp;!</p>
                <br/>
                <p>Merci / Thank you,<br/><strong>${input.schoolName}</strong></p>
  `)
}
