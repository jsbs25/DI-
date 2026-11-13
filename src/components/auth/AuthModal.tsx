import React, { useEffect, useState } from 'react';
import type { Language, User, ChannelIntegration } from '../../types/index.ts';
import { Globe2, Lock, Mail, Phone, X, ArrowRight, ShieldCheck, Eye, EyeOff, KeyRound, AlertCircle } from 'lucide-react';

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
  const [phoneSent, setPhoneSent] = useState(false);

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

  const fullPhone = () => `${dial}${phoneLocal.replace(/[^\d]/g, '')}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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


  const title = mode === 'login' ? 'Sign in to ONE' : mode === 'register' ? 'Join ONE' : mode === 'phone' ? 'Phone Login / 手机登录' : mode === 'forgot' ? 'Forgot Password' : 'Reset Password';

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(5,7,11,0.78)] backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[rgba(12,16,23,0.82)] border border-white/10 rounded-[28px] overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.4)] backdrop-blur-xl relative space-y-4 p-6 sm:p-7 animate-in fade-in duration-200 max-h-[92vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-5 right-5 p-2 rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08]"><X className="w-4 h-4" /></button>
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 p-0.5 mx-auto"><div className="w-full h-full bg-[rgba(8,11,16,0.9)] rounded-[14px] flex items-center justify-center"><Globe2 className="w-6 h-6 text-cyan-300" /></div></div>
          <div><h2 className="text-xl font-bold text-slate-100 font-serif">{title}</h2><p className="text-xs text-slate-400 mt-0.5 tracking-wide">ONE WORLD · INFINITE POSSIBILITIES</p></div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { window.location.href = '/api/auth/google/start'; }} disabled={google?.status !== 'available'}
            className={`py-2.5 rounded-xl border text-[11px] font-semibold flex items-center justify-center gap-2 ${google?.status === 'available' ? 'bg-white text-slate-900 border-white hover:bg-slate-100' : 'bg-slate-950 text-slate-400 border-slate-700 opacity-70'}`}>
            <span>Google</span><span className="hidden sm:inline">OAuth</span>
          </button>
          <button type="button" onClick={() => { window.location.href = '/api/auth/wechat/start'; }} disabled={wechat?.status !== 'available'}
            className={`py-2.5 rounded-xl border text-[11px] font-semibold ${wechat?.status === 'available' ? 'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500' : 'bg-slate-950 text-slate-400 border-slate-700 opacity-70'}`}>
            WeChat 微信
          </button>
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">官方接入：未配置时显示不可用且不伪造成功。微信/WhatsApp 不支持个人聊天同步。SMS/邮件投递依赖外部配置（未配置将 BLOCKED）。</p>

        <div className="grid grid-cols-3 p-1 rounded-xl bg-black/20 border border-white/10 text-[11px] font-medium">
          <button type="button" onClick={() => { setMode('login'); setErrorMsg(null); setInfoMsg(null); }} className={`py-2 rounded-lg ${mode === 'login' ? 'bg-cyan-400/15 text-cyan-100 border border-cyan-400/30 font-semibold' : 'text-slate-400'}`}>Email</button>
          <button type="button" onClick={() => { setMode('phone'); setErrorMsg(null); setInfoMsg(null); }} className={`py-2 rounded-lg ${mode === 'phone' ? 'bg-cyan-400/15 text-cyan-100 border border-cyan-400/30 font-semibold' : 'text-slate-400'}`}>Phone</button>
          <button type="button" onClick={() => { setMode('register'); setErrorMsg(null); setInfoMsg(null); }} className={`py-2 rounded-lg ${mode === 'register' ? 'bg-cyan-400/15 text-cyan-100 border border-cyan-400/30 font-semibold' : 'text-slate-400'}`}>Register</button>
        </div>

        {errorMsg && <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-300 text-xs flex gap-2"><AlertCircle className="w-4 h-4 shrink-0"/><span>{errorMsg}</span></div>}
        {infoMsg && <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/70 text-emerald-300 text-xs">{infoMsg}</div>}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {mode === 'login' && (
            <>
              <div><label className="block text-slate-400 mb-1">Email or Username</label><div className="relative"><Mail className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" /><input type="text" required value={emailOrUsername} onChange={e => setEmailOrUsername(e.target.value)} placeholder="email or username" className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/20 border border-white/10 text-slate-100" /></div></div>
              <div><label className="block text-slate-400 mb-1">Password</label><div className="relative"><Lock className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" /><input type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-9 pr-9 py-2 rounded-xl bg-black/20 border border-white/10 text-slate-100" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-slate-500">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div>
              <button type="button" onClick={() => { setMode('forgot'); setErrorMsg(null); }} className="text-cyan-400 text-[11px] hover:underline">Forgot password? / 忘记密码</button>
            </>
          )}

          {mode === 'register' && (
            <>
              <div><label className="block text-slate-400 mb-1">Email</label><div className="relative"><Mail className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" /><input type="email" required value={registerEmail} onChange={e => setRegisterEmail(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/20 border border-white/10 text-slate-100" /></div></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-slate-400 mb-1">Display Name</label><input required value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-slate-100" /></div>
                <div><label className="block text-slate-400 mb-1">Username</label><input required value={registerUsername} onChange={e => setRegisterUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} className="w-full px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-slate-100 font-mono" /></div>
              </div>
              <div><label className="block text-slate-400 mb-1">Password (min 6)</label><div className="relative"><Lock className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" /><input type={showPassword ? 'text' : 'password'} required minLength={6} value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-9 pr-9 py-2 rounded-xl bg-black/20 border border-white/10 text-slate-100" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-slate-500">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div>
            </>
          )}

          {mode === 'phone' && (
            <>
              <p className="text-[11px] text-slate-400">SMS 验证码登录/注册（未配置短信服务将 BLOCKED，不会伪造发送）。</p>
              <div className="flex gap-2">
                <select value={dial} onChange={e=>setDial(e.target.value)} className="w-28 px-2 py-2 rounded-xl bg-black/20 border border-white/10 text-slate-100 text-xs">{COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select>
                <div className="relative flex-1"><Phone className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" /><input required value={phoneLocal} onChange={e=>setPhoneLocal(e.target.value)} placeholder="Phone number" className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/20 border border-white/10 text-slate-100" /></div>
              </div>
              <div className="flex gap-2">
                <input value={phoneCode} onChange={e=>setPhoneCode(e.target.value)} placeholder="SMS code" className="flex-1 px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-slate-100" />
                <button type="button" onClick={sendPhoneCode} disabled={isLoading} className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-slate-200 text-[11px] font-semibold disabled:opacity-40">Send Code</button>
              </div>
              {smsStatus && !smsStatus.configured && <p className="text-[10px] text-amber-300">SMS provider not configured (BLOCKED). Set SMS_PROVIDER + credentials.</p>}
            </>
          )}

          {mode === 'forgot' && (
            <>
              <p className="text-[11px] text-slate-400">输入邮箱获取重置验证码（需邮件服务配置，否则 BLOCKED）。</p>
              <div className="relative"><Mail className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" /><input type="email" required value={resetEmail} onChange={e=>setResetEmail(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/20 border border-white/10 text-slate-100" /></div>
            </>
          )}

          {mode === 'reset' && (
            <>
              <div><label className="block text-slate-400 mb-1">Email</label><input type="email" required value={resetEmail} onChange={e=>setResetEmail(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-slate-100" /></div>
              <div><label className="block text-slate-400 mb-1">Reset Code</label><div className="relative"><KeyRound className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" /><input required value={resetCode} onChange={e=>setResetCode(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/20 border border-white/10 text-slate-100" /></div></div>
              <div><label className="block text-slate-400 mb-1">New Password (min 6)</label><input type="password" required minLength={6} value={newPassword} onChange={e=>setNewPassword(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-slate-100" /></div>
            </>
          )}

          <button type="submit" disabled={isLoading} className="w-full py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 mt-1">
            <span>{isLoading ? '...' : mode==='login'?'Sign In':mode==='register'?'Register':mode==='phone'?'Verify & Sign In':mode==='forgot'?'Send Reset Code':'Reset Password'}</span><ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        {(mode === 'forgot' || mode === 'reset') && <button onClick={()=>setMode('login')} className="text-[11px] text-slate-400 hover:text-slate-200">Back to sign in</button>}

        <div className="text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /><span>Server-side auth · no secrets in frontend · config-gated external services</span></div>
      </div>
    </div>
  );
};
