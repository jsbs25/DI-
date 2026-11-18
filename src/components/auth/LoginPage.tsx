import React, { useState } from 'react';
import type { Language, User } from '../../types/index.ts';
import { Eye, EyeOff, Loader2, Moon, Sun } from 'lucide-react';
import { PWAInstallButton } from '../layout/PWAInstallButton.tsx';
import { BrandMark } from '../brand/brandLogos.tsx';

interface LoginPageProps {
  lang: Language;
  onAuthSuccess: (user: User, token: string, isNewRegistration: boolean) => void;
  onOpenBrand?: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

type Mode = 'login' | 'register';

export const LoginPage: React.FC<LoginPageProps> = ({ lang, onAuthSuccess, onOpenBrand, theme = 'light', onToggleTheme }) => {
  const L = (zh: string, en: string, ar?: string) => (lang === 'ar' ? (ar || en) : lang === 'en' ? en : zh);
  const [mode, setMode] = useState<Mode>('login');
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const switchMode = (next: Mode) => {
    if (loading) return;
    setMode(next);
    setErrorMsg(null);
    setInfoMsg(null);
  };

  const normalizeUsername = (v: string) => v.toLowerCase().replace(/[^a-z0-9_]/g, '');

  const parseJsonSafe = async (res: Response) => {
    try { return await res.json(); } catch { return {}; }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErrorMsg(null);
    setInfoMsg(null);

    if (mode === 'login') {
      const id = identifier.trim();
      if (!id || !loginPassword) {
        setErrorMsg(L('请输入邮箱或用户名和密码。', 'Enter your email or username and password.', 'أدخل البريد الإلكتروني أو اسم المستخدم وكلمة المرور.'));
        return;
      }
      setLoading(true);
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ identifier: id, password: loginPassword }),
        });
        const data = await parseJsonSafe(res);
        if (res.ok && data?.success && data?.user) {
          onAuthSuccess(data.user, data.token || '', !data.user.hasCompletedOnboarding);
        } else {
          setErrorMsg(data?.error || L('登录失败，请检查账号和密码。', 'Sign-in failed. Check your credentials.', 'فشل تسجيل الدخول. تحقق من بياناتك.'));
        }
      } catch {
        setErrorMsg(L('网络连接失败，请稍后重试。', 'Network error. Please try again.', 'خطأ في الشبكة. حاول مرة أخرى.'));
      } finally {
        setLoading(false);
      }
      return;
    }

    const cleanUsername = normalizeUsername(username.trim());
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanUsername) { setErrorMsg(L('请输入用户名。', 'Please enter a username.', 'يرجى إدخال اسم مستخدم.')); return; }
    if (cleanUsername.length < 3) { setErrorMsg(L('用户名至少 3 个字符（字母、数字或下划线）。', 'Username must be at least 3 characters (letters, numbers, underscore).', 'يجب أن يكون اسم المستخدم 3 أحرف على الأقل.')); return; }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setErrorMsg(L('请输入有效的邮箱地址。', 'Please enter a valid email address.', 'يرجى إدخال بريد إلكتروني صالح.')); return; }
    if (registerPassword.length < 6) { setErrorMsg(L('密码至少需要 6 个字符。', 'Password must be at least 6 characters.', 'يجب أن تكون كلمة المرور 6 أحرف على الأقل.')); return; }
    if (registerPassword !== confirmPassword) { setErrorMsg(L('两次输入的密码不一致。', 'Passwords do not match.', 'كلمتا المرور غير متطابقتين.')); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: cleanEmail,
          password: registerPassword,
          username: cleanUsername,
          displayName: cleanUsername,
        }),
      });
      const data = await parseJsonSafe(res);
      if (res.ok && data?.success && data?.user) {
        onAuthSuccess(data.user, data.token || '', true);
      } else {
        setErrorMsg(data?.error || L('注册失败，请稍后重试。', 'Registration failed. Please try again.', 'فشل إنشاء الحساب. حاول مرة أخرى.'));
      }
    } catch {
      setErrorMsg(L('网络连接失败，请稍后重试。', 'Network error. Please try again.', 'خطأ في الشبكة. حاول مرة أخرى.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-[100dvh] bg-gradient-to-br from-[#eef4fc] via-[#f9fbff] to-[#e9f1fb] dark:from-[#121e35] dark:via-[#0f172a] dark:to-[#0c1424] text-slate-900 dark:text-slate-100 flex items-center justify-center px-4 py-6 transition-colors"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="w-full max-w-[420px]">
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 overflow-hidden rounded-[10px] border border-slate-900/10 dark:border-white/15 bg-slate-900 shadow-sm">
                <img src="/earth-one-icon.png" alt="ONE" className="h-full w-full object-cover" />
              </div>
              <span className="text-sm font-semibold tracking-[0.18em] text-slate-900 dark:text-slate-100">ONE</span>
            </div>
            <div className="flex items-center gap-1.5">
              {onToggleTheme && (
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 dark:border-white/15 bg-white/80 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-white/[0.12]"
                  title={theme === 'dark' ? L('切换明亮模式', 'Light mode') : L('切换深空模式', 'Dark mode')}
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-300" /> : <Moon className="h-4 w-4 text-sky-700" />}
                </button>
              )}
              <PWAInstallButton lang={lang} compact={true} />
            </div>
          </div>
          <h1 className="text-[26px] leading-tight font-semibold text-slate-900 dark:text-white tracking-tight">
            {mode === 'login' ? L('欢迎回来', 'Welcome back', 'مرحبًا بعودتك') : L('加入 ONE', 'Join ONE', 'انضم إلى ONE')}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {mode === 'login'
              ? L('使用你的账号登录，继续探索同一个地球。', 'Sign in to continue your journey on one Earth.', 'سجّل الدخول لمتابعة رحلتك على أرض واحدة.')
              : L('创建你的账号，进入统一的 ONE 世界。', 'Create your account and enter the world of ONE.', 'أنشئ حسابك وادخل عالم ONE.')}
          </p>
        </div>

        <div className="rounded-[24px] border border-slate-200/90 dark:border-white/15 bg-white/95 dark:bg-[#162238]/92 backdrop-blur-xl p-6 sm:p-7 shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-6 border-b border-slate-200 dark:border-white/10 mb-6">
            <button type="button" onClick={() => switchMode('login')} className={`pb-3 text-sm font-medium transition-colors ${mode === 'login' ? 'text-slate-900 dark:text-white border-b-2 border-sky-600 dark:border-sky-400 -mb-px' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>
              {L('登录', 'Sign in', 'تسجيل الدخول')}
            </button>
            <button type="button" onClick={() => switchMode('register')} className={`pb-3 text-sm font-medium transition-colors ${mode === 'register' ? 'text-slate-900 dark:text-white border-b-2 border-sky-600 dark:border-sky-400 -mb-px' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>
              {L('注册', 'Create account', 'إنشاء حساب')}
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-200">
              {errorMsg}
            </div>
          )}
          {infoMsg && (
            <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-3.5 py-2.5 text-sm text-slate-700 dark:text-slate-200">
              {infoMsg}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === 'login' ? (
              <>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{L('邮箱或用户名', 'Email or username', 'البريد الإلكتروني أو اسم المستخدم')}</span>
                  <input
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={loading}
                    className="w-full h-11 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#0f1829] px-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition focus:border-sky-500 focus:bg-white dark:focus:bg-[#131e33] disabled:opacity-50"
                    placeholder={L('you@example.com 或 username', 'you@example.com or username', 'you@example.com أو اسم المستخدم')}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{L('密码', 'Password', 'كلمة المرور')}</span>
                  <div className="relative">
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      disabled={loading}
                      className="w-full h-11 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#0f1829] px-3.5 pr-11 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition focus:border-sky-500 focus:bg-white dark:focus:bg-[#131e33] disabled:opacity-50"
                      placeholder={L('输入密码', 'Enter your password', 'أدخل كلمة المرور')}
                    />
                    <button type="button" onClick={() => setShowLoginPassword(v => !v)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label={showLoginPassword ? 'Hide password' : 'Show password'}>
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </label>
              </>
            ) : (
              <>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{L('用户名', 'Username', 'اسم المستخدم')}</span>
                  <input
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                    disabled={loading}
                    className="w-full h-11 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#0f1829] px-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition focus:border-sky-500 focus:bg-white dark:focus:bg-[#131e33] disabled:opacity-50"
                    placeholder={L('字母、数字、下划线', 'letters, numbers, underscore', 'حروف وأرقام وشرطة سفلية')}
                  />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{L('至少 3 个字符，仅支持 a-z、0-9、_', 'At least 3 characters: a-z, 0-9, _', '3 أحرف على الأقل: a-z، 0-9، _')}</span>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{L('邮箱', 'Email', 'البريد الإلكتروني')}</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="w-full h-11 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#0f1829] px-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition focus:border-sky-500 focus:bg-white dark:focus:bg-[#131e33] disabled:opacity-50"
                    placeholder="you@example.com"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{L('密码', 'Password', 'كلمة المرور')}</span>
                  <div className="relative">
                    <input
                      type={showRegisterPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      disabled={loading}
                      className="w-full h-11 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#0f1829] px-3.5 pr-11 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition focus:border-sky-500 focus:bg-white dark:focus:bg-[#131e33] disabled:opacity-50"
                      placeholder={L('至少 6 个字符', 'At least 6 characters', '6 أحرف على الأقل')}
                    />
                    <button type="button" onClick={() => setShowRegisterPassword(v => !v)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label={showRegisterPassword ? 'Hide password' : 'Show password'}>
                      {showRegisterPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{L('密码长度至少 6 位。', 'Use at least 6 characters.', 'استخدم 6 أحرف على الأقل.')}</span>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{L('确认密码', 'Confirm password', 'تأكيد كلمة المرور')}</span>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={loading}
                      className="w-full h-11 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#0f1829] px-3.5 pr-11 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition focus:border-sky-500 focus:bg-white dark:focus:bg-[#131e33] disabled:opacity-50"
                      placeholder={L('再次输入密码', 'Re-enter password', 'أعد إدخال كلمة المرور')}
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(v => !v)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </label>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 mt-2 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? L('处理中…', 'Please wait…', 'يرجى الانتظار…') : (mode === 'login' ? L('登录', 'Sign in', 'تسجيل الدخول') : L('创建账号', 'Create account', 'إنشاء حساب'))}
            </button>
          </form>

          <div className="mt-5 text-sm text-slate-500 dark:text-slate-400">
            {mode === 'login' ? (
              <span>
                {L('还没有账号？', "Don't have an account?", 'ليس لديك حساب؟')}{' '}
                <button type="button" onClick={() => switchMode('register')} className="text-sky-600 dark:text-sky-300 hover:underline font-medium">{L('注册', 'Create one', 'أنشئ حسابًا')}</button>
              </span>
            ) : (
              <span>
                {L('已有账号？', 'Already have an account?', 'لديك حساب بالفعل؟')}{' '}
                <button type="button" onClick={() => switchMode('login')} className="text-sky-600 dark:text-sky-300 hover:underline font-medium">{L('登录', 'Sign in', 'تسجيل الدخول')}</button>
              </span>
            )}
          </div>
        </div>

        {onOpenBrand && (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={onOpenBrand}
              className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <BrandMark concept="origin-final" mode={theme === 'dark' ? 'dark' : 'light'} lockup="symbol" size={16} />
              <span>{L('浏览「独一 ONE」品牌系统', 'Explore ONE Brand System')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
