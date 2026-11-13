import React, { useState } from 'react';
import { User, Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import { WORLD_COUNTRIES, PRESET_AVATARS, resolveCoordinates } from '../../utils/geoData.ts';
import {
  Globe2,
  MapPin,
  Sparkles,
  Camera,
  Check,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Compass,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';

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
  const t = translations[lang];

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form states
  const [username, setUsername] = useState(user.username || '');
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [avatar, setAvatar] = useState(user.avatar || PRESET_AVATARS[0]);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [showCustomAvatarInput, setShowCustomAvatarInput] = useState(false);

  // Location states
  const [countryCode, setCountryCode] = useState(user.location?.countryCode || 'CN');
  const [cityName, setCityName] = useState(user.location?.cityName || 'Beijing');
  const [isPublic, setIsPublic] = useState(user.location?.isPublic ?? true);

  // Bio & interests
  const [bio, setBio] = useState(user.bio || 'Exploring connections across humanity.');
  const [selectedInterests, setSelectedInterests] = useState<string[]>(
    user.interests && user.interests.length > 0
      ? user.interests
      : ['Global Peace', 'Languages', 'Astronomy']
  );

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentCountry = WORLD_COUNTRIES.find(c => c.code === countryCode) || WORLD_COUNTRIES[0];

  const availableInterests = [
    'Architecture',
    'Astronomy',
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
    const coords = resolveCoordinates(countryCode, cityName);

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
    } catch (err) {
      setErrorMsg('Network error saving citizen profile.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl space-y-6 p-6 sm:p-8 animate-in fade-in duration-300">
        {/* Top Progress Indicator */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-cyan-400">
            <span className="flex items-center space-x-1.5">
              <Globe2 className="w-4 h-4" />
              <span>CITIZEN ONBOARDING PROTOCOL</span>
            </span>
            <span>Step {step} of 3</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}

        {/* STEP 1: IDENTITY & AVATAR */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-slate-100 font-serif">
                Shape Your Planetary Identity
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Choose how you appear to fellow citizens across the digital globe.
              </p>
            </div>

            {/* Avatar Selection */}
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-300">
                Choose an Avatar
              </label>

              <div className="flex items-center space-x-4">
                <img
                  src={avatar}
                  alt="Selected avatar"
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-cyan-400 shadow-lg shadow-cyan-500/20 shrink-0"
                />
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 flex-1">
                  {PRESET_AVATARS.map((av, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setAvatar(av)}
                      className={`relative rounded-xl overflow-hidden aspect-square border cursor-pointer transition-all ${
                        avatar === av ? 'border-cyan-400 ring-2 ring-cyan-500/50 scale-105' : 'border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <img src={av} alt="Preset" className="w-full h-full object-cover" />
                      {avatar === av && (
                        <div className="absolute inset-0 bg-cyan-500/30 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Image URL option */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowCustomAvatarInput(!showCustomAvatarInput)}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                >
                  {showCustomAvatarInput ? 'Use Presets' : 'Or enter custom avatar image URL'}
                </button>
                {showCustomAvatarInput && (
                  <div className="mt-2 flex items-center space-x-2">
                    <input
                      type="url"
                      value={customAvatarUrl}
                      onChange={e => setCustomAvatarUrl(e.target.value)}
                      placeholder="https://..."
                      className="flex-1 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (customAvatarUrl.trim()) setAvatar(customAvatarUrl.trim());
                      }}
                      className="px-3 py-1.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs"
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Names */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. Li Wei or Sarah Sky"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Username (@)</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="citizen_handle"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="button"
                disabled={!displayName.trim() || !username.trim()}
                onClick={() => setStep(2)}
                className="flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs shadow-lg transition-all cursor-pointer"
              >
                <span>Continue to Location</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: LOCATION & 3D EARTH BEACON */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-slate-100 font-serif">
                Anchor Your Beacon on Earth
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Your country and city determine where your light node shines on the 3D globe.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Country</label>
                <select
                  value={countryCode}
                  onChange={e => handleCountryChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  {WORLD_COUNTRIES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.nativeName} ({c.name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">City</label>
                {currentCountry.cities.length > 0 ? (
                  <select
                    value={cityName}
                    onChange={e => setCityName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-500"
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
                    placeholder="Enter your city name"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                )}
              </div>
            </div>

            {/* Public/Private Earth Node Toggle */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  {isPublic ? (
                    <Eye className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <EyeOff className="w-5 h-5 text-amber-400" />
                  )}
                  <div>
                    <span className="block text-xs font-semibold text-slate-200">
                      Pin Light Beacon on 3D Earth
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {isPublic
                        ? 'Your city node will shine as a living dot on the globe.'
                        : 'Your coordinates will remain private and hidden from the globe.'}
                    </span>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={e => setIsPublic(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>

              {/* Beacon Preview Badge */}
              {isPublic && (
                <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-800/50 flex items-center space-x-3 text-xs text-cyan-300">
                  <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                  <span>
                    Beacon will anchor at{' '}
                    <span className="font-semibold text-white">
                      {cityName}, {currentCountry.name}
                    </span>{' '}
                    (
                    {resolveCoordinates(countryCode, cityName).lat.toFixed(2)}°,{' '}
                    {resolveCoordinates(countryCode, cityName).lng.toFixed(2)}°)
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg transition-all cursor-pointer"
              >
                <span>Continue to Bio</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: PERSPECTIVE & INTERESTS */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-slate-100 font-serif">
                Share Your Voice & Interests
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Help other citizens discover what drives your mind and creativity.
              </p>
            </div>

            {/* Bio textarea */}
            <div className="text-xs">
              <label className="block text-slate-400 mb-1">Bio / Personal Perspective</label>
              <textarea
                rows={3}
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="What is your philosophy, craft, or curiosity?..."
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-500 resize-none"
              />
            </div>

            {/* Interests Tag Cloud */}
            <div className="space-y-2 text-xs">
              <label className="block text-slate-400">Select Cultural & Intellectual Interests</label>
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
                          ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold shadow-md'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      #{item}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={handleFinalSubmit}
                className="flex items-center space-x-1.5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-bold text-xs shadow-xl transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isLoading ? 'Anchoring Node...' : 'Launch into Earth One!'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
