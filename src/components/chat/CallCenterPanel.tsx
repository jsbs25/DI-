import React, { useMemo, useState } from 'react';
import type { Conversation, Language } from '../../types/index.ts';
import {
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  MessageCircle,
  RefreshCw,
  CheckCheck,
  ShieldCheck,
  Info,
} from 'lucide-react';

export interface CallLogEntry {
  id: string;
  scope: 'direct' | 'group';
  kind: 'audio' | 'video';
  direction?: 'outgoing' | 'incoming';
  durationSec?: number;
  unreadMissed?: boolean;
  conversationId?: string | null;
  initiatorId: string;
  participantIds: string[];
  users?: Array<{ id: string; displayName: string; username?: string; avatar?: string; isOnline?: boolean }>;
  status: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
  endReason?: string | null;
}

export interface CallCapabilitiesSummary {
  mode: 'livekit' | 'webrtc-p2p';
  livekitConfigured: boolean;
  livekitHealthy: boolean;
  turnConfigured: boolean;
  turnTlsConfigured: boolean;
  stunCount: number;
  backgroundCapabilities?: {
    web?: { reliableInBackground: boolean; reason: string };
    pwa?: { reliableInBackground: boolean; reason: string };
    nativeIos?: { supported: boolean; mechanism: string; status: string };
    nativeAndroid?: { supported: boolean; mechanism: string; status: string };
  };
}

interface FriendLite {
  id: string;
  username?: string;
  displayName: string;
  avatar: string;
  isOnline?: boolean;
  lastActiveAt?: string;
}

interface CallCenterPanelProps {
  currentUserId: string;
  lang: Language;
  callLogs: CallLogEntry[];
  missedUnreadCount: number;
  capabilities: CallCapabilitiesSummary | null;
  friends: FriendLite[];
  recentConvs: Conversation[];
  conversations: Conversation[];
  loading: boolean;
  callAction: string | null;
  onRefresh: () => void;
  onMarkMissedSeen: () => void;
  onStartCall: (kind: 'audio' | 'video', target: { targetUserId?: string; conversationId?: string }) => void;
  onOpenChat: (userId?: string, conversationId?: string | null) => void;
}

function formatCallDuration(sec?: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  if (s <= 0) return '';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function formatShortTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return '';
  }
}

