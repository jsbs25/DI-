import { resolve4, resolveMx } from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';

/**
 * Pluggable mail provider for transactional email (verification/reset).
 * Supports real zero-dependency Node TLS/STARTTLS SMTP (including QQ Mail & Gmail auto-detection).
 * IMPORTANT: No real email is sent without configured SMTP credentials.
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

export interface EmailDomainVerificationResult {
  ok: boolean;
  domain: string;
  providerLabel: string;
  mxVerified?: boolean;
  error?: string;
}

const DISPOSABLE_OR_FAKE_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'test.org',
  'localhost',
  'invalid',
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'tempmail.com',
  'temp-mail.org',
  '10minutemail.com',
  '10minutemail.net',
  'yopmail.com',
  'sharklasers.com',
  'trashmail.com',
  'dispostable.com',
  'fakeinbox.com',
  'maildrop.cc',
  'getnada.com',
  'mohmal.com',
]);

const KNOWN_MAJOR_PROVIDERS: Record<string, string> = {
  'gmail.com': 'Google Gmail',
  'googlemail.com': 'Google Gmail',
  'qq.com': 'QQ 邮箱',
  'vip.qq.com': 'QQ 邮箱',
  'foxmail.com': 'QQ Foxmail',
  '163.com': '网易 163 邮箱',
  '126.com': '网易 126 邮箱',
  'yeah.net': '网易 Yeah 邮箱',
  'outlook.com': 'Microsoft Outlook',
  'hotmail.com': 'Microsoft Hotmail',
  'live.com': 'Microsoft Live',
  'msn.com': 'Microsoft MSN',
  'icloud.com': 'Apple iCloud',
  'me.com': 'Apple iCloud',
  'mac.com': 'Apple iCloud',
  'yahoo.com': 'Yahoo Mail',
  'proton.me': 'Proton Mail',
  'protonmail.com': 'Proton Mail',
  'sina.com': '新浪邮箱',
  'aliyun.com': '阿里云邮箱',
};

const mxCache = new Map<string, { ok: boolean; expiresAt: number }>();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DNS_TIMEOUT')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export function detectEmailProviderLabel(email: string): { domain: string; providerLabel: string } {
  const clean = String(email || '').trim().toLowerCase();
  const atIdx = clean.lastIndexOf('@');
  const domain = atIdx >= 0 ? clean.slice(atIdx + 1) : '';
  const providerLabel = KNOWN_MAJOR_PROVIDERS[domain] || (domain ? `${domain}` : '未知邮箱');
  return { domain, providerLabel };
}

/**
 * Verifies email format, blocks fake/disposable domains, and checks real DNS MX records.
 */
