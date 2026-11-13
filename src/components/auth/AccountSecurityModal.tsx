import React, { useEffect, useState } from 'react';
import type { User, ChannelIntegration } from '../../types/index.ts';
import { X, Shield, Mail, Phone, Link2, Unlink, KeyRound, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onUserUpdate: (u: User) => void;
}

export const AccountSecurityModal: React.FC<Props> = ({ isOpen, onClose, currentUser, onUserUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [sec, setSec] = useState<any>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [emailBind, setEmailBind] = useState({ email: '', code: '', challengeId: '' });
  const [phoneBind, setPhoneBind] = useState({ dial: '+86', phone: '', code: '', challengeId: '' });
  const [emailChange, setEmailChange] = useState({ newEmail: '', currentPassword: '', code: '', challengeId: '' });
  const [unlinkPw, setUnlinkPw] = useState('');

  const api = async (path: string, init?: RequestInit) => {
    const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers as any || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const load = async () => {
    setLoading(true);
    try { const d = await api('/api/auth/security'); setSec(d); } catch (e: any) { setMsg({ type: 'err', text: e.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (isOpen) { setMsg(null); void load(); } }, [isOpen]);
  if (!isOpen) return null;

  const identities: any[] = sec?.user?.linkedIdentities || currentUser?.linkedIdentities || [];
  const integrations: ChannelIntegration[] = sec?.integrations || [];
  const hasPassword = true; // server enforces; UI assumes password-capable account
  const usableCount = identities.length + (hasPassword ? 1 : 0);

  const run = async (fn: () => Promise<void>) => { setMsg(null); try { await fn(); } catch (e: any) { setMsg({ type: 'err', text: e.message || '操作失败' }); } };

  const changePassword = () => run(async () => {
    await api('/api/auth/password/change', { method: 'POST', body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }) });
    setPw({ current: '', next: '' }); setMsg({ type: 'ok', text: '密码已更新 / Password updated.' });
  });

  const requestBindEmail = () => run(async () => {
    const d = await api('/api/auth/bind/email/request', { method: 'POST', body: JSON.stringify({ email: emailBind.email.trim() }) });
    setEmailBind(s => ({ ...s, challengeId: d.challengeId })); setMsg({ type: 'info', text: d.message || '验证码已发送（需邮件服务配置）。' });
  });
  const confirmBindEmail = () => run(async () => {
    const d = await api('/api/auth/bind/email/confirm', { method: 'POST', body: JSON.stringify({ email: emailBind.email.trim(), challengeId: emailBind.challengeId, code: emailBind.code.trim() }) });
    if (d.user) onUserUpdate(d.user); await load(); setMsg({ type: 'ok', text: '邮箱已绑定/验证。' }); setEmailBind({ email: '', code: '', challengeId: '' });
  });

  const requestBindPhone = () => run(async () => {
    const phone = `${phoneBind.dial}${phoneBind.phone.replace(/[^\d]/g, '')}`;
    const d = await api('/api/auth/bind/phone/request', { method: 'POST', body: JSON.stringify({ phone }) });
    setPhoneBind(s => ({ ...s, challengeId: d.challengeId })); setMsg({ type: 'info', text: '验证码已发送（需短信服务配置，否则 BLOCKED）。' });
  });
  const confirmBindPhone = () => run(async () => {
    const phone = `${phoneBind.dial}${phoneBind.phone.replace(/[^\d]/g, '')}`;
    const d = await api('/api/auth/bind/phone/confirm', { method: 'POST', body: JSON.stringify({ phone, challengeId: phoneBind.challengeId, code: phoneBind.code.trim() }) });
    if (d.user) onUserUpdate(d.user); await load(); setMsg({ type: 'ok', text: '手机号已绑定/验证。' }); setPhoneBind({ dial: '+86', phone: '', code: '', challengeId: '' });
  });

  const unlink = (provider: string) => run(async () => {
    if (usableCount <= 1) throw new Error('不能解绑最后一个可用登录方式。');
    const d = await api('/api/auth/unlink', { method: 'POST', body: JSON.stringify({ provider, currentPassword: unlinkPw }) });
    if (d.user) onUserUpdate(d.user); await load(); setUnlinkPw(''); setMsg({ type: 'ok', text: '已解绑。' });
  });


  const requestChangeEmail = () => run(async () => {
    const d = await api('/api/auth/email/change/request', { method: 'POST', body: JSON.stringify({ newEmail: emailChange.newEmail.trim(), currentPassword: emailChange.currentPassword }) });
    setEmailChange(s => ({ ...s, challengeId: d.challengeId })); setMsg({ type: 'info', text: '邮箱变更验证码已发送（需邮件服务配置）。' });
  });
  const confirmChangeEmail = () => run(async () => {
    const d = await api('/api/auth/email/change/confirm', { method: 'POST', body: JSON.stringify({ newEmail: emailChange.newEmail.trim(), challengeId: emailChange.challengeId, code: emailChange.code.trim() }) });
    if (d.user) onUserUpdate(d.user); await load(); setMsg({ type: 'ok', text: '邮箱已修改。' }); setEmailChange({ newEmail: '', currentPassword: '', code: '', challengeId: '' });
  });

  const startOAuth = (provider: string) => { if (provider === 'google') window.location.href = '/api/auth/google/start'; if (provider === 'wechat') window.location.href = '/api/auth/wechat/start'; };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-cyan-400" /><h2 className="text-lg font-bold text-slate-100">账户与安全 / Account & Security</h2></div>
          {msg && <div className={`p-3 rounded-xl text-xs border flex gap-2 ${msg.type==='ok'?'bg-emerald-950/40 border-emerald-800 text-emerald-200':msg.type==='info'?'bg-cyan-950/40 border-cyan-800 text-cyan-200':'bg-rose-950/50 border-rose-800 text-rose-200'}`}>{msg.type==='ok'?<CheckCircle2 className="w-4 h-4"/>:<AlertTriangle className="w-4 h-4"/>}<span>{msg.text}</span></div>}

          <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2"><Link2 className="w-4 h-4 text-cyan-400"/>已绑定登录方式</h3><button onClick={load} className="text-slate-400 hover:text-slate-200"><RefreshCw className="w-4 h-4"/></button></div>
            <p className="text-[11px] text-slate-500">统一身份：Google/微信/手机号/邮箱登录同一 ONE 账户。解绑需验证原账户密码，且不能解绑最后一个可用方式。绑定新身份需通过对应验证；不会因相同邮箱/手机号自动合并不同账户。</p>
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              {['email','phone','google','wechat'].map(pid => {
                const li = identities.find(i => i.provider === pid);
                return (
                  <div key={pid} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-200 uppercase">{pid}</p>
                      <p className="text-[11px] text-slate-400 truncate">{li ? (li.email || li.phone || li.displayName || li.providerUserId || '已绑定') : '未绑定'}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {li ? <button onClick={()=>unlink(pid)} className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-rose-300 text-[11px] inline-flex items-center gap-1"><Unlink className="w-3 h-3"/>解绑</button>
                           : (pid==='google'||pid==='wechat') ? <button onClick={()=>startOAuth(pid)} className="px-2 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[11px]">绑定</button>
                           : <span className="text-[11px] text-slate-500">下方验证绑定</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400"><span>解绑验证（当前密码）:</span><input type="password" value={unlinkPw} onChange={e=>setUnlinkPw(e.target.value)} placeholder="current password" className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-200"/></div>
            <p className="text-[10px] text-amber-300/80">可用登录方式数（含密码）：{usableCount}。最后一个方式不可解绑。</p>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2"><Mail className="w-4 h-4 text-cyan-400"/>绑定/验证邮箱</h3>
            <p className="text-[11px] text-slate-500">需邮件服务配置发送验证码；未配置将返回 BLOCKED，不伪造发送。</p>
            <div className="flex flex-wrap gap-2"><input value={emailBind.email} onChange={e=>setEmailBind(s=>({...s,email:e.target.value}))} placeholder="email@example.com" className="flex-1 min-w-[180px] px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs"/><button onClick={requestBindEmail} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs">发送验证码</button></div>
            <div className="flex flex-wrap gap-2"><input value={emailBind.code} onChange={e=>setEmailBind(s=>({...s,code:e.target.value}))} placeholder="verification code" className="flex-1 min-w-[180px] px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs"/><button disabled={!emailBind.challengeId} onClick={confirmBindEmail} className="px-3 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs disabled:opacity-40">确认绑定</button></div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2"><Phone className="w-4 h-4 text-cyan-400"/>绑定手机号</h3>
            <p className="text-[11px] text-slate-500">需短信服务配置；未配置 BLOCKED。</p>
            <div className="flex flex-wrap gap-2"><select value={phoneBind.dial} onChange={e=>setPhoneBind(s=>({...s,dial:e.target.value}))} className="px-2 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs"><option value="+86">+86 CN</option><option value="+962">+962 JO</option><option value="+1">+1 US/CA</option><option value="+44">+44 UK</option><option value="+971">+971 AE</option><option value="+966">+966 SA</option><option value="+20">+20 EG</option><option value="+81">+81 JP</option><option value="+82">+82 KR</option><option value="+33">+33 FR</option><option value="+49">+49 DE</option><option value="+7">+7 RU</option><option value="+91">+91 IN</option><option value="+61">+61 AU</option></select><input value={phoneBind.phone} onChange={e=>setPhoneBind(s=>({...s,phone:e.target.value}))} placeholder="phone number" className="flex-1 min-w-[140px] px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs"/><button onClick={requestBindPhone} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs">发送短信码</button></div>
            <div className="flex flex-wrap gap-2"><input value={phoneBind.code} onChange={e=>setPhoneBind(s=>({...s,code:e.target.value}))} placeholder="SMS code" className="flex-1 min-w-[140px] px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs"/><button disabled={!phoneBind.challengeId} onClick={confirmBindPhone} className="px-3 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs disabled:opacity-40">确认绑定</button></div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2"><Mail className="w-4 h-4 text-cyan-400"/>修改邮箱 / Change Email</h3>
            <p className="text-[11px] text-slate-500">需当前密码验证并向新邮箱发送验证码；邮件未配置将 BLOCKED。</p>
            <div className="grid sm:grid-cols-2 gap-2"><input value={emailChange.newEmail} onChange={e=>setEmailChange(s=>({...s,newEmail:e.target.value}))} placeholder="New email" className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs"/><input type="password" value={emailChange.currentPassword} onChange={e=>setEmailChange(s=>({...s,currentPassword:e.target.value}))} placeholder="Current password" className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs"/></div>
            <div className="flex flex-wrap gap-2"><input value={emailChange.code} onChange={e=>setEmailChange(s=>({...s,code:e.target.value}))} placeholder="Verification code" className="flex-1 min-w-[140px] px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs"/><button onClick={requestChangeEmail} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs">发送验证码</button><button disabled={!emailChange.challengeId} onClick={confirmChangeEmail} className="px-3 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs disabled:opacity-40">确认修改</button></div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2"><KeyRound className="w-4 h-4 text-cyan-400"/>修改密码 / Change Password</h3>
            <div className="grid sm:grid-cols-2 gap-2"><input type="password" value={pw.current} onChange={e=>setPw(s=>({...s,current:e.target.value}))} placeholder="Current password" className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs"/><input type="password" value={pw.next} onChange={e=>setPw(s=>({...s,next:e.target.value}))} placeholder="New password (>=6)" className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs"/></div>
            <button onClick={changePassword} disabled={!pw.current || pw.next.length<6} className="px-3 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 text-xs font-semibold">Update Password</button>
          </section>

          <p className="text-[10px] text-slate-500">敏感操作需身份验证并记录审计；Google/微信 OAuth 与短信/邮件投递依赖外部官方配置，未配置将明确 BLOCKED 且不伪造成功。</p>
        </div>
      </div>
    </div>
  );
};
