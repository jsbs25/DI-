import React, { useEffect, useState } from 'react';
import type { Language, User, ChannelIntegration } from '../../types/index.ts';
import { Globe2, ShieldCheck, Lock, Mail, Phone, ArrowRight, AlertCircle, QrCode, Info, Wifi, WifiOff } from 'lucide-react';

interface LoginPageProps {
  lang: Language;
  onAuthSuccess: (user: User, token: string, isNewRegistration: boolean) => void;
}

type Mode = 'login' | 'register' | 'phone';

const COUNTRIES = [
  { code: '+86', label: 'CN +86' }, { code: '+962', label: 'JO +962' }, { code: '+1', label: 'US/CA +1' },
  { code: '+44', label: 'UK +44' }, { code: '+81', label: 'JP +81' }, { code: '+82', label: 'KR +82' },
  { code: '+971', label: 'AE +971' }, { code: '+966', label: 'SA +966' }, { code: '+20', label: 'EG +20' },
  { code: '+33', label: 'FR +33' }, { code: '+49', label: 'DE +49' }, { code: '+7', label: 'RU +7' },
  { code: '+91', label: 'IN +91' }, { code: '+61', label: 'AU +61' },
];

export const LoginPage: React.FC<LoginPageProps> = ({ lang, onAuthSuccess }) => {
  const L = (zh: string, en: string, ar?: string) => (lang === 'ar' ? (ar || en) : lang === 'en' ? en : zh);
  const [mode, setMode] = useState<Mode>('login');
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [dial, setDial] = useState('+86');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneChallengeId, setPhoneChallengeId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [integrations, setIntegrations] = useState<ChannelIntegration[]>([]);
  const [authStatus, setAuthStatus] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [smsStatus, setSmsStatus] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setStatusLoading(true);
      try {
        const [s, i] = await Promise.all([
          fetch('/api/auth/status').then(r => r.json()).catch(() => null),
          fetch('/api/integrations').then(r => r.json()).catch(() => null),
        ]);
        if (!alive) return;
        if (s?.success) setAuthStatus(s);
        if (i?.success) { setIntegrations(i.integrations || []); setSmsStatus(i.sms || null); }
      } finally { if (alive) setStatusLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const google = integrations.find(i => i.id === 'google');
  const wechat = integrations.find(i => i.id === 'wechat');
  const wechatConfigured = !!(authStatus?.wechat?.configured ?? wechat?.status === 'available');
  const devQuick = authStatus?.devQuickLogin;
  const devEnabled = !!devQuick?.enabled;
  const devAvailable = !!devQuick?.available;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null); setInfoMsg(null); setLoading(true);
    try {
      if (mode === 'login') {
        const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: emailOrUsername.trim(), password }) });
        const data = await res.json();
        if (data.success && data.user) onAuthSuccess(data.user, data.token, !data.user.hasCompletedOnboarding);
        else setErrorMsg(data.error || L('登录失败','Authentication failed.','فشل تسجيل الدخول'));
      } else if (mode === 'register') {
        const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: registerEmail.trim(), password, displayName: displayName.trim() || undefined, username: registerUsername.trim() || undefined }) });
        const data = await res.json();
        if (data.success && data.user) onAuthSuccess(data.user, data.token, true);
        else setErrorMsg(data.error || L('注册失败','Registration failed.','فشل التسجيل'));
      } else if (mode === 'phone') {
        if (!phoneChallengeId) setErrorMsg(L('请先获取验证码','Request code first.','اطلب الرمز أولاً'));
        else {
          const fullPhone = `${dial}${phoneLocal.replace(/[^\d]/g, '')}`;
          const res = await fetch('/api/auth/phone/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: fullPhone, challengeId: phoneChallengeId, code: phoneCode.trim() }) });
          const data = await res.json();
          if (data.success && data.user) onAuthSuccess(data.user, data.token, !data.user.hasCompletedOnboarding);
          else setErrorMsg(data.error || L('验证失败','Verification failed.','فشل التحقق'));
        }
      }
    } catch { setErrorMsg(L('网络错误','Network error.','خطأ في الشبكة')); }
    finally { setLoading(false); }
  };

  const devLogin = async () => {
    setErrorMsg(null); setInfoMsg(null); setLoading(true);
    try {
      const res = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (data.success && data.user && data.token) {
        onAuthSuccess(data.user, data.token, false);
      } else {
        setErrorMsg(data.error || L('开发者登录不可用','Developer login unavailable.','تسجيل دخول المطور غير متاح'));
      }
    } catch { setErrorMsg(L('网络错误','Network error.','خطأ في الشبكة')); }
    finally { setLoading(false); }
  };

  const sendPhoneCode = async () => {
    setErrorMsg(null); setInfoMsg(null); setLoading(true);
    try {
      const fullPhone = `${dial}${phoneLocal.replace(/[^\d]/g, '')}`;
      const res = await fetch('/api/auth/phone/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: fullPhone }) });
      const data = await res.json();
      if (data.success) { setPhoneChallengeId(data.challengeId); setInfoMsg(L('验证码已发送（若服务已配置）','Code sent (if provider configured).','تم إرسال الرمز (إن كان مزود الخدمة مُهيأ).')); }
      else setErrorMsg(data.error || L('发送失败','Failed to send code.','فشل الإرسال'));
    } catch { setErrorMsg(L('网络错误','Network error.','خطأ في الشبكة')); }
    finally { setLoading(false); }
  };

  const startWechat = () => {
    if (!wechatConfigured) {
      setInfoMsg(null);
      setErrorMsg(L('微信登录尚未配置，请使用开发者登录。','WeChat login not configured. Please use Developer Quick Login.','تسجيل الدخول عبر WeChat غير مُهيأ. يرجى استخدام تسجيل دخول المطور.'));
      return;
    }
    window.location.href = '/api/auth/wechat/start';
  };

  const startGoogle = () => {
    if (google?.status !== 'available') {
      setErrorMsg(L('Google 登录尚未配置','Google login not configured.','تسجيل الدخول عبر Google غير مُهيأ'));
      return;
    }
    window.location.href = '/api/auth/google/start';
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 flex items-center justify-center p-4 sm:p-6" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <div className="rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-6 sm:p-8 flex flex-col justify-between shadow-2xl">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 p-0.5"><div className="w-full h-full bg-[#030712] rounded-[14px] flex items-center justify-center"><Globe2 className="w-7 h-7 text-cyan-400" /></div></div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-wide">EARTH ONE</h1>
                <p className="text-xs text-slate-400 mt-0.5">ONE EARTH · ONE WORLD · ONE HUMANITY</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{L('进入真实开发中的 EARTH ONE 产品，查看 Global Messenger、通知、资料、隐私设置与已实现模块。','Enter the real EARTH ONE product in development to view Global Messenger, notifications, profiles, privacy settings, and implemented modules.','ادخل إلى منتج EARTH ONE الحقيقي قيد التطوير لعرض المراسلة والإشعارات والملفات الشخصية وإعدادات الخصوصية والوحدات المنفذة.')}</p>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-200 flex items-center gap-2"><Info className="w-4 h-4 text-cyan-400"/>{L('登录与配置状态','Login & configuration status','حالة تسجيل الدخول والإعداد')}</p>
              <div className="space-y-2 text-[11px]">
                <div className="flex items-center justify-between gap-2"><span className="text-slate-400">WeChat OAuth</span><span className={wechatConfigured?'text-emerald-300':'text-amber-300'}>{wechatConfigured ? L('已配置','Configured','مُهيأ') : L('未配置','Not configured','غير مُهيأ')}</span></div>
                <div className="flex items-center justify-between gap-2"><span className="text-slate-400">Google OAuth</span><span className={google?.status==='available'?'text-emerald-300':'text-amber-300'}>{google?.status==='available'?L('已配置','Configured','مُهيأ'):L('未配置','Not configured','غير مُهيأ')}</span></div>
                <div className="flex items-center justify-between gap-2"><span className="text-slate-400">{L('开发者登录','Developer login','تسجيل دخول المطور')}</span><span className={devAvailable?'text-emerald-300':(devEnabled?'text-amber-300':'text-slate-500')}>{statusLoading?L('检测中…','Checking…','جارٍ التحقق…'):devAvailable?L('可用（本地开发）','Available (local dev)','متاح (تطوير محلي)'):(devEnabled?L('受信任环境校验未通过','Blocked by trusted-env check','مقيّد بفحص البيئة') : L('未启用','Disabled','معطّل'))}</span></div>
                <div className="flex items-center justify-between gap-2"><span className="text-slate-400">APP_URL</span><span className={authStatus?.wechat?.appUrlIsPlaceholder?'text-amber-300':'text-slate-300'}>{authStatus?.wechat?.appUrlIsPlaceholder?L('占位值（需配置）','Placeholder (needs config)','قيمة مؤقتة (تحتاج إعداد)'):(authStatus?.wechat ? L('已设置/读取中','Set/checked','مُعيّن/تم التحقق') : L('读取中','Checking','جارٍ التحقق'))}</span></div>
              </div>
              {!wechatConfigured && <p className="text-[11px] text-amber-200 bg-amber-950/30 border border-amber-800/40 rounded-lg p-2">{L('微信登录尚未配置，请使用开发者登录。','WeChat login not configured. Please use Developer Quick Login.','تسجيل الدخول عبر WeChat غير مُهيأ. يرجى استخدام تسجيل دخول المطور.')}</p>}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-6 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400"/> {L('服务端会话认证 · 不在前端暴露密钥 · 未配置服务不伪造成功','Server-side sessions · no secrets in frontend · unconfigured services do not fake success','جلسات على الخادم · بدون أسرار في الواجهة · الخدمات غير المُهيأة لا تُزيّف النجاح')}</div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 sm:p-7 shadow-2xl space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{L('登录 EARTH ONE','Sign in to EARTH ONE','تسجيل الدخول إلى EARTH ONE')}</h2>
            <p className="text-xs text-slate-400">{L('使用官方微信扫码、开发者快速登录或现有账户登录。','Use official WeChat QR, developer quick login, or existing account login.','استخدم رمز WeChat الرسمي أو تسجيل دخول المطور أو حسابًا موجودًا.')}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button type="button" onClick={startWechat} className={`py-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 ${wechatConfigured ? 'bg-emerald-600/90 hover:bg-emerald-500 text-white border-emerald-500' : 'bg-slate-950 text-slate-300 border-slate-700'}`}>
              <QrCode className="w-4 h-4"/> {L('微信扫码登录','WeChat QR Login','تسجيل الدخول برمز WeChat')}
            </button>
            <button type="button" onClick={startGoogle} className={`py-3 rounded-xl border text-sm font-semibold ${google?.status==='available' ? 'bg-white text-slate-900 border-white hover:bg-slate-100' : 'bg-slate-950 text-slate-300 border-slate-700'}`}>
              Google OAuth
            </button>
          </div>
          <p className="text-[10px] text-slate-500">{L('微信登录使用开放平台官方网页授权流程；未配置时明确显示不可用。新微信账号不会自动绑定到他人账户。','WeChat login uses official Open Platform web OAuth flow; unavailable when unconfigured. New WeChat accounts are never auto-bound to others.','يستخدم تسجيل دخول WeChat تدفق OAuth الرسمي؛ وغير متاح عند عدم الإعداد. لا يتم ربط حسابات WeChat الجديدة تلقائيًا بالآخرين.')}</p>

          {devAvailable && (
            <div className="rounded-xl border border-cyan-800/40 bg-cyan-950/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-cyan-200">{L('开发者登录','Developer Login','تسجيل دخول المطور')}</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full border text-emerald-300 border-emerald-700/50 bg-emerald-500/10">{L('开发环境可用','Dev available','متاح للتطوير')}</span>
              </div>
              <p className="text-[11px] text-slate-300">{L('复用现有测试账户 li_wei（固定），经服务端认证创建真实会话并进入当前产品。仅 NODE_ENV=development、DEV_LOGIN_ENABLED 且受信任本机环境可用。','Reuses fixed demo account li_wei, creates a real server session, and enters the current product. Only when NODE_ENV=development, DEV_LOGIN_ENABLED, and trusted local request.','يعيد استخدام حساب li_wei التجريبي الثابت وينشئ جلسة خادم حقيقية. متاح فقط عند التطوير المحلي الموثوق مع تفعيل DEV_LOGIN_ENABLED.')}</p>
              <button type="button" onClick={devLogin} disabled={loading} className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-sm flex items-center justify-center gap-2">
                <span>{loading ? '...' : L('开发者登录（li_wei）','Developer Login (li_wei)','تسجيل دخول المطور (li_wei)')}</span><ArrowRight className="w-4 h-4"/>
              </button>
            </div>
          )}

          <div className="grid grid-cols-3 p-1 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-medium">
            <button type="button" onClick={()=>{setMode('login'); setErrorMsg(null);}} className={`py-2 rounded-lg ${mode==='login'?'bg-slate-800 text-slate-100':'text-slate-400'}`}>{L('邮箱/用户名','Email/User','البريد/المستخدم')}</button>
            <button type="button" onClick={()=>{setMode('phone'); setErrorMsg(null);}} className={`py-2 rounded-lg ${mode==='phone'?'bg-slate-800 text-slate-100':'text-slate-400'}`}>{L('手机号','Phone','الهاتف')}</button>
            <button type="button" onClick={()=>{setMode('register'); setErrorMsg(null);}} className={`py-2 rounded-lg ${mode==='register'?'bg-slate-800 text-slate-100':'text-slate-400'}`}>{L('注册','Register','تسجيل')}</button>
          </div>

          {errorMsg && <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800/70 text-rose-200 text-xs flex gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/><span>{errorMsg}</span></div>}
          {infoMsg && <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-800/60 text-emerald-200 text-xs">{infoMsg}</div>}

          <form onSubmit={submit} className="space-y-3 text-sm">
            {mode === 'login' && (<>
              <label className="block space-y-1"><span className="text-xs text-slate-400">{L('邮箱或用户名','Email or username','البريد أو اسم المستخدم')}</span><div className="relative"><Mail className="w-4 h-4 absolute left-3 top-3 text-slate-500"/><input required value={emailOrUsername} onChange={e=>setEmailOrUsername(e.target.value)} className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100" /></div></label>
              <label className="block space-y-1"><span className="text-xs text-slate-400">{L('密码','Password','كلمة المرور')}</span><div className="relative"><Lock className="w-4 h-4 absolute left-3 top-3 text-slate-500"/><input required type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100" /></div></label>
            </>)}
            {mode === 'register' && (<>
              <label className="block space-y-1"><span className="text-xs text-slate-400">Email</span><input required type="email" value={registerEmail} onChange={e=>setRegisterEmail(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100" /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1"><span className="text-xs text-slate-400">{L('昵称','Display name','الاسم')}</span><input required value={displayName} onChange={e=>setDisplayName(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100" /></label>
                <label className="block space-y-1"><span className="text-xs text-slate-400">Username</span><input required value={registerUsername} onChange={e=>setRegisterUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))} className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-mono" /></label>
              </div>
              <label className="block space-y-1"><span className="text-xs text-slate-400">{L('密码（至少 6 位）','Password (min 6)','كلمة المرور (6+)')}</span><input required type="password" minLength={6} value={password} onChange={e=>setPassword(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100" /></label>
            </>)}
            {mode === 'phone' && (<>
              <p className="text-[11px] text-slate-400">{L('手机号验证码登录/注册。SMS 服务未配置时将显示阻塞状态，不会伪造发送。','Phone OTP login/register. If SMS is not configured it will be blocked (no fake send).','تسجيل الدخول/التسجيل برمز الهاتف. إذا لم تُهيأ خدمة SMS سيتم الحظر دون إرسال وهمي.')}</p>
              <div className="flex gap-2">
                <select value={dial} onChange={e=>setDial(e.target.value)} className="w-28 px-2 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs">{COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select>
                <div className="relative flex-1"><Phone className="w-4 h-4 absolute left-3 top-3 text-slate-500"/><input required value={phoneLocal} onChange={e=>setPhoneLocal(e.target.value)} placeholder={L('手机号','Phone number','رقم الهاتف')} className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100" /></div>
              </div>
              <div className="flex gap-2">
                <input value={phoneCode} onChange={e=>setPhoneCode(e.target.value)} placeholder={L('验证码','Code','الرمز')} className="flex-1 px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100" />
                <button type="button" onClick={sendPhoneCode} disabled={loading} className="px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold disabled:opacity-40">{L('发送验证码','Send code','إرسال الرمز')}</button>
              </div>
              {smsStatus && !smsStatus.configured && <p className="text-[10px] text-amber-300">{L('SMS 服务未配置（BLOCKED）','SMS provider not configured (BLOCKED)','مزود SMS غير مُهيأ (محظور)')}</p>}
            </>)}

            <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-white disabled:opacity-40 text-slate-950 font-bold text-sm flex items-center justify-center gap-2">
              <span>{loading ? '...' : mode==='login'?L('登录','Sign in','تسجيل الدخول'):mode==='register'?L('注册并进入','Register & enter','تسجيل ودخول'):L('验证并登录','Verify & sign in','تحقق ودخول')}</span>
              <ArrowRight className="w-4 h-4"/>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