export async function verifyEmailDomainReal(email: string): Promise<EmailDomainVerificationResult> {
  const clean = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean) || clean.length > 254) {
    return {
      ok: false,
      domain: '',
      providerLabel: '',
      error: '请输入格式正确的真实邮箱地址（支持 Gmail、QQ 邮箱等）。',
    };
  }

  const { domain, providerLabel } = detectEmailProviderLabel(clean);
  if (!domain || DISPOSABLE_OR_FAKE_DOMAINS.has(domain) || domain.endsWith('.local') || domain.endsWith('.invalid')) {
    return {
      ok: false,
      domain,
      providerLabel,
      error: '不允许使用临时或测试邮箱域名，请使用真实的 Gmail、QQ 邮箱或其他有效邮箱。',
    };
  }

  const cached = mxCache.get(domain);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ok
      ? { ok: true, domain, providerLabel, mxVerified: true }
      : { ok: false, domain, providerLabel, mxVerified: false, error: '该邮箱域名无法接收邮件，请检查邮箱拼写或更换 Gmail / QQ 邮箱。' };
  }

  try {
    const records = await withTimeout(resolveMx(domain), 2500);
    if (Array.isArray(records) && records.length > 0 && records.some((r) => Boolean(r.exchange))) {
      mxCache.set(domain, { ok: true, expiresAt: Date.now() + 10 * 60 * 1000 });
      return { ok: true, domain, providerLabel, mxVerified: true };
    }
    // RFC 5321 fallback: domain with A record can still receive mail
    const aRecords = await withTimeout(resolve4(domain), 2000).catch(() => []);
    if (Array.isArray(aRecords) && aRecords.length > 0) {
      mxCache.set(domain, { ok: true, expiresAt: Date.now() + 10 * 60 * 1000 });
      return { ok: true, domain, providerLabel, mxVerified: true };
    }
    mxCache.set(domain, { ok: false, expiresAt: Date.now() + 2 * 60 * 1000 });
    return {
      ok: false,
      domain,
      providerLabel,
      mxVerified: false,
      error: '该邮箱域名没有有效的邮件接收服务器（MX 记录），请使用真实邮箱。',
    };
  } catch (err: any) {
    const code = String(err?.code || err?.message || '');
    if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'EBADNAME') {
      mxCache.set(domain, { ok: false, expiresAt: Date.now() + 2 * 60 * 1000 });
      return {
        ok: false,
        domain,
        providerLabel,
        mxVerified: false,
        error: '该邮箱域名不存在或无法接收邮件，请检查拼写或使用真实的 Gmail / QQ 邮箱。',
      };
    }
    // Transient DNS timeout / restricted sandbox: allow well-known real providers gracefully
    if (KNOWN_MAJOR_PROVIDERS[domain]) {
      return { ok: true, domain, providerLabel, mxVerified: false };
    }
    return { ok: true, domain, providerLabel, mxVerified: false };
  }
}

interface ResolvedSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

function resolveSmtpConfig(): ResolvedSmtpConfig | null {
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  let host = String(process.env.SMTP_HOST || '').trim();
  let port = Number(process.env.SMTP_PORT || 0);
  const secureEnv = String(process.env.SMTP_SECURE || '').trim().toLowerCase();
  let secure = secureEnv === 'true' || secureEnv === '1';

  // Auto-detect QQ Mail / Gmail / 163 / Outlook SMTP hosts when user/pass are supplied
  if (!host && user) {
    const lowerUser = user.toLowerCase();
    if (lowerUser.endsWith('@qq.com') || lowerUser.endsWith('@foxmail.com') || lowerUser.endsWith('@vip.qq.com')) {
      host = 'smtp.qq.com';
      if (!port) port = 465;
      if (!secureEnv) secure = true;
    } else if (lowerUser.endsWith('@gmail.com') || lowerUser.endsWith('@googlemail.com')) {
      host = 'smtp.gmail.com';
      if (!port) port = 465;
      if (!secureEnv) secure = true;
    } else if (lowerUser.endsWith('@163.com')) {
      host = 'smtp.163.com';
      if (!port) port = 465;
      if (!secureEnv) secure = true;
    } else if (lowerUser.endsWith('@outlook.com') || lowerUser.endsWith('@hotmail.com')) {
      host = 'smtp-mail.outlook.com';
      if (!port) port = 587;
      if (!secureEnv) secure = false;
    }
  }

  if (!port) port = secure ? 465 : 587;
  if (!secureEnv && port === 465) secure = true;

  const from = String(process.env.MAIL_FROM || user || '').trim();
  if (!host || !port || !from) return null;
  // Require credentials when connecting to public SMTP hosts
  if ((host.includes('qq.com') || host.includes('gmail.com') || host.includes('163.com') || host.includes('outlook.com')) && (!user || !pass)) {
    return null;
  }

  return { host, port, secure, user, pass, from };
}

function encodeMimeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function escapeDotStuffing(body: string): string {
  return body
    .replace(/\r?\n/g, '\r\n')
    .replace(/^\./gm, '..');
}

