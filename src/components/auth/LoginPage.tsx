import React, { useEffect, useRef, useState } from 'react';
import type { Language, User } from '../../types/index.ts';
import { Eye, EyeOff, Loader2, Moon, Sun } from 'lucide-react';
import { PWAInstallButton } from '../layout/PWAInstallButton.tsx';
import { ParadiseBrandEmblem } from '../brand/ParadiseBrandEmblem.tsx';
import { unlockSteadyVoiceAudio } from '../../utils/steadyVoicePlayer.ts';

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
  const [isTransitioning, setIsTransitioning] = useState(false);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas || typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let disposed = false;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Organic garden petals, warm pollen motes (day) or serene fireflies (night)
    const flakes = Array.from({ length: 34 }, (_, i) => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: 0.18 + Math.random() * 0.36,
      vy: i % 4 === 0 ? -0.14 - Math.random() * 0.2 : 0.28 + Math.random() * 0.44,
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.02,
      size: i % 4 === 0 ? 2.2 + Math.random() * 2.2 : 4 + Math.random() * 4.5,
      kind: i % 4 === 0 ? 'mote' : i % 3 === 0 ? 'ginkgo' : 'petal',
      phase: Math.random() * Math.PI * 2,
    }));

    let t = 0;
    const draw = () => {
      if (disposed) return;
      t += 0.016;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // Soft layered horizon garden hills silhouette so entry seamlessly previews Paradise World
      const drawHill = (yRatio: number, amp: number, freq: number, phase: number, fill: string) => {
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 28) {
          const y =
            h * yRatio +
            Math.sin(x * freq + phase) * amp +
            Math.cos(x * freq * 0.52 + phase * 0.7) * (amp * 0.45);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };

      if (theme === 'dark') {
        drawHill(0.76, 26, 0.0024, 0.4, 'rgba(20, 42, 40, 0.42)');
        drawHill(0.84, 20, 0.0032, 2.1, 'rgba(15, 31, 34, 0.62)');
        drawHill(0.92, 14, 0.0044, 4.0, 'rgba(11, 22, 28, 0.82)');
      } else {
        drawHill(0.77, 26, 0.0024, 0.4, 'rgba(136, 174, 148, 0.24)');
        drawHill(0.85, 20, 0.0032, 2.1, 'rgba(98, 142, 118, 0.26)');
        drawHill(0.92, 14, 0.0044, 4.0, 'rgba(56, 102, 82, 0.28)');
      }

      for (const f of flakes) {
        f.x += f.vx + Math.sin(f.phase + t * 1.1) * 0.28;
        f.y += f.vy;
        f.rot += f.vRot;
        if (f.kind === 'mote') {
          if (f.y < -20) {
            f.y = h + 16;
            f.x = Math.random() * w;
          }
          if (f.x > w + 20) f.x = -12;
          const pulse = 0.45 + 0.55 * Math.sin(t * 2.4 + f.phase);
          ctx.save();
          ctx.fillStyle =
            theme === 'dark'
              ? `rgba(232, 208, 134, ${0.55 * pulse})`
              : `rgba(196, 168, 118, ${0.48 * pulse})`;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          continue;
        }

        if (f.y > h + 20 || f.x > w + 24) {
          f.x = Math.random() * w - 40;
          f.y = -18;
        }
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rot);
        ctx.fillStyle =
          f.kind === 'ginkgo'
            ? theme === 'dark'
              ? 'rgba(216, 184, 112, 0.34)'
              : 'rgba(196, 152, 62, 0.32)'
            : theme === 'dark'
              ? 'rgba(244, 208, 218, 0.32)'
              : 'rgba(232, 164, 182, 0.36)';
        ctx.beginPath();
        if (f.kind === 'ginkgo') {
          ctx.moveTo(0, f.size * 0.3);
          ctx.quadraticCurveTo(-f.size, -f.size * 0.6, 0, -f.size * 0.9);
          ctx.quadraticCurveTo(f.size, -f.size * 0.6, 0, f.size * 0.3);
        } else {
          ctx.ellipse(0, 0, f.size * 0.5, f.size * 0.85, 0, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [theme]);

  const completeWithTransition = (user: User, token: string, isNewRegistration: boolean) => {
    unlockSteadyVoiceAudio();
    setIsTransitioning(true);
    const delay =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 60
        : 460;
    window.setTimeout(() => {
      onAuthSuccess(user, token, isNewRegistration);
    }, delay);
  };

  const switchMode = (next: Mode) => {
    if (loading || isTransitioning) return;
    setMode(next);
    setErrorMsg(null);
    setInfoMsg(null);
  };

  const sanitizeUsernameInput = (v: string) => v.replace(/[\r\n\t\u0000-\u001F\u007F]/g, '');

  const parseJsonSafe = async (res: Response) => {
    try { return await res.json(); } catch { return {}; }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || isTransitioning) return;
    unlockSteadyVoiceAudio();
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
          completeWithTransition(data.user, data.token || '', !data.user.hasCompletedOnboarding);
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

    const cleanUsername = sanitizeUsernameInput(username).trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanUsername) { setErrorMsg(L('请输入用户名。', 'Please enter a username.', 'يرجى إدخال اسم مستخدم.')); return; }
    if (Array.from(cleanUsername).length > 40) { setErrorMsg(L('用户名最多 40 个字符。', 'Username cannot exceed 40 characters.', 'يجب ألا يتجاوز اسم المستخدم 40 حرفًا.')); return; }
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
        completeWithTransition(data.user, data.token || '', true);
      } else {
        setErrorMsg(data?.error || L('注册失败，请稍后重试。', 'Registration failed. Please try again.', 'فشل إنشاء الحساب. حاول مرة أخرى.'));
      }
    } catch {
      setErrorMsg(L('网络连接失败，请稍后重试。', 'Network error. Please try again.', 'خطأ في الشبكة. حاول مرة أخرى.'));
    } finally {
      setLoading(false);
    }
  };

  const isDark = theme === 'dark';

  return (
    <div
      className={`relative min-h-[100dvh] overflow-hidden flex items-center justify-center px-4 py-8 transition-all duration-500 ease-out ${
        isDark
          ? 'bg-gradient-to-b from-[#0e1722] via-[#13212e] to-[#162728] text-[#f3efe6]'
          : 'bg-gradient-to-b from-[#f3efe5] via-[#eef3ec] to-[#e9e3d4] text-[#1d2b24]'
      } ${isTransitioning ? 'opacity-0 scale-[1.015] pointer-events-none' : 'opacity-100 scale-100'}`}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* Subtle sunlit/moonlit upper glow matching Paradise World sky */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[48vh]"
        style={{
          background: isDark
            ? 'radial-gradient(ellipse 68% 58% at 50% 8%, rgba(214,183,127,0.14), rgba(46,139,116,0.06) 52%, transparent 78%)'
            : 'radial-gradient(ellipse 68% 58% at 50% 6%, rgba(255,244,218,0.85), rgba(196,168,118,0.14) 55%, transparent 80%)',
        }}
      />

      <canvas
        ref={bgCanvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 w-full h-full z-0"
      />

      {/* Minimal Top-Right Utility Controls */}
      <div className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 flex items-center gap-2">
        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors cursor-pointer ${
              isDark
                ? 'border-white/15 bg-[#131d29]/80 text-[#d6b77f] hover:bg-[#1a2736]'
                : 'border-[#24382e]/12 bg-[#faf7f0]/88 text-[#2a3f34] hover:bg-white'
            }`}
            title={isDark ? L('切换白昼花园', 'Daylight Garden') : L('切换月夜花园', 'Moonlit Garden')}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        )}
        <PWAInstallButton lang={lang} compact={true} />
      </div>

      <div className="relative z-10 w-full max-w-[430px]">
        {/* Unified Paradise Brand Crest (User Logo + ONE ORIGIN Botanical Ring) */}
        <div className="mb-6 flex flex-col items-center text-center">
          <ParadiseBrandEmblem
            surface={isDark ? 'garden-night' : 'garden-day'}
            variant="crest"
            size={72}
            subtitle={L('天堂花园 · 同一个世界', 'Paradise World · One World')}
          />
          <h1 className="mt-5 text-[24px] leading-tight font-semibold tracking-tight text-balance">
            {mode === 'login'
              ? L('步入你的天堂花园', 'Step into Paradise World', 'ادخل عالم الجنة')
              : L('开启你的 EARTH ONE 旅程', 'Begin your EARTH ONE journey', 'ابدأ رحلتك في EARTH ONE')}
          </h1>
          <p className={`mt-1.5 text-[13px] leading-relaxed ${isDark ? 'text-[#d4cec0]/75' : 'text-[#485d52]'}`}>
            {mode === 'login'
              ? L('登录账号，与花园精灵一同探索语言、音乐、知识与世界。', 'Sign in to explore languages, music, knowledge, and the living garden.', 'سجّل الدخول لاستكشاف الحديقة الحية.')
              : L('创建专属身份，接入实时昼夜花园与全域空间。', 'Create your sanctuary identity across the living world.', 'أنشئ هويتك في عالم ONE.')}
          </p>
        </div>

        {/* Garden-Matched Parchment / Twilight Sanctuary Card */}
        <div
          className={`rounded-[26px] border p-6 sm:p-7 transition-colors ${
            isDark
              ? 'border-white/14 bg-[#121c27]/90 shadow-[0_24px_64px_rgba(4,9,16,0.48)]'
              : 'border-[#23362c]/12 bg-[#faf7f0]/92 shadow-[0_20px_54px_rgba(26,42,34,0.12)]'
          }`}
        >
          <div className={`flex items-center gap-6 border-b mb-5 ${isDark ? 'border-white/10' : 'border-[#23362c]/10'}`}>
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`pb-3 text-sm font-medium transition-colors cursor-pointer ${
                mode === 'login'
                  ? isDark
                    ? 'text-[#f7f4ec] border-b-2 border-[#d6b77f] -mb-px'
                    : 'text-[#1c2d25] border-b-2 border-[#247864] -mb-px'
                  : isDark
                    ? 'text-[#c9c2b4]/65 hover:text-[#f7f4ec]'
                    : 'text-[#556b5f] hover:text-[#1c2d25]'
              }`}
            >
              {L('登录', 'Sign in', 'تسجيل الدخول')}
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`pb-3 text-sm font-medium transition-colors cursor-pointer ${
                mode === 'register'
                  ? isDark
                    ? 'text-[#f7f4ec] border-b-2 border-[#d6b77f] -mb-px'
                    : 'text-[#1c2d25] border-b-2 border-[#247864] -mb-px'
                  : isDark
                    ? 'text-[#c9c2b4]/65 hover:text-[#f7f4ec]'
                    : 'text-[#556b5f] hover:text-[#1c2d25]'
              }`}
            >
              {L('注册', 'Create account', 'إنشاء حساب')}
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-200">
              {errorMsg}
            </div>
          )}
          {infoMsg && (
            <div className="mb-4 rounded-xl border border-[#247864]/30 bg-[#247864]/10 px-3.5 py-2.5 text-xs text-[#1f5c4d] dark:text-[#9de0cc]">
              {infoMsg}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === 'login' ? (
              <>
                <label className="block space-y-1.5">
                  <span className={`text-xs font-medium ${isDark ? 'text-[#d9d3c6]' : 'text-[#394e43]'}`}>
                    {L('邮箱或用户名', 'Email or username', 'البريد الإلكتروني أو اسم المستخدم')}
                  </span>
                  <input
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={loading}
                    className={`w-full h-11 rounded-xl border px-3.5 text-sm outline-none transition disabled:opacity-50 ${
                      isDark
                        ? 'border-white/14 bg-[#0d1520] text-[#f5f1e8] placeholder:text-[#a8a296]/55 focus:border-[#d6b77f]/65'
                        : 'border-[#23362c]/14 bg-white/85 text-[#1b2b24] placeholder:text-[#6b7d73]/70 focus:border-[#247864]'
                    }`}
                    placeholder={L('you@example.com 或 username', 'you@example.com or username', 'you@example.com أو اسم المستخدم')}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className={`text-xs font-medium ${isDark ? 'text-[#d9d3c6]' : 'text-[#394e43]'}`}>
                    {L('密码', 'Password', 'كلمة المرور')}
                  </span>
                  <div className="relative">
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      disabled={loading}
                      className={`w-full h-11 rounded-xl border px-3.5 pr-11 text-sm outline-none transition disabled:opacity-50 ${
                        isDark
                          ? 'border-white/14 bg-[#0d1520] text-[#f5f1e8] placeholder:text-[#a8a296]/55 focus:border-[#d6b77f]/65'
                          : 'border-[#23362c]/14 bg-white/85 text-[#1b2b24] placeholder:text-[#6b7d73]/70 focus:border-[#247864]'
                      }`}
                      placeholder={L('输入密码', 'Enter your password', 'أدخل كلمة المرور')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((v) => !v)}
                      tabIndex={-1}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer ${
                        isDark ? 'text-[#b5afa2] hover:text-white' : 'text-[#5c7166] hover:text-[#1b2b24]'
                      }`}
                      aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </label>
              </>
            ) : (
              <>
                <label className="block space-y-1.5">
                  <span className={`text-xs font-medium ${isDark ? 'text-[#d9d3c6]' : 'text-[#394e43]'}`}>
                    {L('用户名', 'Username', 'اسم المستخدم')}
                  </span>
                  <input
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(sanitizeUsernameInput(e.target.value))}
                    disabled={loading}
                    maxLength={40}
                    className={`w-full h-11 rounded-xl border px-3.5 text-sm outline-none transition disabled:opacity-50 ${
                      isDark
                        ? 'border-white/14 bg-[#0d1520] text-[#f5f1e8] placeholder:text-[#a8a296]/55 focus:border-[#d6b77f]/65'
                        : 'border-[#23362c]/14 bg-white/85 text-[#1b2b24] placeholder:text-[#6b7d73]/70 focus:border-[#247864]'
                    }`}
                    placeholder={L('请输入用户名', 'Enter username', 'أدخل اسم المستخدم')}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className={`text-xs font-medium ${isDark ? 'text-[#d9d3c6]' : 'text-[#394e43]'}`}>
                    {L('邮箱', 'Email', 'البريد الإلكتروني')}
                  </span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className={`w-full h-11 rounded-xl border px-3.5 text-sm outline-none transition disabled:opacity-50 ${
                      isDark
                        ? 'border-white/14 bg-[#0d1520] text-[#f5f1e8] placeholder:text-[#a8a296]/55 focus:border-[#d6b77f]/65'
                        : 'border-[#23362c]/14 bg-white/85 text-[#1b2b24] placeholder:text-[#6b7d73]/70 focus:border-[#247864]'
                    }`}
                    placeholder="you@example.com"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className={`text-xs font-medium ${isDark ? 'text-[#d9d3c6]' : 'text-[#394e43]'}`}>
                    {L('密码', 'Password', 'كلمة المرور')}
                  </span>
                  <div className="relative">
                    <input
                      type={showRegisterPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      disabled={loading}
                      className={`w-full h-11 rounded-xl border px-3.5 pr-11 text-sm outline-none transition disabled:opacity-50 ${
                        isDark
                          ? 'border-white/14 bg-[#0d1520] text-[#f5f1e8] placeholder:text-[#a8a296]/55 focus:border-[#d6b77f]/65'
                          : 'border-[#23362c]/14 bg-white/85 text-[#1b2b24] placeholder:text-[#6b7d73]/70 focus:border-[#247864]'
                      }`}
                      placeholder={L('至少 6 个字符', 'At least 6 characters', '6 أحرف على الأقل')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegisterPassword((v) => !v)}
                      tabIndex={-1}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer ${
                        isDark ? 'text-[#b5afa2] hover:text-white' : 'text-[#5c7166] hover:text-[#1b2b24]'
                      }`}
                      aria-label={showRegisterPassword ? 'Hide password' : 'Show password'}
                    >
                      {showRegisterPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </label>
                <label className="block space-y-1.5">
                  <span className={`text-xs font-medium ${isDark ? 'text-[#d9d3c6]' : 'text-[#394e43]'}`}>
                    {L('确认密码', 'Confirm password', 'تأكيد كلمة المرور')}
                  </span>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={loading}
                      className={`w-full h-11 rounded-xl border px-3.5 pr-11 text-sm outline-none transition disabled:opacity-50 ${
                        isDark
                          ? 'border-white/14 bg-[#0d1520] text-[#f5f1e8] placeholder:text-[#a8a296]/55 focus:border-[#d6b77f]/65'
                          : 'border-[#23362c]/14 bg-white/85 text-[#1b2b24] placeholder:text-[#6b7d73]/70 focus:border-[#247864]'
                      }`}
                      placeholder={L('再次输入密码', 'Re-enter password', 'أعد إدخال كلمة المرور')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      tabIndex={-1}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer ${
                        isDark ? 'text-[#b5afa2] hover:text-white' : 'text-[#5c7166] hover:text-[#1b2b24]'
                      }`}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </label>
              </>
            )}

            <button
              type="submit"
              disabled={loading || isTransitioning}
              className={`w-full h-11 mt-2 rounded-full text-sm font-semibold shadow-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 ${
                isDark
                  ? 'bg-[#e5d9be] text-[#152028] hover:bg-[#f2e8d2]'
                  : 'bg-[#244e41] text-[#faf7f0] hover:bg-[#1c3e33]'
              }`}
            >
              {(loading || isTransitioning) && <Loader2 className="w-4 h-4 animate-spin" />}
              {isTransitioning
                ? L('正在开启天堂花园…', 'Awakening Paradise World…', 'جارٍ فتح العالم…')
                : loading
                  ? L('处理中…', 'Please wait…', 'يرجى الانتظار…')
                  : mode === 'login'
                    ? L('进入天堂花园', 'Enter Paradise World', 'تسجيل الدخول')
                    : L('创建账号并进入', 'Create account', 'إنشاء حساب')}
            </button>
          </form>

          <div className={`mt-5 text-center text-xs ${isDark ? 'text-[#c9c2b4]/75' : 'text-[#52675c]'}`}>
            {mode === 'login' ? (
              <span>
                {L('还没有账号？', "Don't have an account?", 'ليس لديك حساب؟')}{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className={`font-medium hover:underline cursor-pointer ${isDark ? 'text-[#d6b77f]' : 'text-[#247864]'}`}
                >
                  {L('立即注册', 'Create one', 'أنشئ حسابًا')}
                </button>
              </span>
            ) : (
              <span>
                {L('已有账号？', 'Already have an account?', 'لديك حساب بالفعل؟')}{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`font-medium hover:underline cursor-pointer ${isDark ? 'text-[#d6b77f]' : 'text-[#247864]'}`}
                >
                  {L('返回登录', 'Sign in', 'تسجيل الدخول')}
                </button>
              </span>
            )}
          </div>
        </div>

        {onOpenBrand && (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={onOpenBrand}
              className={`inline-flex items-center gap-2 text-xs transition-colors cursor-pointer ${
                isDark ? 'text-[#c8c0b0]/75 hover:text-[#f7f4ec]' : 'text-[#4e6458] hover:text-[#1b2b24]'
              }`}
            >
              <ParadiseBrandEmblem surface={isDark ? 'garden-night' : 'garden-day'} variant="medallion" size={20} />
              <span>{L('探索「独一 EARTH ONE」品牌视觉系统', 'Explore EARTH ONE Brand System')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
