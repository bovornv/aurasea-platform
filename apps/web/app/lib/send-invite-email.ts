/**
 * AuraSea invitation email — Thai-first, operating-layer identity.
 * Set RESEND_API_KEY and RESEND_FROM_EMAIL to send; otherwise no-op.
 */

const RESEND_API = 'https://api.resend.com/emails';

export type InviteScope = 'organization' | 'branch';

const COPY = {
  th: {
    subject: 'คุณได้รับคำเชิญเข้าร่วมระบบ AuraSea',
    headerBrand: 'AuraSea',
    headerTagline: 'ชั้นปฏิบัติการของธุรกิจจริง',
    bodyIntro: 'คุณได้รับคำเชิญให้เข้าร่วมเป็นสมาชิกของทีมในระบบ AuraSea',
    bodyRole: 'บทบาท:',
    bodyExpiry: 'ลิงก์นี้ใช้ได้ภายใน 48 ชั่วโมง',
    bodyIgnore: 'หากคุณไม่เคยคาดหวังอีเมลนี้ สามารถละเว้นได้',
    cta: 'เข้าร่วมระบบ',
    footer: 'Operating Layer for the Real Economy',
  },
  en: {
    subject: 'You\'re invited to join AuraSea',
    headerBrand: 'AuraSea',
    headerTagline: 'Operating layer for real business',
    bodyIntro: 'You have been invited to join a team on AuraSea.',
    bodyRole: 'Role:',
    bodyExpiry: 'This link expires in 48 hours.',
    bodyIgnore: 'If you didn\'t expect this email, you can ignore it.',
    cta: 'Join',
    footer: 'Operating Layer for the Real Economy',
  },
} as const;

function buildHtml(inviteLink: string, role: string, scope: InviteScope, locale: 'th' | 'en'): string {
  const t = COPY[locale];
  const scopeLabel = scope === 'organization' ? (locale === 'th' ? 'ระดับองค์กร' : 'organization') : (locale === 'th' ? 'ระดับสาขา' : 'branch');
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.subject}</title>
</head>
<body style="margin:0; padding:0; font-family: system-ui, -apple-system, sans-serif; background:#f8fafc; color:#0f172a;">
  <div style="max-width: 480px; margin: 0 auto; padding: 2rem 1.5rem;">
    <div style="background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.06); overflow: hidden;">
      <div style="padding: 1.5rem 1.5rem 0.75rem; border-bottom: 1px solid #e2e8f0;">
        <div style="font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: #0f172a;">${t.headerBrand}</div>
        <div style="font-size: 13px; color: #64748b; margin-top: 0.25rem;">${t.headerTagline}</div>
      </div>
      <div style="padding: 1.5rem;">
        <p style="margin: 0 0 1rem; font-size: 15px; line-height: 1.6; color: #334155;">${t.bodyIntro}</p>
        <p style="margin: 0 0 0.5rem; font-size: 14px; color: #475569;"><strong>${t.bodyRole}</strong> ${role} (${scopeLabel})</p>
        <p style="margin: 0 0 1.25rem; font-size: 13px; color: #64748b;">${t.bodyExpiry}</p>
        <p style="margin: 0 0 1.25rem;">
          <a href="${inviteLink}" style="display: inline-block; padding: 0.75rem 1.5rem; background: #0f172a; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">${t.cta}</a>
        </p>
        <p style="margin: 0; font-size: 12px; color: #94a3b8;">${t.bodyIgnore}</p>
      </div>
      <div style="padding: 0.75rem 1.5rem; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #64748b;">
        ${t.footer}
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export async function sendInviteEmail(
  to: string,
  inviteLink: string,
  role: string,
  scope: InviteScope
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'AuraSea <no-reply@auraseaos.com>';
  if (!apiKey) {
    return { sent: false };
  }
  const subject = COPY.th.subject;
  const html = buildHtml(inviteLink, role, scope, 'th');
  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (data as { message?: string }).message || res.statusText;
      return { sent: false, error: err };
    }
    return { sent: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Unknown error';
    return { sent: false, error: err };
  }
}