async function sendViaNativeSmtp(
  cfg: ResolvedSmtpConfig,
  to: string,
  subject: string,
  text: string,
  html?: string
): Promise<{ messageId: string }> {
  return new Promise((resolve, reject) => {
    let socket: net.Socket | tls.TLSSocket = cfg.secure
      ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host, rejectUnauthorized: true })
      : net.createConnection({ host: cfg.host, port: cfg.port });

    socket.setTimeout(12_000);

    let buffer = '';
    let settled = false;
    let currentResolver: ((resp: { code: number; lines: string[] }) => void) | null = null;
    let currentRejecter: ((err: Error) => void) | null = null;
    let pendingLines: string[] = [];

    const finishError = (err: Error) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {}
      if (currentRejecter) {
        const r = currentRejecter;
        currentResolver = null;
        currentRejecter = null;
        r(err);
      } else {
        reject(err);
      }
    };

    const attachSocketHandlers = (sock: net.Socket | tls.TLSSocket) => {
      sock.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let idx = buffer.indexOf('\n');
        while (idx !== -1) {
          const line = buffer.slice(0, idx).replace(/\r$/, '');
          buffer = buffer.slice(idx + 1);
          idx = buffer.indexOf('\n');
          if (!line) continue;
          pendingLines.push(line);
          const match = /^(\d{3})([ -])/.exec(line);
          if (match && match[2] === ' ') {
            const code = Number(match[1]);
            const lines = pendingLines;
            pendingLines = [];
            if (currentResolver) {
              const r = currentResolver;
              currentResolver = null;
              currentRejecter = null;
              r({ code, lines });
            }
          }
        }
      });

      sock.on('error', (err) => finishError(err instanceof Error ? err : new Error(String(err))));
      sock.on('timeout', () => finishError(new Error('SMTP connection timed out')));
      sock.on('close', () => {
        if (!settled) finishError(new Error('SMTP connection closed unexpectedly'));
      });
    };

    attachSocketHandlers(socket);

    const readResponse = () =>
      new Promise<{ code: number; lines: string[] }>((res, rej) => {
        currentResolver = res;
        currentRejecter = rej;
      });

    const sendCommand = async (cmd: string, expectedCodes: number[]) => {
      const respPromise = readResponse();
      socket.write(`${cmd}\r\n`);
      const resp = await respPromise;
      if (!expectedCodes.includes(resp.code)) {
        throw new Error(`SMTP rejected command (${resp.code}): ${resp.lines.join(' | ')}`);
      }
      return resp;
    };

    (async () => {
      const greeting = await readResponse();
      if (greeting.code !== 220) {
        throw new Error(`SMTP greeting failed (${greeting.code}): ${greeting.lines.join(' | ')}`);
      }

      const ehlo = await sendCommand('EHLO earth-one.local', [250]);

      if (!cfg.secure && ehlo.lines.some((l) => l.toUpperCase().includes('STARTTLS'))) {
        await sendCommand('STARTTLS', [220]);
        socket.removeAllListeners('data');
        socket.removeAllListeners('error');
        socket.removeAllListeners('timeout');
        socket.removeAllListeners('close');
        socket = tls.connect({
          socket,
          servername: cfg.host,
          rejectUnauthorized: true,
        });
        socket.setTimeout(12_000);
        attachSocketHandlers(socket);
        await sendCommand('EHLO earth-one.local', [250]);
      }

      if (cfg.user && cfg.pass) {
        await sendCommand('AUTH LOGIN', [334]);
        await sendCommand(Buffer.from(cfg.user, 'utf8').toString('base64'), [334]);
        await sendCommand(Buffer.from(cfg.pass, 'utf8').toString('base64'), [235]);
      }

      const envelopeFromMatch = /<([^>]+)>/.exec(cfg.from);
      const envelopeFrom = envelopeFromMatch ? envelopeFromMatch[1] : cfg.from;

      await sendCommand(`MAIL FROM:<${envelopeFrom}>`, [250]);
      await sendCommand(`RCPT TO:<${to}>`, [250, 251]);
      await sendCommand('DATA', [354]);

      const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2, 10)}@earth-one.local>`;
      const dateHeader = new Date().toUTCString();
      const boundary = `----earth_one_${Date.now().toString(36)}`;

      const headers = [
        `From: ${cfg.from}`,
        `To: <${to}>`,
        `Subject: ${encodeMimeHeader(subject)}`,
        `Date: ${dateHeader}`,
        `Message-ID: ${messageId}`,
        'MIME-Version: 1.0',
      ];

      let payload = '';
      if (html) {
        headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
        payload = [
          ...headers,
          '',
          `--${boundary}`,
          'Content-Type: text/plain; charset=UTF-8',
          'Content-Transfer-Encoding: base64',
          '',
          Buffer.from(text, 'utf8').toString('base64'),
          `--${boundary}`,
          'Content-Type: text/html; charset=UTF-8',
          'Content-Transfer-Encoding: base64',
          '',
          Buffer.from(html, 'utf8').toString('base64'),
          `--${boundary}--`,
          '',
        ].join('\r\n');
      } else {
        headers.push('Content-Type: text/plain; charset=UTF-8');
        headers.push('Content-Transfer-Encoding: base64');
        payload = [...headers, '', Buffer.from(text, 'utf8').toString('base64'), ''].join('\r\n');
      }

      const dataRespPromise = readResponse();
      socket.write(`${escapeDotStuffing(payload)}\r\n.\r\n`);
      const dataResp = await dataRespPromise;
      if (dataResp.code !== 250) {
        throw new Error(`SMTP DATA rejected (${dataResp.code}): ${dataResp.lines.join(' | ')}`);
      }

      try {
        await sendCommand('QUIT', [221, 250]);
      } catch {
        // Ignore non-fatal QUIT error after message acceptance
      }

      settled = true;
      socket.end();
      resolve({ messageId });
    })().catch((err) => {
      finishError(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

class UnconfiguredMailProvider implements MailProvider {
  id = 'unconfigured';
  isConfigured() {
    return false;
  }
  async send(): Promise<MailSendResult> {
    return {
      success: false,
      provider: this.id,
      blocked: true,
      error: '邮件服务尚未配置（可配置 QQ 邮箱或 Gmail 的 SMTP_USER / SMTP_PASS 授权码），未发送邮件。',
    };
  }
}

class SmtpMailProvider implements MailProvider {
  id = 'smtp';
  isConfigured() {
    return Boolean(resolveSmtpConfig());
  }
  async send(to: string, subject: string, text: string, html?: string): Promise<MailSendResult> {
    const cfg = resolveSmtpConfig();
    if (!cfg) {
      return {
        success: false,
        provider: this.id,
        blocked: true,
        error: 'SMTP 邮件凭据未配置完整（需要 SMTP_USER 与 SMTP_PASS，支持自动识别 smtp.qq.com 与 smtp.gmail.com），未发送邮件。',
      };
    }

    try {
      const { messageId } = await sendViaNativeSmtp(cfg, to, subject, text, html);
      return { success: true, provider: this.id, messageId };
    } catch (e: any) {
      return {
        success: false,
        provider: this.id,
        blocked: false,
        error: e?.message || 'SMTP 邮件发送失败',
      };
    }
  }
}

export function getMailProvider(): MailProvider {
  const p = (process.env.MAIL_PROVIDER || '').toLowerCase();
  if (p === 'smtp' || resolveSmtpConfig()) return new SmtpMailProvider();
  return new UnconfiguredMailProvider();
}

export function mailStatus() {
  const provider = getMailProvider();
  const cfg = resolveSmtpConfig();
  return {
    provider: provider.id,
    configured: provider.isConfigured(),
    smtpHostHint: cfg ? `${cfg.host}:${cfg.port}` : null,
    supportsGmailAndQQ: true,
  };
}
