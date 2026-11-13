import React, { useState } from 'react';
import { User, Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import {
  X,
  MapPin,
  Sparkles,
  Users,
  DollarSign,
  Globe,
  MessageCircle,
  Eye,
  EyeOff,
  Check,
  Edit3
} from 'lucide-react';

interface UserProfileModalProps {
  user: User;
  currentUser: User | null;
  onClose: () => void;
  onFollow: (userId: string) => void;
  onDirectMessage: (user: User) => void;
  onUpdateProfile?: (data: Partial<User>) => void;
  lang: Language;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  currentUser,
  onClose,
  onFollow,
  onDirectMessage,
  onUpdateProfile,
  lang
}) => {
  const t = translations[lang];
  const isMe = user.id === currentUser?.id || user.id === 'current_user';

  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio);
  const [cityName, setCityName] = useState(user.location.cityName);
  const [isPublicLocation, setIsPublicLocation] = useState(user.location.isPublic);
  const [isFollowing, setIsFollowing] = useState(false);

  const handleSave = () => {
    if (onUpdateProfile) {
      onUpdateProfile({
        displayName,
        bio,
        location: {
          ...user.location,
          cityName,
          isPublic: isPublicLocation
        }
      });
    }
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(5,7,11,0.78)] backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[rgba(12,16,23,0.82)] border border-white/10 rounded-[28px] overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.4)] backdrop-blur-xl relative space-y-4">
        {/* Banner */}
        <div className="h-32 bg-gradient-to-r from-cyan-500/20 via-sky-500/10 to-transparent relative">
          {user.banner && (
            <img
              src={user.banner}
              alt="Profile banner"
              className="w-full h-full object-cover opacity-60"
            />
          )}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 rounded-xl border border-white/10 bg-black/30 text-slate-300 hover:text-white backdrop-blur-sm cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Avatar & Action Row */}
        <div className="px-6 relative -mt-12 flex items-end justify-between">
          <div className="relative">
            <img
              src={user.avatar}
              alt={user.displayName}
              className="w-20 h-20 rounded-2xl object-cover border-2 border-white/15 shadow-xl"
            />
            {user.isOnline && (
              <span className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
            )}
          </div>

          <div className="flex items-center space-x-2">
            {isMe ? (
              <button
                onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs cursor-pointer shadow-md"
              >
                {isEditing ? <Check className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                <span>{isEditing ? 'Save Profile' : 'Edit Profile'}</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    setIsFollowing(!isFollowing);
                    onFollow(user.id);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                    isFollowing
                      ? 'bg-white/[0.04] text-slate-300 border border-white/10'
                      : 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-md'
                  }`}
                >
                  {isFollowing ? t.following : t.follow}
                </button>
                <button
                  onClick={() => {
                    onDirectMessage(user);
                    onClose();
                  }}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-slate-200 text-xs font-medium cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>{t.directMessage}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* User Details */}
        <div className="px-6 pb-6 space-y-4">
          {isEditing ? (
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-black/20 border border-white/10 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">City</label>
                <input
                  type="text"
                  value={cityName}
                  onChange={e => setCityName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-black/20 border border-white/10 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Bio / Perspective</label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-black/20 border border-white/10 text-slate-100 resize-none"
                />
              </div>
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="locPublic"
                  checked={isPublicLocation}
                  onChange={e => setIsPublicLocation(e.target.checked)}
                  className="rounded border-slate-700"
                />
                <label htmlFor="locPublic" className="text-slate-300">
                  Publicly pin my city on the 3D Digital Globe
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-slate-100">{user.displayName}</h2>
                {user.verified && <Sparkles className="w-4 h-4 text-cyan-400 fill-cyan-400" />}
                <span className="text-xs font-mono text-slate-400">@{user.username}</span>
              </div>

              <div className="flex items-center space-x-3 text-xs text-slate-400">
                <span className="flex items-center space-x-1">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                  <span>
                    {user.location.cityName}, {user.location.countryName} ({user.location.countryCode})
                  </span>
                </span>
                <span>·</span>
                <span className="flex items-center space-x-1">
                  {user.location.isPublic ? (
                    <Eye className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <EyeOff className="w-3 h-3 text-amber-400" />
                  )}
                  <span>{user.location.isPublic ? 'Publicly Mapped' : 'Coordinates Private'}</span>
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed pt-1">
                {user.bio}
              </p>
            </div>
          )}

          {/* Interests Tags */}
          {user.interests && user.interests.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {user.interests.map((interest, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 text-[11px] font-medium text-cyan-300 border border-slate-700/60"
                >
                  #{interest}
                </span>
              ))}
            </div>
          )}

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800/80 text-center text-xs">
            <div className="p-2 rounded-xl bg-white/[0.03] border border-white/10">
              <span className="block font-mono font-bold text-slate-100">{user.followersCount}</span>
              <span className="text-[11px] text-slate-500">Followers</span>
            </div>
            <div className="p-2 rounded-xl bg-white/[0.03] border border-white/10">
              <span className="block font-mono font-bold text-slate-100">{user.followingCount}</span>
              <span className="text-[11px] text-slate-500">Following</span>
            </div>
            <div className="p-2 rounded-xl bg-white/[0.03] border border-white/10">
              <span className="block font-mono font-bold text-emerald-400">${user.tipsReceived}</span>
              <span className="text-[11px] text-slate-500">Tips Recv</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
