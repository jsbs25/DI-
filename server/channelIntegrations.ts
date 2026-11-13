/**
 * External channel/integration metadata and safe integration scaffolding.
 * IMPORTANT: We only model officially supported integrations.
 * - Personal WeChat/WhatsApp account takeover, scraping, or unofficial clients are NOT supported.
 */
export type IntegrationProvider = 'google' | 'wechat' | 'whatsapp' | 'telegram' | 'phone' | 'email';

export interface ChannelIntegrationInfo {
  id: IntegrationProvider;
  name: string;
  category: 'identity' | 'messaging';
  status: 'available' | 'config_required' | 'planned';
  official: boolean;
  capabilities: string[];
  limitations: string[];
  setupHint: string;
}

export function getChannelIntegrations(env: NodeJS.ProcessEnv = process.env): ChannelIntegrationInfo[] {
  const hasGoogle = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const hasWechat = Boolean(env.WECHAT_APP_ID && env.WECHAT_APP_SECRET);
  const hasWhatsApp = Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
  const hasTelegram = Boolean(env.TELEGRAM_BOT_TOKEN);

  return [
    {
      id: 'google',
      name: 'Google',
      category: 'identity',
      status: hasGoogle ? 'available' : 'config_required',
      official: true,
      capabilities: ['Sign in / account binding with Google (OAuth 2.0 / OpenID Connect)', 'Use verified Google identity for Earth One profile'],
      limitations: ['Does not import personal Gmail/Google Chat messages into Earth One chat'],
      setupHint: hasGoogle
        ? 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET configured.'
        : 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and APP_URL (OAuth callback: /api/auth/google/callback).'
    },
    {
      id: 'wechat',
      name: 'WeChat (微信)',
      category: 'identity',
      status: hasWechat ? 'available' : 'config_required',
      official: true,
      capabilities: ['Official website QR login / account binding via WeChat Open Platform (where approved)', 'Enterprise/Official Account messaging only via official APIs when configured'],
      limitations: ['Cannot log into or sync personal WeChat chats/contacts; unofficial clients and automation are not supported'],
      setupHint: hasWechat
        ? 'WECHAT_APP_ID / WECHAT_APP_SECRET configured.'
        : 'Set WECHAT_APP_ID and WECHAT_APP_SECRET from WeChat Open Platform (website app) for QR login binding.'
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      category: 'messaging',
      status: hasWhatsApp ? 'available' : 'config_required',
      official: true,
      capabilities: ['Business messaging via WhatsApp Business Platform (Cloud API) when configured', 'Webhook-based inbound/outbound business conversations'],
      limitations: ['Cannot access personal WhatsApp/WhatsApp Web accounts; subject to Meta policies, templates, 24h window, and approval'],
      setupHint: hasWhatsApp
        ? 'WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID configured.'
        : 'Set WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_VERIFY_TOKEN for Meta WhatsApp Cloud API.'
    },
    {
      id: 'telegram',
      name: 'Telegram',
      category: 'messaging',
      status: hasTelegram ? 'available' : 'config_required',
      official: true,
      capabilities: ['Telegram Bot messaging via official Bot API (webhook/polling bridge)', 'Map bot chats to Earth One conversations'],
      limitations: ['Bot accounts cannot read arbitrary personal chats; personal-account automation is not enabled'],
      setupHint: hasTelegram
        ? 'TELEGRAM_BOT_TOKEN configured.'
        : 'Set TELEGRAM_BOT_TOKEN from @BotFather to enable bot channel bridge.'
    },
    {
      id: 'phone',
      name: 'Phone (SMS)',
      category: 'identity',
      status: (process.env.SMS_PROVIDER && process.env.SMS_PROVIDER !== '') ? 'available' : 'config_required',
      official: true,
      capabilities: ['Phone number login/registration via SMS verification code (provider-pluggable)'],
      limitations: ['Requires a configured SMS provider (e.g. Twilio). Without configuration, SMS sending is BLOCKED and no fake codes are sent.'],
      setupHint: process.env.SMS_PROVIDER ? `SMS_PROVIDER=${process.env.SMS_PROVIDER}` : 'Set SMS_PROVIDER and provider credentials (e.g. TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM).'
    },
    {
      id: 'email',
      name: 'Email',
      category: 'identity',
      status: 'available',
      official: true,
      capabilities: ['Email + password login/registration', 'Password reset flow (email delivery requires mail provider; token flow supported)'],
      limitations: ['Transactional email delivery requires a configured mail provider; without it, email delivery is BLOCKED.'],
      setupHint: process.env.MAIL_PROVIDER ? `MAIL_PROVIDER=${process.env.MAIL_PROVIDER}` : 'Optional: configure MAIL_PROVIDER/SMTP settings for verification/reset emails.'
    }
  ];
}

export interface LinkedIdentity {
  provider: IntegrationProvider | 'phone' | 'email';
  providerUserId: string;
  displayName?: string;
  email?: string;
  avatar?: string;
  linkedAt: string;
}
