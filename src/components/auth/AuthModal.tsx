import React, { useState } from 'react';
import { Language, User } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import {
  Globe2,
  Lock,
  Mail,
  User as UserIcon,
  Sparkles,
  X,
  ArrowRight,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: User, token: string, isNewRegistration: boolean) => void;
  lang: Language;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  lang
}) => {
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

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      if (mode === 'login') {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: emailOrUsername.trim(),
            password
          })
        });
        const data = await res.json();
        if (data.success && data.user) {
          onAuthSuccess(data.user, data.token, !data.user.hasCompletedOnboarding);
          onClose();
        } else {
          setErrorMsg(data.error || 'Authentication failed. Please check credentials.');
        }
      } else {
        // Register flow
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: registerEmail.trim(),
            password,
            displayName: displayName.trim() || undefined,
            username: registerUsername.trim() || undefined
          })
        });
        const data = await res.json();
        if (data.success && data.user) {
          onAuthSuccess(data.user, data.token, true);
          onClose();
        } else {
          setErrorMsg(data.error || 'Registration failed.');
        }
      }
    } catch (err: any) {
      setErrorMsg('Network error connecting to Earth One security gateway.');
    } finally {
      setIsLoading(false);
    }
  };

  // 1-Click quick test citizens for testing cross-border nodes
  const handleQuickDemoLogin = async (username: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: username,
          password: 'password123'
        })
      });
      const data = await res.json();
      if (data.success && data.user) {
        onAuthSuccess(data.user, data.token, false);
        onClose();
      } else {
        setErrorMsg(data.error || 'Quick login failed.');
      }
    } catch (err) {
      setErrorMsg('Failed to log in demo account.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative space-y-5 p-6 sm:p-8 animate-in fade-in duration-200">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white cursor-pointer transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 p-0.5 mx-auto shadow-lg shadow-cyan-500/20">
            <div className="w-full h-full bg-[#030712] rounded-[14px] flex items-center justify-center">
              <Globe2 className="w-6 h-6 text-cyan-400" />
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-100 font-serif">
              {mode === 'login' ? 'Citizen Sign In' : 'Join EARTH ONE'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              ONE EARTH. ONE WORLD. ONE HUMANITY.
            </p>
          </div>
        </div>

        {/* Tabs: Sign In / Register */}
        <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg(null);
            }}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              mode === 'login'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sign In (登录)
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMsg(null);
            }}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              mode === 'register'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Register (新公民注册)
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {mode === 'login' ? (
            <>
              <div>
                <label className="block text-slate-400 mb-1">Email or Username</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={emailOrUsername}
                    onChange={e => setEmailOrUsername(e.target.value)}
                    placeholder="e.g. li_wei or citizen@earthone.world"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-slate-400 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={registerEmail}
                    onChange={e => setRegisterEmail(e.target.value)}
                    placeholder="your.name@domain.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Display Name</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="e.g. Sophia Chen"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Username (@)</label>
                  <input
                    type="text"
                    required
                    value={registerUsername}
                    onChange={e => setRegisterUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="sophia_chen"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-slate-400 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full pl-9 pr-9 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center space-x-1.5 mt-2"
          >
            <span>{isLoading ? 'Processing...' : mode === 'login' ? 'Sign In to Earth One' : 'Register & Setup Profile'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        {/* Demo Fast Login Pills */}
        <div className="pt-3 border-t border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Fast Demo Sign-In (Preset Citizens):</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'li_wei', label: 'Li Wei (CN 🇨🇳)' },
              { id: 'sarah_sky', label: 'Sarah (US 🇺🇸)' },
              { id: 'tariq_amman', label: 'Tariq (JO 🇯🇴)' },
              { id: 'noura_riyadh', label: 'Noura (SA 🇸🇦)' },
              { id: 'julien_paris', label: 'Julien (FR 🇫🇷)' },
              { id: 'dmitry_spb', label: 'Dmitry (RU 🇷🇺)' }
            ].map(demo => (
              <button
                key={demo.id}
                type="button"
                onClick={() => handleQuickDemoLogin(demo.id)}
                className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-cyan-300 cursor-pointer transition-colors"
              >
                {demo.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-center text-[11px] text-slate-500 flex items-center justify-center space-x-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Encrypted with SHA-256 & Server-Side Security</span>
        </div>
      </div>
    </div>
  );
};