export const CallCenterPanel: React.FC<CallCenterPanelProps> = ({
  currentUserId,
  lang,
  callLogs,
  missedUnreadCount,
  capabilities,
  friends,
  recentConvs,
  conversations,
  loading,
  callAction,
  onRefresh,
  onMarkMissedSeen,
  onStartCall,
  onOpenChat,
}) => {
  const [subFilter, setSubFilter] = useState<'all' | 'missed' | 'contacts'>('all');
  const [showBgNote, setShowBgNote] = useState(false);

  const L = (zh: string, en: string, ar: string) => (lang === 'ar' ? ar : lang === 'en' ? en : zh);

  const contacts = useMemo(() => {
    const map = new Map<string, FriendLite & { conversationId?: string }>();
    for (const f of friends) {
      if (f.id && f.id !== currentUserId) {
        map.set(f.id, { ...f });
      }
    }
    for (const c of [...conversations, ...recentConvs]) {
      if (c.type === 'direct' && c.otherUser?.id && c.otherUser.id !== currentUserId) {
        const existing = map.get(c.otherUser.id);
        map.set(c.otherUser.id, {
          id: c.otherUser.id,
          username: c.otherUser.username,
          displayName: c.otherUser.displayName || c.name,
          avatar: c.otherUser.avatar || c.avatar || '',
          isOnline: c.otherUser.isOnline ?? c.isOnline,
          conversationId: c.id,
          ...(existing || {}),
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => Number(!!b.isOnline) - Number(!!a.isOnline));
  }, [friends, conversations, recentConvs, currentUserId]);

  const visibleLogs = useMemo(() => {
    if (subFilter === 'missed') {
      return callLogs.filter((c) => c.status === 'missed');
    }
    return callLogs;
  }, [callLogs, subFilter]);

  const statusTextFor = (c: CallLogEntry) => {
    const dur = formatCallDuration(c.durationSec);
    if (c.status === 'missed') return c.initiatorId === currentUserId ? L('对方未接', 'No answer', 'لا رد') : L('未接来电', 'Missed call', 'مكالمة فائتة');
    if (c.status === 'rejected') return L('已拒绝', 'Declined', 'مرفوضة');
    if (c.status === 'canceled') return L('已取消', 'Canceled', 'أُلغيت');
    if (c.status === 'busy') return L('对方忙线', 'Busy', 'مشغول');
    if (c.status === 'ended') return dur ? `${L('通话时长', 'Duration', 'المدة')} ${dur}` : L('已结束', 'Ended', 'انتهت');
    if (['ringing', 'connecting', 'active', 'reconnecting'].includes(c.status)) return L('进行中', 'Active', 'جارية');
    return L('已完成', 'Completed', 'مكتملة');
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-2.5 min-h-0 pr-0.5">
      {/* Compact ONE Communication status card */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>ONE Communication</span>
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {capabilities?.mode === 'livekit'
                ? L('LiveKit SFU 实时音视频已就绪', 'LiveKit SFU Ready', 'LiveKit جاهز')
                : L('WebRTC P2P + 加密语音中继模式', 'WebRTC P2P + Encrypted Relay', 'WebRTC P2P + مرحل مشفر')}
              <span aria-hidden="true"> · </span>
              {capabilities?.turnTlsConfigured
                ? 'TURN/TLS'
                : capabilities?.turnConfigured
                  ? 'TURN Relay'
                  : `STUN (${capabilities?.stunCount ?? 5})`}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setShowBgNote((v) => !v)}
              className="min-h-[32px] min-w-[32px] rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] inline-flex items-center justify-center"
              title={L('后台来电能力说明', 'Background call limits', 'قيود الخلفية')}
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="min-h-[32px] px-2 rounded-lg border border-slate-200 dark:border-white/10 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] inline-flex items-center gap-1 disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>{L('刷新', 'Refresh', 'تحديث')}</span>
            </button>
          </div>
        </div>

        {showBgNote && (
          <div className="rounded-lg bg-slate-50 dark:bg-black/25 border border-slate-200/80 dark:border-white/10 p-2.5 text-[11px] text-slate-600 dark:text-slate-300 space-y-1 leading-relaxed">
            <p>{L('网页/PWA 在线期间可实时响铃接听；浏览器关闭或系统后台挂起后受限于沙盒无法保证唤醒来电。', 'Web/PWA rings while active; closed browser tabs cannot reliably wake incoming calls.', 'يرن الويب/PWA أثناء النشاط؛ لا يمكنه إيقاظ المكالمات بعد إغلاق المتصفح.')}</p>
            <p className="text-slate-500 dark:text-slate-400">
              {L('原生端唤醒通道：', 'Native wake channels: ', 'قنوات النظام: ')}
              iOS CallKit / APNs VoIP · Android FCM + Foreground Service
            </p>
          </div>
        )}
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.05] text-xs">
        <button
          type="button"
          onClick={() => setSubFilter('all')}
          className={`flex-1 min-h-[34px] px-2 rounded-lg font-medium whitespace-nowrap transition-colors ${subFilter === 'all' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
        >
          {L('全部记录', 'Recent', 'الكل')}
        </button>
        <button
          type="button"
          onClick={() => {
            setSubFilter('missed');
            if (missedUnreadCount > 0) onMarkMissedSeen();
          }}
          className={`flex-1 min-h-[34px] px-2 rounded-lg font-medium whitespace-nowrap transition-colors inline-flex items-center justify-center gap-1 ${subFilter === 'missed' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
        >
          <span>{L('未接来电', 'Missed', 'فائتة')}</span>
          {missedUnreadCount > 0 && (
            <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 tabular-nums">({missedUnreadCount})</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setSubFilter('contacts')}
          className={`flex-1 min-h-[34px] px-2 rounded-lg font-medium whitespace-nowrap transition-colors ${subFilter === 'contacts' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
        >
          {L('联系人呼叫', 'Contacts', 'جهات الاتصال')}
        </button>
      </div>

      {subFilter === 'missed' && missedUnreadCount > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onMarkMissedSeen}
            className="text-[11px] text-sky-600 dark:text-sky-300 inline-flex items-center gap-1 px-2 py-1"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>{L('全部标为已查看', 'Mark missed viewed', 'تعيين كمقروء')}</span>
          </button>
        </div>
      )}

      {/* Call history list */}
      {subFilter !== 'contacts' && (
        <div className="space-y-2">
          {visibleLogs.map((c) => {
            const peerId = (c.participantIds || []).find((id) => id !== currentUserId) || '';
            const peer =
              c.users?.find((u) => u.id === peerId) ||
              friends.find((f) => f.id === peerId);
            const conv = c.conversationId ? conversations.find((cv) => cv.id === c.conversationId) : undefined;
            const title =
              c.scope === 'group'
                ? conv?.name || L('群组通话', 'Group Call', 'مكالمة جماعية')
                : peer?.displayName || peerId.slice(0, 8) || L('未知联系人', 'Contact', 'جهة اتصال');
            const avatar = peer?.avatar || conv?.avatar || '';
            const isMissedIncoming = c.status === 'missed' && c.initiatorId !== currentUserId;
            const isOutgoing = c.initiatorId === currentUserId;

            return (
              <div
                key={c.id}
                className={`p-3 rounded-xl border transition-colors ${c.unreadMissed ? 'border-rose-200 bg-rose-50/50 dark:border-rose-500/30 dark:bg-rose-500/[0.07]' : 'border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.02]'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    {avatar ? (
                      <img src={avatar} alt={title} className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-white/10" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-500">
                        <Phone className="w-4 h-4" />
                      </div>
                    )}
                    {peer?.isOnline && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-slate-950" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm font-semibold truncate ${isMissedIncoming ? 'text-rose-600 dark:text-rose-300' : 'text-slate-900 dark:text-slate-100'}`}>
                        {title}
                      </p>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
                        {formatShortTime(c.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                      {c.status === 'missed' ? (
                        <PhoneMissed className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      ) : isOutgoing ? (
                        <PhoneOutgoing className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                      ) : (
                        <PhoneIncoming className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      )}
                      <span>{c.kind === 'video' ? L('视频', 'Video', 'فيديو') : L('语音', 'Audio', 'صوت')}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{statusTextFor(c)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1.5 mt-2.5 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
                  {c.conversationId && (
                    <button
                      type="button"
                      onClick={() => onOpenChat(peerId, c.conversationId)}
                      className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.06] text-[11px] inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>{L('发消息', 'Message', 'رسالة')}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!!callAction || (!peerId && !c.conversationId)}
                    onClick={() => onStartCall('audio', c.scope === 'group' ? { conversationId: c.conversationId || undefined } : { targetUserId: peerId, conversationId: c.conversationId || undefined })}
                    className="min-h-[34px] px-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:border-emerald-500/35 dark:text-emerald-300 text-[11px] font-medium inline-flex items-center gap-1 disabled:opacity-40 whitespace-nowrap"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>{L('语音', 'Audio', 'صوت')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={!!callAction || (!peerId && !c.conversationId)}
                    onClick={() => onStartCall('video', c.scope === 'group' ? { conversationId: c.conversationId || undefined } : { targetUserId: peerId, conversationId: c.conversationId || undefined })}
                    className="min-h-[34px] px-2.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 dark:bg-sky-500/15 dark:border-sky-500/35 dark:text-sky-300 text-[11px] font-medium inline-flex items-center gap-1 disabled:opacity-40 whitespace-nowrap"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>{L('视频', 'Video', 'فيديو')}</span>
                  </button>
                </div>
              </div>
            );
          })}

          {visibleLogs.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/10 py-10 px-4 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
              <p>{subFilter === 'missed' ? L('暂无未接来电记录', 'No missed calls', 'لا توجد مكالمات فائتة') : L('暂无通话记录', 'No recent calls', 'لا توجد مكالمات حديثة')}</p>
              <button
                type="button"
                onClick={() => setSubFilter('contacts')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>{L('选择联系人发起通话', 'Call a contact', 'اتصل بجهة اتصال')}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Quick contacts dialer */}
      {subFilter === 'contacts' && (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="flex items-center justify-between gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02]"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="relative shrink-0">
                  <img src={contact.avatar} alt={contact.displayName} className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-white/10" />
                  {contact.isOnline && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-slate-950" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{contact.displayName}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {contact.username ? `@${contact.username}` : ''}{contact.username ? ' · ' : ''}{contact.isOnline ? L('在线', 'Online', 'متصل') : L('离线', 'Offline', 'غير متصل')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={!!callAction}
                  onClick={() => onStartCall('audio', { targetUserId: contact.id, conversationId: contact.conversationId })}
                  className="min-h-[38px] min-w-[38px] px-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:border-emerald-500/35 dark:text-emerald-300 inline-flex items-center justify-center gap-1 text-xs font-medium disabled:opacity-40"
                  title={L('语音通话', 'Audio call', 'مكالمة صوتية')}
                >
                  <Phone className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={!!callAction}
                  onClick={() => onStartCall('video', { targetUserId: contact.id, conversationId: contact.conversationId })}
                  className="min-h-[38px] min-w-[38px] px-2.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 dark:bg-sky-500/15 dark:border-sky-500/35 dark:text-sky-300 inline-flex items-center justify-center gap-1 text-xs font-medium disabled:opacity-40"
                  title={L('视频通话', 'Video call', 'مكالمة فيديو')}
                >
                  <Video className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {contacts.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/10 py-10 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
              {L('暂无好友或私聊联系人，请先在“找人”中添加好友。', 'No contacts yet. Add friends first.', 'لا توجد جهات اتصال بعد.')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
