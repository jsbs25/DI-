/**
 * Pluggable SMS provider interface for OTP delivery.
 * IMPORTANT: No real SMS is sent without a configured provider/credentials.
 * Configure via env:
 *   SMS_PROVIDER=twilio (example) + provider-specific keys, or leave unset for BLOCKED.
 * This module never fabricates successful delivery.
 */
export interface SmsSendResult {
  success: boolean;
  provider: string;
  blocked?: boolean;
  messageId?: string;
  error?: string;
}

export interface SmsProvider {
  id: string;
  isConfigured(): boolean;
  send(toE164: string, text: string): Promise<SmsSendResult>;
}

class UnconfiguredSmsProvider implements SmsProvider {
  id = 'unconfigured';
  isConfigured() { return false; }
  async send(_to: string, _text: string): Promise<SmsSendResult> {
    return { success: false, provider: this.id, blocked: true, error: 'SMS provider not configured. Set SMS_PROVIDER and required credentials (e.g. TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM). No SMS was sent.' };
  }
}

class TwilioSmsProvider implements SmsProvider {
  id = 'twilio';
  isConfigured() {
    return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
  }
  async send(toE164: string, text: string): Promise<SmsSendResult> {
    if (!this.isConfigured()) return { success: false, provider: this.id, blocked: true, error: 'Twilio SMS not fully configured (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM). No SMS was sent.' };
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID!;
      const token = process.env.TWILIO_AUTH_TOKEN!;
      const from = process.env.TWILIO_FROM!;
      const body = new URLSearchParams({ To: toE164, From: from, Body: text });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, provider: this.id, error: data?.message || `Twilio error (${res.status})` };
      return { success: true, provider: this.id, messageId: data?.sid };
    } catch (e: any) {
      return { success: false, provider: this.id, error: e?.message || 'SMS send failed' };
    }
  }
}

export function getSmsProvider(): SmsProvider {
  const p = (process.env.SMS_PROVIDER || '').toLowerCase();
  if (p === 'twilio') return new TwilioSmsProvider();
  return new UnconfiguredSmsProvider();
}

export function smsStatus() {
  const provider = getSmsProvider();
  return { provider: provider.id, configured: provider.isConfigured() };
}
