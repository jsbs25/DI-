/**
 * Pluggable mail provider for transactional email (verification/reset).
 * IMPORTANT: No real email is sent without a configured provider.
 * Configure via env: MAIL_PROVIDER=smtp + SMTP_HOST/PORT/USER/PASS/FROM, or leave unset for BLOCKED.
 * Never fabricates successful delivery.
 */
export interface MailSendResult {
  success: boolean;
  provider: string;
  blocked?: boolean;
  messageId?: string;
  error?: string;
}

export interface MailProvider {
  id: string;
  isConfigured(): boolean;
  send(to: string, subject: string, text: string, html?: string): Promise<MailSendResult>;
}

class UnconfiguredMailProvider implements MailProvider {
  id = 'unconfigured';
  isConfigured() { return false; }
  async send(): Promise<MailSendResult> {
    return { success: false, provider: this.id, blocked: true, error: 'Mail provider not configured. Set MAIL_PROVIDER and credentials (e.g. SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/MAIL_FROM). No email was sent.' };
  }
}

class SmtpMailProvider implements MailProvider {
  id = 'smtp';
  isConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.MAIL_FROM);
  }
  async send(to: string, subject: string, text: string): Promise<MailSendResult> {
    if (!this.isConfigured()) return { success: false, provider: this.id, blocked: true, error: 'SMTP not fully configured. No email was sent.' };
    // Lightweight SMTP send without extra deps: attempt via nodemailer if present, else BLOCKED with clear message.
    try {
      // @ts-ignore optional dependency
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
      } as any);
      const info = await transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, text });
      return { success: true, provider: this.id, messageId: info?.messageId };
    } catch (e: any) {
      const msg = e?.code === 'ERR_MODULE_NOT_FOUND' || String(e?.message||'').includes("Cannot find module 'nodemailer'")
        ? 'SMTP provider selected but nodemailer is not installed and no alternative mail transport is available. Install/configure a mail transport; no email was sent.'
        : (e?.message || 'Mail send failed');
      return { success: false, provider: this.id, blocked: msg.includes('No email was sent'), error: msg };
    }
  }
}

export function getMailProvider(): MailProvider {
  const p = (process.env.MAIL_PROVIDER || '').toLowerCase();
  if (p === 'smtp') return new SmtpMailProvider();
  return new UnconfiguredMailProvider();
}

export function mailStatus() {
  const provider = getMailProvider();
  return { provider: provider.id, configured: provider.isConfigured() };
}
