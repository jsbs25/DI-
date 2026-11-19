import React, { useEffect, useState } from 'react';
import type { Language, User, ChannelIntegration } from '../../types/index.ts';
import { Lock, Mail, Phone, X, ArrowRight, ShieldCheck, Eye, EyeOff, KeyRound, AlertCircle } from 'lucide-react';
import { ParadiseBrandEmblem } from '../brand/ParadiseBrandEmblem.tsx';
import { unlockSteadyVoiceAudio } from '../../utils/steadyVoicePlayer.ts';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: User, token: string, isNewRegistration: boolean) => void;
  lang: Language;
}

type Mode = 'login' | 'register' | 'phone' | 'forgot' | 'reset';

const COUNTRIES = [
  { code: '+86', label: 'CN +86' }, { code: '+962', label: 'JO +962' }, { code: '+1', label: 'US/CA +1' },
  { code: '+44', label: 'UK +44' }, { code: '+81', label: 'JP +81' }, { code: '+82', label: 'KR +82' },
  { code: '+33', label: 'FR +33' }, { code: '+49', label: 'DE +49' }, { code: '+971', label: 'AE +971' },
  { code: '+966', label: 'SA +966' }, { code: '+20', label: 'EG +20' }, { code: '+7', label: 'RU +7' },
  { code: '+61', label: 'AU +61' }, { code: '+91', label: 'IN +91' },
];

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthSuccess, lang }) => {
  const [mode, setMode] = useState<Mode>('login');
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [integrations, setIntegrations] = useState<ChannelIntegration[]>([]);
  const [smsStatus, setSmsStatus] = useState<any>(null);
  const [mailStatus, setMailStatus] = useState<any>(null);

  // phone
  const [dial, setDial] = useState('+86');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneChallengeId, setPhoneChallengeId] = useState<string | null>(null);
  const [, setPhoneSent] = useState(false);

  // forgot/reset
  const [resetEmail, setResetEmail] = useState('');
  const [resetChallengeId, setResetChallengeId] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/integrations').then(r => r.json()).then(d => { if (d.success) { setIntegrations(d.integrations || []); setSmsStatus(d.sms); setMailStatus(d.mail); } }).catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;
  const google = integrations.find(i => i.id === 'google');
  const wechat = integrations.find(i => i.id === 'wechat');
  const isZh = lang === 'zh';

  const fullPhone = () => `${dial}${phoneLocal.replace(/[^\d]/g, '')}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    unlockSteadyVoiceAudio();
    setErrorMsg(null); setInfoMsg(null); setIsLoading(true);
    try {
      if (mode === 'login') {
        const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: emailOrUsername.trim(), password }) });
        const data = await res.json();
        if (data.success && data.user) { onAuthSuccess(data.user, data.token || '', !data.user.hasCompletedOnboarding); onClose(); }
        else setErrorMsg(data.error || 'Authentication failed.');
      } else if (mode === 'register') {
        const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: registerEmail.trim(), password, displayName: displayName.trim() || undefined, username: registerUsername.trim() || undefined }) });
        const data = await res.json();
        if (data.success && data.user) { onAuthSuccess(data.user, data.token || '', true); onClose(); }
        else setErrorMsg(data.error || 'Registration failed.');
      } else if (mode === 'phone') {
        if (!phoneChallengeId) { setErrorMsg('请先获取验证码 / Request code first.'); }
        else {
          const res = await fetch('/api/auth/phone/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: fullPhone(), challengeId: phoneChallengeId, code: phoneCode.trim() }) });
          const data = await res.json();
          if (data.success && data.user) { onAuthSuccess(data.user, data.token || '', !data.user.hasCompletedOnboarding); onClose(); }
          else setErrorMsg(data.error || 'Verification failed.');
        }
      } else if (mode === 'forgot') {
        const res = await fetch('/api/auth/password/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: resetEmail.trim() }) });
        const data = await res.json();
        if (data.success) { setResetChallengeId(data.challengeId || null); setInfoMsg(data.message || 'If configured, reset code sent.'); if (data.challengeId) setMode('reset'); }
        else setErrorMsg(data.error || 'Request failed.');
      } else if (mode === 'reset') {
        const res = await fetch('/api/auth/password/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: resetEmail.trim(), challengeId: resetChallengeId, code: resetCode.trim(), newPassword }) });
        const data = await res.json();
        if (data.success) { setInfoMsg('Password reset. Please sign in.'); setMode('login'); setPassword(''); }
        else setErrorMsg(data.error || 'Reset failed.');
      }
    } catch { setErrorMsg('Network error.'); }
    finally { setIsLoading(false); }
  };

  const sendPhoneCode = async () => {
    setErrorMsg(null); setInfoMsg(null); setIsLoading(true);
    try {
      const res = await fetch('/api/auth/phone/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: fullPhone() }) });
      const data = await res.json();
      if (data.success) { setPhoneChallengeId(data.challengeId); setPhoneSent(true); setInfoMsg('验证码已发送 / Code sent (if provider delivered).'); }
      else setErrorMsg(data.error || 'Failed to send code.');
    } catch { setErrorMsg('Network error.'); }
    finally { setIsLoading(false); }
  };

  const title =
    mode === 'login'
      ? isZh ? '进入 EARTH ONE' : 'Sign in to EARTH ONE'
      : mode === 'register'
        ? isZh ? '加入天堂花园世界' : 'Join Paradise World'
        : mode === 'phone'
          ? isZh ? '手机号验证登录' : 'Phone Login'
          : mode === 'forgot'
            ? isZh ? '找回密码' : 'Forgot Password'
            : isZh ? '重置密码' : 'Reset Password';

  const inputCls =
    'w-full py-2.5 rounded-xl bg-[#f3eee4]/80 dark:bg-[#0c141d]/75 border border-[#244e41]/16 dark:border-[#d6b77f]/18 text-[#1d2e26] dark:text-[#f5f1e8] placeholder:text-[#7c8e84] dark:placeholder:text-[#73858f] focus:outline-none focus:border-[#247864] dark:focus:border-[#d6b77f] transition-colors';

  return (
    <div className="fixed inset-0 z-50 bg-[#0c171d]/62 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#faf7f0]/96 dark:bg-[#121c27]/96 border border-[#244e41]/18 dark:border-[#d6b77f]/20 rounded-[28px] overflow-hidden shadow-[0_24px_80px_rgba(12,24,18,0.42)] backdrop-blur-xl relative space-y-4 p-6 sm:p-7 animate-in fade-in duration-200 max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl border border-[#244e41]/14 dark:border-white/12 bg-[#efe9dc]/70 dark:bg-white/[0.05] text-[#53685d] dark:text-[#98a8b0] hover:text-[#1d2e26] dark:hover:text-[#f5f1e8] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center space-y-2 pt-1">
          <span className="dark:hidden">
            <ParadiseBrandEmblem variant="medallion" size={56} surface="light" />
          </span>
          <span className="hidden dark:inline-flex">
            <ParadiseBrandEmblem variant="medallion" size={56} surface="dark" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-[#1d2e26] dark:text-[#f5f1e8] font-serif">{title}</h2>
            <p className="text-[11px] text-[#5e7368] dark:text-[#96a6ae] mt-0.5 tracking-[0.2em] uppercase">
              EARTH ONE · PARADISE WORLD
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { window.location.href = '/api/auth/google/start'; }}
            disabled={google?.status !== 'available'}
            className={`py-2.5 rounded-xl border text-[11px] font-semibold flex items-center justify-center gap-2 transition-colors ${
              google?.status === 'available'
                ? 'bg-white text-[#1d2e26] border-[#244e41]/18 hover:bg-[#f5f0e6] cursor-pointer'
                : 'bg-[#efe9dc]/60 dark:bg-[#0d151f] text-[#83948b] dark:text-[#6e808a] border-[#244e41]/10 dark:border-white/10 opacity-70'
            }`}
          >
            <span>Google</span><span className="hidden sm:inline">OAuth</span>
          </button>
          <button
            type="button"
            onClick={() => { window.location.href = '/api/auth/wechat/start'; }}
            disabled={wechat?.status !== 'available'}
            className={`py-2.5 rounded-xl border text-[11px] font-semibold transition-colors ${
              wechat?.status === 'available'
                ? 'bg-[#247864] text-[#faf7f0] border-[#247864] hover:bg-[#1d6352] cursor-pointer'
                : 'bg-[#efe9dc]/60 dark:bg-[#0d151f] text-[#83948b] dark:text-[#6e808a] border-[#244e41]/10 dark:border-white/10 opacity-70'
            }`}
          >
            WeChat 微信
          </button>
        </div>

        <div className="grid grid-cols-3 p-1 rounded-xl bg-[#efe9dc]/80 dark:bg-[#0c141d]/80 border border-[#244e41]/12 dark:border-white/10 text-[11px] font-medium">
          <button
            type="button"
            onClick={() => { setMode('login'); setErrorMsg(null); setInfoMsg(null); }}
            className={`py-2 rounded-lg transition-colors cursor-pointer ${
              mode === 'login'
                ? 'bg-[#244e41] dark:bg-[#d6b77f]/18 text-[#faf7f0] dark:text-[#f5ead4] border border-[#244e41] dark:border-[#d6b77f]/35 font-semibold'
                : 'text-[#5a6f64] dark:text-[#8ea0a8]'
            }`}
          >
            {isZh ? '邮箱登录' : 'Email'}
          </button>
          <button
            type="button"
            onClick={() => { setMode('phone'); setErrorMsg(null); setInfoMsg(null); }}
            className={`py-2 rounded-lg transition-colors cursor-pointer ${
              mode === 'phone'
                ? 'bg-[#244e41] dark:bg-[#d6b77f]/18 text-[#faf7f0] dark:text-[#f5ead4] border border-[#244e41] dark:border-[#d6b77f]/35 font-semibold'
                : 'text-[#5a6f64] dark:text-[#8ea0a8]'
            }`}
          >
            {isZh ? '手机登录' : 'Phone'}
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setErrorMsg(null); setInfoMsg(null); }}
            className={`py-2 rounded-lg transition-colors cursor-pointer ${
              mode === 'register'
                ? 'bg-[#244e41] dark:bg-[#d6b77f]/18 text-[#faf7f0] dark:text-[#f5ead4] border border-[#244e41] dark:border-[#d6b77f]/35 font-semibold'
                : 'text-[#5a6f64] dark:text-[#8ea0a8]'
            }`}
          >
            {isZh ? '注册账号' : 'Register'}
          </button>
        </div>

        {errorMsg && <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/75 border border-rose-200 dark:border-rose-800/80 text-rose-700 dark:text-rose-300 text-xs flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{errorMsg}</span></div>}
        {infoMsg && <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-300 text-xs">{infoMsg}</div>}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {mode === 'login' && (
            <>
              <div>
                <label className="block text-[#53685d] dark:text-[#96a6ae] mb-1">{isZh ? '邮箱或用户名' : 'Email or Username'}</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-2.5 text-[#7a8e83]" />
                  <input type="text" required value={emailOrUsername} onChange={e => setEmailOrUsername(e.target.value)} placeholder={isZh ? '输入邮箱或用户名' : 'email or username'} className={`${inputCls} pl-9 pr-3`} />
                </div>
              </div>
              <div>
                <label className="block text-[#53685d] dark:text-[#96a6ae] mb-1">{isZh ? '密码' : 'Password'}</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-2.5 text-[#7a8e83]" />
                  <input type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} className={`${inputCls} pl-9 pr-9`} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-[#7a8e83] cursor-pointer">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                </div>
              </div>
              <button type="button" onClick={() => { setMode('forgot'); setErrorMsg(null); }} className="text-[#247864] dark:text-[#d6b77f] text-[11px] hover:underline cursor-pointer">
                {isZh ? '忘记密码？' : 'Forgot password?'}
              </button>
            </>
          )}

          {mode === 'register' && (
            <>
              <div>
                <label className="block text-[#53685d] dark:text-[#96a6ae] mb-1">{isZh ? '邮箱' : 'Email'}</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-2.5 text-[#7a8e83]" />
                  <input type="email" required value={registerEmail} onChange={e => setRegisterEmail(e.target.value)} className={`${inputCls} pl-9 pr-3`} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#53685d] dark:text-[#96a6ae] mb-1">{isZh ? '昵称' : 'Display Name'}</label>
                  <input required value={displayName} onChange={e => setDisplayName(e.target.value)} className={`${inputCls} px-3`} />
                </div>
                <div>
                  <label className="block text-[#53685d] dark:text-[#96a6ae] mb-1">{isZh ? '用户名' : 'Username'}</label>
                  <input required maxLength={40} value={registerUsername} onChange={e => setRegisterUsername(e.target.value.replace(/[\r\n\t\u0000-\u001F\u007F]/g, ''))} placeholder="Username" className={`${inputCls} px-3`} />
                </div>
              </div>
              <div>
                <label className="block text-[#53685d] dark:text-[#96a6ae] mb-1">{isZh ? '密码（至少 6 位）' : 'Password (min 6)'}</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-2.5 text-[#7a8e83]" />
                  <input type={showPassword ? 'text' : 'password'} required minLength={6} value={password} onChange={e => setPassword(e.target.value)} className={`${inputCls} pl-9 pr-9`} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-[#7a8e83] cursor-pointer">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                </div>
              </div>
            </>
          )}

          {mode === 'phone' && (
            <>
              <p className="text-[11px] text-[#5e7368] dark:text-[#96a6ae]">SMS 验证码登录/注册（依赖真实短信服务配置）。</p>
              <div className="flex gap-2">
                <select value={dial} onChange={e => setDial(e.target.value)} className={`w-28 px-2 text-xs ${inputCls}`}>{COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select>
                <div className="relative flex-1"><Phone className="w-4 h-4 absolute left-3 top-2.5 text-[#7a8e83]" /><input required value={phoneLocal} onChange={e => setPhoneLocal(e.target.value)} placeholder="Phone number" className={`${inputCls} pl-9 pr-3`} /></div>
              </div>
              <div className="flex gap-2">
                <input value={phoneCode} onChange={e => setPhoneCode(e.target.value)} placeholder="SMS code" className={`flex-1 px-3 ${inputCls}`} />
                <button type="button" onClick={sendPhoneCode} disabled={isLoading} className="px-3 py-2 rounded-xl bg-[#efe9dc] dark:bg-white/[0.06] border border-[#244e41]/16 dark:border-white/12 text-[#1d2e26] dark:text-[#f5f1e8] text-[11px] font-semibold disabled:opacity-40 cursor-pointer">
                  {isZh ? '发送验证码' : 'Send Code'}
                </button>
              </div>
              {smsStatus && !smsStatus.configured && <p className="text-[10px] text-amber-700 dark:text-amber-300">SMS 服务未配置（需设置 SMS_PROVIDER 与凭证）。</p>}
            </>
          )}

          {mode === 'forgot' && (
            <>
              <p className="text-[11px] text-[#5e7368] dark:text-[#96a6ae]">{isZh ? '输入邮箱获取重置验证码（需已配置邮件服务）。' : 'Enter your email to receive a reset code.'}</p>
              <div className="relative"><Mail className="w-4 h-4 absolute left-3 top-2.5 text-[#7a8e83]" /><input type="email" required value={resetEmail} onChange={e => setResetEmail(e.target.value)} className={`${inputCls} pl-9 pr-3`} /></div>
              {mailStatus && !mailStatus.configured && <p className="text-[10px] text-amber-700 dark:text-amber-300">邮件服务尚未配置。</p>}
            </>
          )}

          {mode === 'reset' && (
            <>
              <div><label className="block text-[#53685d] dark:text-[#96a6ae] mb-1">Email</label><input type="email" required value={resetEmail} onChange={e => setResetEmail(e.target.value)} className={`${inputCls} px-3`} /></div>
              <div><label className="block text-[#53685d] dark:text-[#96a6ae] mb-1">Reset Code</label><div className="relative"><KeyRound className="w-4 h-4 absolute left-3 top-2.5 text-[#7a8e83]" /><input required value={resetCode} onChange={e => setResetCode(e.target.value)} className={`${inputCls} pl-9 pr-3`} /></div></div>
              <div><label className="block text-[#53685d] dark:text-[#96a6ae] mb-1">New Password (min 6)</label><input type="password" required minLength={6} value={newPassword} onChange={e => setNewPassword(e.target.value)} className={`${inputCls} px-3`} /></div>
            </>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-xl bg-[#244e41] hover:bg-[#1c3f34] dark:bg-[#e5d9be] dark:hover:bg-[#f0e6d0] disabled:opacity-40 text-[#faf7f0] dark:text-[#141e28] font-semibold text-xs flex items-center justify-center gap-1.5 mt-1 shadow-md transition-colors cursor-pointer"
          >
            <span>
              {isLoading
                ? '...'
                : mode === 'login'
                  ? isZh ? '进入天堂花园' : 'Sign In'
                  : mode === 'register'
                    ? isZh ? '创建账号' : 'Register'
                    : mode === 'phone'
                      ? isZh ? '验证并进入' : 'Verify & Sign In'
                      : mode === 'forgot'
                        ? isZh ? '发送重置码' : 'Send Reset Code'
                        : isZh ? '确认重置' : 'Reset Password'}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        {(mode === 'forgot' || mode === 'reset') && (
          <button onClick={() => setMode('login')} className="text-[11px] text-[#5a6f64] dark:text-[#96a6ae] hover:text-[#1d2e26] dark:hover:text-[#f5f1e8] cursor-pointer">
            {isZh ? '返回登录' : 'Back to sign in'}
          </button>
        )}

        <div className="text-center text-[11px] text-[#667a70] dark:text-[#8698a1] flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#247864] dark:text-[#d6b77f]" />
          <span>{isZh ? '服务端加密鉴权 · 隐私安全保护' : 'Server-side encrypted auth · Privacy first'}</span>
        </div>
      </div>
    </div>
  );
};

