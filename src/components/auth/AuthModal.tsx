import React, { useEffect, useState } from 'react';
import { Language, User, ChannelIntegration } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import { Globe2, Lock, Mail, User as UserIcon, X, ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: User, token: string, isNewRegistration: boolean) => void;
  lang: Language;
}

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
    <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-1.4 3.6-5.4 3.6-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.3 12 2.3 6.8 2.3 2.5 6.6 2.5 12S6.8 21.7 12 21.7c6.9 0 9.1-4.8 9.1-7.3 0-.5-.1-.9-.1-1.3H12z"/>
    <path fill="#34A853" d="M3.9 7.4l3.2 2.3C8 7.7 9.8 6.3 12 6.3c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.3 12 2.3 8.4 2.3 5.3 4.3 3.9 7.4z" opacity=".0"/>
  </svg>
);

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthSuccess, lang }) => {
  const t = translations[lang];
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [integrations, setIntegrations] = useState<ChannelIntegration[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/integrations').then(r => r.json()).then(d => { if (d.success) setIntegrations(d.integrations || []); }).catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;
  const google = integrations.find(i => i.id === 'google');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);
    try {
      if (mode === 'login') {
        const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: emailOrUsername.trim(), password }) });
        const data = await res.json();
        if (data.success && data.user) { onAuthSuccess(data.user, data.token, !data.user.hasCompletedOnboarding); onClose(); }
        else setErrorMsg(data.error || 'Authentication failed. Please check credentials.');
      } else {
        const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: registerEmail.trim(), password, displayName: displayName.trim() || undefined, username: registerUsername.trim() || undefined }) });
        const data = await res.json();
        if (data.success && data.user) { onAuthSuccess(data.user, data.token, true); onClose(); }
        else setErrorMsg(data.error || 'Registration failed.');
      }
    } catch { setErrorMsg('Network error connecting to Earth One security gateway.'); }
    finally { setIsLoading(false); }
  };

  const handleQuickDemoLogin = async (username: string) => {
    setIsLoading(true); setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: username, password: 'password123' }) });
      const data = await res.json();
      if (data.success && data.user) { onAuthSuccess(data.user, data.token, false); onClose(); }
      else setErrorMsg(data.error || 'Quick login failed.');
    } catch { setErrorMsg('Failed to log in demo account.'); }
    finally { setIsLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative space-y-5 p-6 sm:p-8 animate-in fade-in duration-200">
        <button onClick={onClose} className="absolute top-5 right-5 p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white cursor-pointer transition-colors"><X className="w-4 h-4" /></button>
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 p-0.5 mx-auto shadow-lg shadow-cyan-500/20"><div className="w-full h-full bg-[#030712] rounded-[14px] flex items-center justify-center"><Globe2 className="w-6 h-6 text-cyan-400" /></div></div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-100 font-serif">{mode === 'login' ? 'Citizen Sign In' : 'Join EARTH ONE'}</h2>
            <p className="text-xs text-slate-400 mt-0.5">ONE EARTH. ONE WORLD. ONE HUMANITY.</p>
          </div>
        </div>

        {/* Google / external sign-in */}
        <div className="space-y-2">
          <button type="button" onClick={() => { window.location.href = '/api/auth/google/start'; }} disabled={google?.status === 'config_required'}
            className={`w-full py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${google?.status === 'available' ? 'bg-white text-slate-900 hover:bg-slate-100 border-white' : 'bg-slate-950 text-slate-300 border-slate-700 opacity-80 cursor-not-allowed'}`}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true"><path fill="#4285F4" d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.5c-.2 1.3-1 2.4-2.1 3.2v2.6h3.4c2-1.8 3-4.5 3-7.6z"/><path fill="#34A853" d="M12 22c2.8 0 5.2-.9 6.9-2.5l-3.4-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.7v2.7C4.4 19.7 7.9 22 12 22z"/><path fill="#FBBC05" d="M6.2 13.6c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V6.9H2.7C2 8.3 1.6 10 1.6 11.6s.4 3.3 1.1 4.7l3.5-2.7z"/><path fill="#EA4335" d="M12 5.8c1.5 0 2.9.5 4 1.6l3-3C17.2 2.8 14.8 1.8 12 1.8 7.9 1.8 4.4 4.1 2.7 7.5l3.5 2.7c.8-2.5 3.1-4.4 5.8-4.4z"/></svg>
            <span>使用 Google 账号登录 / 绑定（官方 OAuth）</span>
          </button>
          {google?.status !== 'available' && <p className="text-[10px] text-slate-500 text-center">Google 登录未配置：请在服务端设置 <code className="text-slate-400">GOOGLE_CLIENT_ID/SECRET/APP_URL</code>。</p>}
          <p className="text-[10px] text-slate-500 leading-relaxed">微信/WhatsApp：仅支持官方渠道能力（微信开放平台扫码登录/绑定、WhatsApp Business API 企业消息）。<b className="text-amber-300/80">不支持</b>登录或同步个人微信/WhatsApp 聊天。</p>
        </div>

        <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-medium">
          <button type="button" onClick={() => { setMode('login'); setErrorMsg(null); }} className={`py-2 rounded-lg transition-all cursor-pointer ${mode === 'login' ? 'bg-cyan-500 text-slate-950 font-bold shadow-md' : 'text-slate-400 hover:text-slate-200'}`}>Sign In (登录)</button>
          <button type="button" onClick={() => { setMode('register'); setErrorMsg(null); }} className={`py-2 rounded-lg transition-all cursor-pointer ${mode === 'register' ? 'bg-cyan-500 text-slate-950 font-bold shadow-md' : 'text-slate-400 hover:text-slate-200'}`}>Register (注册)</button>
        </div>

        {errorMsg && <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-300 text-xs">{errorMsg}</div>}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {mode === 'login' ? (
            <div>
              <label className="block text-slate-400 mb-1">Email or Username</label>
              <div className="relative"><Mail className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" /><input type="text" required value={emailOrUsername} onChange={e => setEmailOrUsername(e.target.value)} placeholder="e.g. li_wei or citizen@earthone.world" className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500" /></div>
            </div>
          ) : (
            <>
              <div><label className="block text-slate-400 mb-1">Email Address</label><div className="relative"><Mail className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" /><input type="email" required value={registerEmail} onChange={e => setRegisterEmail(e.target.value)} placeholder="your.name@domain.com" className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500" /></div></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-slate-400 mb-1">Display Name</label><div className="relative"><UserIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" /><input type="text" required value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Sophia Chen" className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500" /></div></div>
                <div><label className="block text-slate-400 mb-1">Username (@)</label><input type="text" required value={registerUsername} onChange={e => setRegisterUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="sophia_chen" className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono" /></div>
              </div>
            </>
          )}
          <div>
            <label className="block text-slate-400 mb-1">Password</label>
            <div className="relative"><Lock className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" /><input type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" className="w-full pl-9 pr-9 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div>
          </div>
          <button type="submit" disabled={isLoading} className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center space-x-1.5 mt-2"><span>{isLoading ? 'Processing...' : mode === 'login' ? 'Sign In to Earth One' : 'Register & Setup Profile'}</span><ArrowRight className="w-3.5 h-3.5" /></button>
        </form>

        <div className="pt-3 border-t border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400"><span>Fast Demo Sign-In (Preset Citizens):</span></div>
          <div className="flex flex-wrap gap-1.5">
            {[{ id: 'li_wei', label: 'Li Wei (CN 🇨🇳)' },{ id: 'sarah_sky', label: 'Sarah (US 🇺🇸)' },{ id: 'tariq_amman', label: 'Tariq (JO 🇯🇴)' },{ id: 'noura_riyadh', label: 'Noura (SA 🇸🇦)' },{ id: 'julien_paris', label: 'Julien (FR 🇫🇷)' },{ id: 'dmitry_spb', label: 'Dmitry (RU 🇷🇺)' }].map(demo => (
              <button key={demo.id} type="button" onClick={() => handleQuickDemoLogin(demo.id)} className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-cyan-300 cursor-pointer transition-colors">{demo.label}</button>
            ))}
          </div>
        </div>
        <div className="text-center text-[11px] text-slate-500 flex items-center justify-center space-x-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /><span>Server-side authentication (scrypt + session tokens)</span></div>
      </div>
    </div>
  );
};
