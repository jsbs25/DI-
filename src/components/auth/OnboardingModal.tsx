import React, { useState } from 'react';
import { User, Language } from '../../types/index.ts';
import { WORLD_COUNTRIES, PRESET_AVATARS, resolveCoordinates } from '../../utils/geoData.ts';
import {
  Check,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  CheckCircle2,
  MapPin,
} from 'lucide-react';
import { ParadiseBrandEmblem } from '../brand/ParadiseBrandEmblem.tsx';

interface OnboardingModalProps {
  isOpen: boolean;
  user: User;
  onComplete: (updatedUser: User) => void;
  lang: Language;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  user,
  onComplete,
  lang
}) => {
  const isZh = lang === 'zh';
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [username, setUsername] = useState(user.username || '');
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [avatar, setAvatar] = useState(user.avatar || PRESET_AVATARS[0]);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [showCustomAvatarInput, setShowCustomAvatarInput] = useState(false);

  const [countryCode, setCountryCode] = useState(user.location?.countryCode || 'CN');
  const [cityName, setCityName] = useState(user.location?.cityName || 'Beijing');
  const [isPublic, setIsPublic] = useState(user.location?.isPublic ?? true);

  const [bio, setBio] = useState(user.bio || 'Exploring connections across humanity.');
  const [selectedInterests, setSelectedInterests] = useState<string[]>(
    user.interests && user.interests.length > 0
      ? user.interests
      : ['Architecture', 'Languages', 'Music']
  );

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentCountry = WORLD_COUNTRIES.find(c => c.code === countryCode) || WORLD_COUNTRIES[0];

  const availableInterests = [
    'Architecture',
    'Botany & Nature',
    'AI Hub',
    'Languages',
    'Tea & Coffee Culture',
    'Literature',
    'Philosophy',
    'Chess',
    'Renewable Energy',
    'Photography',
    'Digital Art',
    'Music',
    'Global Travel'
  ];

  const toggleInterest = (item: string) => {
    setSelectedInterests(prev =>
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
  };

  const handleCountryChange = (code: string) => {
    setCountryCode(code);
    const country = WORLD_COUNTRIES.find(c => c.code === code);
    if (country && country.cities.length > 0) {
      setCityName(country.cities[0].name);
    }
  };

  const handleFinalSubmit = async () => {
    setIsLoading(true);
    setErrorMsg(null);

    const countryName = currentCountry.name;

    try {
      const res = await fetch('/api/auth/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          displayName,
          avatar,
          countryCode,
          countryName,
          cityName,
          isPublic,
          bio,
          interests: selectedInterests
        })
      });

      const data = await res.json();
      if (data.success && data.user) {
        onComplete(data.user);
      } else {
        setErrorMsg(data.error || 'Failed to complete profile setup.');
      }
    } catch {
      setErrorMsg('Network error saving profile.');
    } finally {
      setIsLoading(false);
    }
  };

  const fieldCls =
    'w-full px-3.5 py-2.5 rounded-xl bg-[#f3eee4]/80 dark:bg-[#0c141d]/80 border border-[#244e41]/16 dark:border-[#d6b77f]/18 text-[#1d2e26] dark:text-[#f5f1e8] focus:outline-none focus:border-[#247864] dark:focus:border-[#d6b77f] transition-colors';

  return (
    <div className="fixed inset-0 z-50 bg-[#0c171d]/68 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain">
      <div className="w-full max-w-xl max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain bg-[#faf7f0]/97 dark:bg-[#121c27]/97 border border-[#244e41]/18 dark:border-[#d6b77f]/22 rounded-[28px] shadow-[0_24px_80px_rgba(12,24,18,0.4)] space-y-5 sm:space-y-6 p-5 sm:p-8 animate-in fade-in duration-300">
        {/* Top Progress Indicator */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[#247864] dark:text-[#d6b77f]">
            <span className="flex items-center gap-2.5">
              <span className="dark:hidden">
                <ParadiseBrandEmblem variant="medallion" size={28} surface="light" />
              </span>
              <span className="hidden dark:inline-flex">
                <ParadiseBrandEmblem variant="medallion" size={28} surface="dark" />
              </span>
              <span className="font-medium tracking-[0.16em] uppercase">
                {isZh ? '天堂花园 · 初始档案' : 'PARADISE WORLD · PROFILE'}
              </span>
            </span>
            <span className="text-[11px] text-[#5e7368] dark:text-[#96a6ae]">
              {isZh ? `第 ${step} / 3 步` : `Step ${step} of 3`}
            </span>
          </div>
          <div className="w-full h-1.5 bg-[#e8e1d3] dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#247864] to-[#c4a876] transition-all duration-300"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}

        {/* STEP 1: IDENTITY & AVATAR */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-[#1d2e26] dark:text-[#f5f1e8] font-serif">
                {isZh ? '建立你的花园身份' : 'Shape Your Identity'}
              </h2>
              <p className="text-xs text-[#5d7166] dark:text-[#98a8b0] mt-1">
                {isZh ? '选择头像与称呼，让世界上的伙伴认出你。' : 'Choose how you appear to fellow guests across EARTH ONE.'}
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-medium text-[#3b5046] dark:text-[#c7d1d6]">
                {isZh ? '选择头像' : 'Choose an Avatar'}
              </label>

              <div className="flex items-center space-x-4">
                <img
                  src={avatar}
                  alt="Selected avatar"
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-[#247864] dark:border-[#d6b77f] shadow-md shrink-0"
                />
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 flex-1">
                  {PRESET_AVATARS.map((av, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setAvatar(av)}
                      className={`relative rounded-xl overflow-hidden aspect-square border cursor-pointer transition-all ${
                        avatar === av
                          ? 'border-[#247864] dark:border-[#d6b77f] ring-2 ring-[#247864]/35 dark:ring-[#d6b77f]/40 scale-105'
                          : 'border-[#244e41]/15 dark:border-white/12 hover:border-[#247864]/50'
                      }`}
                    >
                      <img src={av} alt="Preset" className="w-full h-full object-cover" />
                      {avatar === av && (
                        <div className="absolute inset-0 bg-[#244e41]/40 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowCustomAvatarInput(!showCustomAvatarInput)}
                  className="text-[11px] text-[#247864] dark:text-[#d6b77f] hover:underline cursor-pointer"
                >
                  {showCustomAvatarInput
                    ? (isZh ? '使用预设头像' : 'Use Presets')
                    : (isZh ? '或输入自定义头像图片链接' : 'Or enter custom avatar image URL')}
                </button>
                {showCustomAvatarInput && (
                  <div className="mt-2 flex items-center space-x-2">
                    <input
                      type="url"
                      value={customAvatarUrl}
                      onChange={e => setCustomAvatarUrl(e.target.value)}
                      placeholder="https://..."
                      className={`flex-1 py-1.5 text-xs ${fieldCls}`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (customAvatarUrl.trim()) setAvatar(customAvatarUrl.trim());
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#244e41] dark:bg-[#e5d9be] text-[#faf7f0] dark:text-[#141e28] font-semibold text-xs cursor-pointer"
                    >
                      {isZh ? '应用' : 'Apply'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[#53685d] dark:text-[#96a6ae] mb-1">{isZh ? '显示昵称' : 'Display Name'}</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder={isZh ? '例如：林栖 / Sarah' : 'e.g. Li Wei or Sarah'}
                  className={fieldCls}
                />
              </div>

              <div>
                <label className="block text-[#53685d] dark:text-[#96a6ae] mb-1">{isZh ? '用户名 (@)' : 'Username (@)'}</label>
                <input
                  type="text"
                  required
                  maxLength={40}
                  value={username}
                  onChange={e => setUsername(e.target.value.replace(/[\r\n\t\u0000-\u001F\u007F]/g, ''))}
                  placeholder="Username"
                  className={fieldCls}
                />
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="button"
                disabled={!displayName.trim() || !username.trim()}
                onClick={() => setStep(2)}
                className="flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-[#244e41] hover:bg-[#1c3f34] dark:bg-[#e5d9be] dark:hover:bg-[#f0e6d0] disabled:opacity-40 text-[#faf7f0] dark:text-[#141e28] font-semibold text-xs shadow-md transition-all cursor-pointer"
              >
                <span>{isZh ? '下一步：所在城市' : 'Continue to Location'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: LOCATION */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-[#1d2e26] dark:text-[#f5f1e8] font-serif">
                {isZh ? '设置你的所在时区与城市' : 'Set Your Home Sanctuary'}
              </h2>
              <p className="text-xs text-[#5d7166] dark:text-[#98a8b0] mt-1">
                {isZh ? '用于同步当地昼夜节律，以及在社交与社区中展示你的坐标。' : 'Aligns your local daylight rhythm and optional public presence.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[#53685d] dark:text-[#96a6ae] mb-1">{isZh ? '国家 / 地区' : 'Country'}</label>
                <select
                  value={countryCode}
                  onChange={e => handleCountryChange(e.target.value)}
                  className={fieldCls}
                >
                  {WORLD_COUNTRIES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.nativeName} ({c.name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#53685d] dark:text-[#96a6ae] mb-1">{isZh ? '城市' : 'City'}</label>
                {currentCountry.cities.length > 0 ? (
                  <select
                    value={cityName}
                    onChange={e => setCityName(e.target.value)}
                    className={fieldCls}
                  >
                    {currentCountry.cities.map(ct => (
                      <option key={ct.name} value={ct.name}>
                        {ct.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={cityName}
                    onChange={e => setCityName(e.target.value)}
                    placeholder={isZh ? '输入城市名称' : 'Enter your city name'}
                    className={fieldCls}
                  />
                )}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#f3eee4]/80 dark:bg-[#0c141d]/75 border border-[#244e41]/14 dark:border-white/10 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center space-x-2.5">
                  {isPublic ? (
                    <Eye className="w-5 h-5 text-[#247864] dark:text-[#d6b77f]" />
                  ) : (
                    <EyeOff className="w-5 h-5 text-[#8a7752] dark:text-amber-300" />
                  )}
                  <div>
                    <span className="block text-xs font-semibold text-[#1d2e26] dark:text-[#f5f1e8]">
                      {isZh ? '公开所在城市坐标' : 'Share City Location'}
                    </span>
                    <span className="text-[11px] text-[#5e7368] dark:text-[#96a6ae]">
                      {isPublic
                        ? (isZh ? '其他成员可以看到你的城市并交流。' : 'Your city will appear on your public profile.')
                        : (isZh ? '你的位置将保持私密，不会对外展示。' : 'Your coordinates remain private and hidden.')}
                    </span>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={e => setIsPublic(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-[#d6cfc0] dark:bg-white/15 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#244e41]/15 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#247864] dark:peer-checked:bg-[#c4a876]"></div>
                </label>
              </div>

              {isPublic && (
                <div className="p-2.5 rounded-xl bg-[#247864]/10 dark:bg-[#d6b77f]/12 border border-[#247864]/20 dark:border-[#d6b77f]/22 flex items-center space-x-2.5 text-xs text-[#21594b] dark:text-[#ebd8b0]">
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span>
                    <span className="font-semibold">
                      {cityName}, {currentCountry.name}
                    </span>{' '}
                    ({resolveCoordinates(countryCode, cityName).lat.toFixed(2)}°,{' '}
                    {resolveCoordinates(countryCode, cityName).lng.toFixed(2)}°)
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#efe9dc] dark:bg-white/[0.06] text-[#3c5046] dark:text-[#c7d1d6] text-xs font-medium cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{isZh ? '上一步' : 'Back'}</span>
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-[#244e41] hover:bg-[#1c3f34] dark:bg-[#e5d9be] dark:hover:bg-[#f0e6d0] text-[#faf7f0] dark:text-[#141e28] font-semibold text-xs shadow-md transition-all cursor-pointer"
              >
                <span>{isZh ? '下一步：兴趣与简介' : 'Continue to Bio'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: PERSPECTIVE & INTERESTS */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-[#1d2e26] dark:text-[#f5f1e8] font-serif">
                {isZh ? '分享你的兴趣与灵感' : 'Share Your Voice & Interests'}
              </h2>
              <p className="text-xs text-[#5d7166] dark:text-[#98a8b0] mt-1">
                {isZh ? '帮助同好与花园向导更懂你的探索方向。' : 'Helps fellow explorers and your garden guide personalize your space.'}
              </p>
            </div>

            <div className="text-xs">
              <label className="block text-[#53685d] dark:text-[#96a6ae] mb-1">{isZh ? '个人简介' : 'Bio / Personal Perspective'}</label>
              <textarea
                rows={3}
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder={isZh ? '写下你的好奇、热爱或生活理念…' : 'What is your philosophy, craft, or curiosity?...'}
                className={`${fieldCls} resize-none`}
              />
            </div>

            <div className="space-y-2 text-xs">
              <label className="block text-[#53685d] dark:text-[#96a6ae]">{isZh ? '选择感兴趣的话题' : 'Select Cultural & Intellectual Interests'}</label>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                {availableInterests.map(item => {
                  const isSelected = selectedInterests.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleInterest(item)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#244e41] dark:bg-[#e5d9be] text-[#faf7f0] dark:text-[#141e28] border-[#244e41] dark:border-[#e5d9be] font-semibold shadow-sm'
                          : 'bg-[#f3eee4]/80 dark:bg-[#0c141d]/75 text-[#495e54] dark:text-[#98a8b0] border-[#244e41]/14 dark:border-white/10 hover:border-[#247864]/40'
                      }`}
                    >
                      #{item}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#244e41]/12 dark:border-white/10">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#efe9dc] dark:bg-white/[0.06] text-[#3c5046] dark:text-[#c7d1d6] text-xs font-medium cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{isZh ? '上一步' : 'Back'}</span>
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={handleFinalSubmit}
                className="flex items-center space-x-1.5 px-6 py-2.5 rounded-xl bg-[#244e41] hover:bg-[#1c3f34] dark:bg-[#e5d9be] dark:hover:bg-[#f0e6d0] text-[#faf7f0] dark:text-[#141e28] font-semibold text-xs shadow-lg transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isLoading ? (isZh ? '正在进入…' : 'Entering…') : (isZh ? '步入天堂花园' : 'Enter Paradise World')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

