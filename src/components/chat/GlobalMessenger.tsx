import { getApiBase, wsUrl } from '../../apiBase.ts';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation, ChatMessage, User, Language, ChannelIntegration } from '../../types/index.ts';
import {
  Send, Languages, Sparkles, MessageCircle, Globe, Search, Plug, ShieldAlert,
  Users, UserPlus, Check, X, ImagePlus, Paperclip, Reply, Trash2, Undo2, MoreVertical,
  Wifi, WifiOff, RefreshCw, Info, Crown, Shield, LogOut, UserMinus, Settings2,
  Download, ChevronLeft, ChevronRight, FileText, AlertTriangle, Loader2, Eye,
  Bell, CheckCheck, User as UserIcon, Settings, Volume2, Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Monitor, MonitorOff
} from 'lucide-react';
import { callApi } from '../../services/calls/api.ts';
import { LiveKitCallSession, type CallMediaState, friendlyMediaError } from '../../services/calls/media.ts';

const CallTrackView: React.FC<{ track?: MediaStreamTrack | null; kind: 'video' | 'audio'; muted?: boolean; className?: string; mirror?: boolean }> = ({ track, kind, muted, className, mirror }) => {
  const ref = React.useRef<HTMLVideoElement & HTMLAudioElement | null>(null);
  React.useEffect(() => {
    const el = ref.current as any;
    if (!el) return;
    if (track) {
      try {
        const stream = new MediaStream([track]);
        if (el.srcObject !== stream) el.srcObject = stream;
        const p = el.play?.();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {}
    } else {
      try { el.srcObject = null; } catch {}
    }
    return () => { try { if (el) el.srcObject = null; } catch {} };
  }, [track]);
  if (kind === 'audio') return <audio ref={ref as any} autoPlay playsInline muted={!!muted} />;
  return <video ref={ref as any} autoPlay playsInline muted={!!muted} className={className} style={mirror ? { transform: 'scaleX(-1)' } : undefined} />;
};

interface GlobalMessengerProps {
  conversations: Conversation[];
  activeConversationId: string;
  onSelectConversation: (id: string) => void;
  currentUser: User | null;
  lang: Language;
  integrations?: ChannelIntegration[];
  onRefreshConversations?: () => Promise<void> | void;
  onUserUpdate?: (user: User) => void;
}

type FriendUser = { id: string; username: string; displayName: string; avatar: string; isOnline?: boolean; bio?: string; lastActiveAt?: string };
type FriendRequest = { id: string; fromUserId: string; toUserId: string; status: string; fromUser?: FriendUser; toUser?: FriendUser };

export const GlobalMessenger: React.FC<GlobalMessengerProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  currentUser,
  lang,
  integrations = [],
  onRefreshConversations,
  onUserUpdate
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const inFlightRef = useRef(false);
  const pendingClientIds = useRef<Set<string>>(new Set());

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [targetTranslateLang, setTargetTranslateLang] = useState('English');
  const [isSending, setIsSending] = useState(false);
  const [showOriginalMap, setShowOriginalMap] = useState<Record<string, boolean>>({});
  const [convQuery, setConvQuery] = useState('');
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'off' | 'connecting' | 'open' | 'closed'>('off');
  const [tab, setTab] = useState<'chats' | 'friends' | 'requests' | 'search' | 'msgsearch' | 'notifs' | 'privacy'>('chats');
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState<FriendUser[]>([]);
  const [msgQuery, setMsgQuery] = useState('');
  const [msgSender, setMsgSender] = useState('');
  const [msgConvId, setMsgConvId] = useState('');
  const [msgResults, setMsgResults] = useState<(ChatMessage & { conversationName?: string; conversationType?: string })[]>([]);
  const [msgSearching, setMsgSearching] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const [notifHasMore, setNotifHasMore] = useState(false);
  const [notifNextBefore, setNotifNextBefore] = useState<string | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<any>(null);
  const [notifPrefsDraft, setNotifPrefsDraft] = useState<any>(null);
  const [notifPrefsLoading, setNotifPrefsLoading] = useState(false);
  const [notifPrefsSaving, setNotifPrefsSaving] = useState(false);
  const [notifPrefsStatus, setNotifPrefsStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [notifPrefsError, setNotifPrefsError] = useState<string | null>(null);
  const notifPrefsSaveSeq = useRef(0);
  const notifAlertSeenRef = useRef<Map<string, number>>(new Map());
  const activeConvIdRef = useRef<string>(activeConversationId);
  const notifPrefsRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const notifSoundRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { activeConvIdRef.current = activeConversationId; }, [activeConversationId]);
  useEffect(() => { notifPrefsRef.current = notifPrefs; }, [notifPrefs]);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incomingReqs, setIncomingReqs] = useState<FriendRequest[]>([]);
  const [outgoingReqs, setOutgoingReqs] = useState<FriendRequest[]>([]);
  const [blocked, setBlocked] = useState<FriendUser[]>([]);
  const [privacy, setPrivacy] = useState<any>(null);
  const [privacyDraft, setPrivacyDraft] = useState<any>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privacyStatus, setPrivacyStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const privacySaveSeq = useRef(0);
  const privacyRef = useRef<any>(null);
  useEffect(() => { privacyRef.current = privacy; }, [privacy]);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [profileMode, setProfileMode] = useState<'view'|'edit'>('view');
  const [profileDraft, setProfileDraft] = useState<{ displayName: string; username: string; bio: string }>({ displayName: '', username: '', bio: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveState, setProfileSaveState] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const profileAvatarInputRef = useRef<HTMLInputElement>(null);
  const [recentConvs, setRecentConvs] = useState<Conversation[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingRequestIds, setPendingRequestIds] = useState<Set<string>>(new Set());
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const [groupDetail, setGroupDetail] = useState<any>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const typingSentRef = useRef(0);
  const lastSyncRef = useRef<string>(new Date().toISOString());
  const lastSyncCursorRef = useRef<{ since?: string; sinceId?: string } | null>(null);

  // Calls (EARTH ONE signaling; media transport gated server-side, no fake A/V)
  const [activeCall, setActiveCall] = useState<any>(null);
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [callAction, setCallAction] = useState<string | null>(null);
  const [callMediaNote, setCallMediaNote] = useState<string | null>(null);
  const [callDevices, setCallDevices] = useState<{ micEnabled: boolean; cameraEnabled: boolean; screenSharing: boolean }>({ micEnabled: true, cameraEnabled: true, screenSharing: false });
  const activeCallRef = useRef<any>(null);
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  const mediaSessionRef = useRef<LiveKitCallSession | null>(null);
  const mediaJoinedCallIdRef = useRef<string | null>(null);
  const mediaTokenRef = useRef<string | null>(null);
  const [mediaState, setMediaState] = useState<CallMediaState>({ phase: 'idle', canPlaybackAudio: false, participants: {} });
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localScreenRef = useRef<HTMLVideoElement | null>(null);

  type PendingUpload = { id: string; file: File; name: string; size: number; mimeType: string; kind: 'image' | 'file'; previewUrl?: string; progress: number; status: 'queued' | 'uploading' | 'sending' | 'error' | 'done'; error?: string; uploadedAttachment?: any };
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [lightbox, setLightbox] = useState<{ items: { url: string; name: string }[]; index: number } | null>(null);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const [dlState, setDlState] = useState<Record<string, 'downloading' | 'error' | 'done'>>({});
  const pendingUploadsRef = useRef<PendingUpload[]>([]);
  useEffect(() => { pendingUploadsRef.current = pendingUploads; }, [pendingUploads]);
  useEffect(() => () => { for (const p of pendingUploadsRef.current) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); }, []);

  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
  const ALLOWED_MIME = new Set(['image/png','image/jpeg','image/gif','image/webp','application/pdf','text/plain','application/zip','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
  const BLOCKED_EXTS = new Set(['.html','.htm','.svg','.xml','.js','.mjs','.cjs','.sh','.bat','.cmd','.ps1','.exe','.msi','.apk','.php','.jsp','.asp','.aspx']);
  const formatBytes = (n?: number) => {
    if (!n && n !== 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };
  const fileExt = (name: string) => { const m = /\.([a-zA-Z0-9]{1,10})$/.exec(name || ''); return m ? `.${m[1].toLowerCase()}` : ''; };
  const validateLocalFile = (file: File): string | null => {
    const ext = fileExt(file.name);
    if (ext && BLOCKED_EXTS.has(ext)) return '文件类型不允许';
    const mime = (file.type || '').toLowerCase();
    const allowedByMime = ALLOWED_MIME.has(mime) || (ext === '.docx' && mime === 'application/zip');
    const allowedByExt = ['.png','.jpg','.jpeg','.gif','.webp','.pdf','.txt','.zip','.doc','.docx'].includes(ext);
    if (!allowedByMime && !allowedByExt) return '文件类型不允许';
    if (file.size > MAX_UPLOAD_BYTES) return '文件过大（最大 10MB）';
    if (file.size <= 0) return '空文件';
    return null;
  };
  const authFileUrl = (url: string) => {
    if (!url) return url;
    try {
      const base = getApiBase();
      const absolute = base && url.startsWith('/') ? (base + url) : url;
      const u = new URL(absolute, base || window.location.origin);
      const t = token();
      if (t) u.searchParams.set('token', t);
      return u.toString();
    } catch { return url; }
  };
  const downloadAttachment = async (a: any) => {
    if (!a?.url) return;
    setDlState(s => ({ ...s, [a.id]: 'downloading' }));
    try {
      const res = await fetch(authFileUrl(`${a.url}?download=1`));
      if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error || '下载失败');
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href; link.download = a.name || 'file'; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setDlState(s => ({ ...s, [a.id]: 'done' }));
    } catch {
      setDlState(s => ({ ...s, [a.id]: 'error' }));
      setConnError('下载失败，可重试');
    }
  };

  const token = () => '';
  const authed = !!token();

  const sorted = useMemo(() => {
    const q = convQuery.trim().toLowerCase();
    return [...conversations]
      .filter(c => !q || c.name.toLowerCase().includes(q) || (c.lastMessage || '').toLowerCase().includes(q))
      .sort((a, b) => new Date(b.lastMessageAt || b.updatedAt || 0).getTime() - new Date(a.lastMessageAt || a.updatedAt || 0).getTime());
  }, [conversations, convQuery]);

  const activeConv = sorted.find(c => c.id === activeConversationId) || conversations.find(c => c.id === activeConversationId) || sorted[0] || conversations[0];

  const api = async (path: string, init?: RequestInit) => {
    const headers: Record<string, string> = { ...(init?.headers as any || {}) };
    const tkn = token();
    if (tkn) headers.Authorization = `Bearer ${tkn}`;
    if (init?.body && !(init.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, { ...init, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
    return data;
  };

  const fetchMessages = async (quiet = false, before?: string) => {
    if (!activeConv || !authed || inFlightRef.current) return;
    inFlightRef.current = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const qs = new URLSearchParams({ limit: '50' });
      if (before) qs.set('before', before);
      const data = await api(`/api/conversations/${activeConv.id}/messages?${qs.toString()}`, { signal: controller.signal as any });
      const incoming: ChatMessage[] = data.messages || [];
      setHasMore(!!data.hasMore);
      setMessages(prev => {
        const byId = new Map<string, ChatMessage>();
        if (before) {
          for (const m of prev) byId.set(m.id, m);
          for (const m of incoming) byId.set(m.id, m); // server authoritative
        } else {
          for (const m of incoming) byId.set(m.id, m);
          // keep optimistic sending ones not yet acknowledged
          for (const m of prev) if ((m.status === 'sending' || pendingClientIds.current.has(m.id)) && !byId.has(m.id)) byId.set(m.id, m);
        }
        return Array.from(byId.values()).sort((a,b)=> {
          const ta = new Date(a.createdAt).getTime(), tb = new Date(b.createdAt).getTime();
          if (ta !== tb) return ta - tb; return String(a.id).localeCompare(String(b.id));
        });
      });
      setConnError(null);
      lastSyncRef.current = new Date().toISOString();
      // mark read
      api(`/api/conversations/${activeConv.id}/read`, { method: 'POST' }).catch(()=>{});
    } catch (err: any) {
      if (!quiet) setConnError(err?.status === 401 ? '登录状态已失效，请重新登录。' : (err?.message || '消息加载失败'));
    } finally {
      clearTimeout(timeout);
      inFlightRef.current = false;
    }
  };

  const syncSince = async () => {
    if (!authed) return;
    try {
      let cursor = lastSyncCursorRef.current || { since: lastSyncRef.current };
      let guard = 0;
      while (guard++ < 10) {
        const qs = new URLSearchParams({ limit: '100' });
        if (cursor.since) qs.set('since', cursor.since);
        if (cursor.sinceId) qs.set('sinceId', cursor.sinceId);
        const data = await api(`/api/messenger/sync?${qs.toString()}`);
        if (Array.isArray(data.conversations)) await onRefreshConversations?.();
        if (Array.isArray(data.messages) && data.messages.length) {
          setMessages(prev => {
            const map = new Map(prev.map(m => [m.id, m]));
            for (const m of data.messages as ChatMessage[]) {
              if (!activeConv?.id || m.conversationId === activeConv.id) map.set(m.id, m);
            }
            return Array.from(map.values()).sort((a,b)=> {
              const ta = new Date(a.createdAt).getTime(), tb = new Date(b.createdAt).getTime();
              if (ta !== tb) return ta - tb; return String(a.id).localeCompare(String(b.id));
            });
          });
        }
        if (data.cursor) { cursor = { since: data.cursor.since || cursor.since, sinceId: data.cursor.sinceId }; lastSyncCursorRef.current = cursor; if (data.cursor.since) lastSyncRef.current = data.cursor.since; }
        else if (data.serverTime) { lastSyncRef.current = data.serverTime; lastSyncCursorRef.current = { since: data.serverTime }; }
        if (!data.hasMore) break;
      }
    } catch {}
  };

  const loadFriends = async () => { try { const d = await api('/api/messenger/friends'); setFriends(d.friends || []); } catch {} };
  const loadRequests = async () => { try { const d = await api('/api/messenger/friend-requests'); setIncomingReqs(d.incoming||[]); setOutgoingReqs(d.outgoing||[]); } catch {} };
  const loadBlocked = async () => { try { const d = await api('/api/messenger/blocked'); setBlocked(d.blocked || []); } catch {} };

  const defaultPrivacy = () => ({
    profileVisibility: 'everyone',
    searchableByUsername: true,
    searchableById: true,
    searchableByDisplayName: true,
    friendRequestPolicy: 'everyone',
    showOnlineStatus: true,
    showLastActive: true,
    strangerMessagePolicy: 'everyone',
    readReceipts: true,
  });
  const normalizePrivacy = (p: any) => {
    const base = defaultPrivacy();
    const cur = p && typeof p === 'object' ? p : {};
    const out: any = { ...base, ...cur };
    const pv = ['everyone','friends','self'];
    const fr = ['everyone','mutual_group','none'];
    const sm = ['everyone','friends','mutual_group'];
    if (!pv.includes(out.profileVisibility)) out.profileVisibility = base.profileVisibility;
    if (!fr.includes(out.friendRequestPolicy)) out.friendRequestPolicy = base.friendRequestPolicy;
    if (!sm.includes(out.strangerMessagePolicy)) out.strangerMessagePolicy = base.strangerMessagePolicy;
    for (const k of ['searchableByUsername','searchableById','searchableByDisplayName','showOnlineStatus','showLastActive','readReceipts'] as const) out[k] = typeof out[k] === 'boolean' ? out[k] : (base as any)[k];
    return out;
  };
  const loadPrivacy = async () => {
    if (!authed) return;
    setPrivacyLoading(true);
    try {
      const d = await api('/api/messenger/privacy');
      const p = normalizePrivacy(d.privacy || d);
      setPrivacy(p);
      if (!privacySaving) setPrivacyDraft(p);
      setPrivacyError(null);
    } catch (e: any) {
      setPrivacyError(e?.message || 'Failed to load privacy settings');
    } finally { setPrivacyLoading(false); }
  };
  const savePrivacy = async (nextDraft?: any) => {
    const draft = normalizePrivacy(nextDraft || privacyDraft || privacy || defaultPrivacy());
    const seq = ++privacySaveSeq.current;
    setPrivacySaving(true); setPrivacyStatus('saving'); setPrivacyError(null);
    try {
      const d = await api('/api/messenger/privacy', { method: 'PUT', body: JSON.stringify(draft) });
      const saved = normalizePrivacy(d.privacy || d);
      if (seq !== privacySaveSeq.current) return;
      setPrivacy(saved); setPrivacyDraft(saved); setPrivacyStatus('saved');
      setTimeout(() => { if (privacySaveSeq.current === seq) setPrivacyStatus('idle'); }, 1500);
      void loadFriends(); void loadRequests(); void onRefreshConversations?.();
    } catch (e: any) {
      if (seq !== privacySaveSeq.current) return;
      setPrivacyStatus('error'); setPrivacyError(e?.message || 'Save failed');
    } finally { if (seq === privacySaveSeq.current) setPrivacySaving(false); }
  };
  const updatePrivacy = (patch: any) => {
    setPrivacyDraft((prev: any) => normalizePrivacy({ ...(prev || privacy || defaultPrivacy()), ...patch }));
    setPrivacyStatus('idle');
  };

  const loadRecent = async () => { try { const d = await api('/api/messenger/recent'); setRecentConvs(d.conversations || []); } catch {} };
  const defaultNotifPrefs = () => ({
    friendRequests: true,
    friendAccepted: true,
    groupEvents: true,
    messages: true,
    desktop: true,
    sound: false,
    dndEnabled: false,
    dndStart: '22:00',
    dndEnd: '08:00',
  });

  const normalizeNotifPrefs = (p: any) => {
    const base = defaultNotifPrefs();
    const cur = p && typeof p === 'object' ? p : {};
    const out: any = { ...base, ...cur };
    if (typeof out.friendAccepted !== 'boolean') out.friendAccepted = typeof cur.friendRequests === 'boolean' ? cur.friendRequests : base.friendAccepted;
    const timeRe = /^([01]\d|2[0-3]):([0-5]\d)$/;
    out.dndStart = typeof out.dndStart === 'string' && timeRe.test(out.dndStart.slice(0,5)) ? out.dndStart.slice(0,5) : base.dndStart;
    out.dndEnd = typeof out.dndEnd === 'string' && timeRe.test(out.dndEnd.slice(0,5)) ? out.dndEnd.slice(0,5) : base.dndEnd;
    return out;
  };

  const isDndActiveLocal = (prefs: any, now = new Date()) => {
    if (!prefs?.dndEnabled) return false;
    const parse = (v: string) => { const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
    const start = parse(String(prefs.dndStart || '22:00'));
    const end = parse(String(prefs.dndEnd || '08:00'));
    if (start == null || end == null || start === end) return false;
    const cur = now.getHours() * 60 + now.getMinutes();
    return start < end ? (cur >= start && cur < end) : (cur >= start || cur < end);
  };

  const ensureAudioUnlocked = async () => {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === 'suspended') await ctx.resume();
    } catch {}
  };

  const playNotifSound = async () => {
    try {
      if (!notifSoundRef.current) {
        const a = new Audio('/assets/notification.wav');
        a.preload = 'auto';
        a.volume = 0.6;
        notifSoundRef.current = a;
      }
      await notifSoundRef.current.play();
      return;
    } catch {}
    try {
      await ensureAudioUnlocked();
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      const now = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      o.connect(g); g.connect(ctx.destination);
      o.start(now); o.stop(now + 0.19);
    } catch {}
  };

  const maybeAlertNotification = (n: any, alert?: any) => {
    if (!n || n.read) return;
    const prefs = notifPrefsRef.current || defaultNotifPrefs();
    // Server decides category enablement/push; client enforces local DND/timezone for alerts.
    if (alert && alert.categoryEnabled === false) return;
    const dndActive = isDndActiveLocal(prefs);
    const desktopAllowed = !!prefs.desktop && !dndActive && (alert ? alert.desktop !== false : true);
    const soundAllowed = !!prefs.sound && !dndActive && (alert ? alert.sound !== false : true);
    if (!desktopAllowed && !soundAllowed) return;
    // dedupe by notification id (prevents HTTP/WS or multi-path double alerts)
    const now = Date.now();
    const seen = notifAlertSeenRef.current;
    if (seen.has(n.id)) return;
    for (const [k, ts] of seen) if (now - ts > 120000) seen.delete(k);
    seen.set(n.id, now);
    // avoid duplicate reminder when user is actively viewing current conversation
    if (n.conversationId && n.conversationId === activeConvIdRef.current && document?.hasFocus?.()) return;
    if (desktopAllowed) {
      try {
        const bridge = (window as any).earthOneDesktop;
        if (bridge?.showNotification) {
          const r = bridge.showNotification({ id: n.id, title: n.title || 'EARTH ONE', body: n.body || '', conversationId: n.conversationId || null, type: n.type || '' });
          if (r && typeof r.then === 'function') r.then((res: any) => { if (res && res.ok === false && (res.error === 'unsupported' || res.error === 'denied')) setNotice(lang==='ar'?'إذن إشعارات سطح المكتب غير متاح.':lang==='en'?'Desktop notification permission unavailable.':'桌面通知权限不可用。'); }).catch(()=>{});
        } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const sys = new Notification(n.title || 'EARTH ONE', { body: n.body || '', tag: n.conversationId ? `conv:${n.conversationId}` : `ntf:${n.id}` });
          sys.onclick = () => { try { window.focus(); } catch {}; if (n.conversationId) { onSelectConversation(n.conversationId); setTab('chats'); } else { setTab('notifs'); } };
        } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          Notification.requestPermission().then(p => { if (p === 'denied') setNotice(lang==='ar'?'تم رفض إذن إشعارات سطح المكتب.':lang==='en'?'Desktop notification permission denied.':'桌面通知权限被拒绝。'); }).catch(()=>{});
        } else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
          setNotice(lang==='ar'?'إذن إشعارات سطح المكتب غير متاح.':lang==='en'?'Desktop notification permission unavailable.':'桌面通知权限不可用。');
        }
      } catch {}
    }
    if (soundAllowed) void playNotifSound();
  };

  const loadNotifPrefs = async () => {
    if (!authed) return;
    setNotifPrefsLoading(true);
    try {
      const d = await api('/api/notifications/preferences');
      const p = normalizeNotifPrefs(d.preferences || d);
      setNotifPrefs(p);
      setNotifPrefsDraft((prev: any) => notifPrefsSaving ? prev : p);
      setNotifPrefsError(null);
    } catch (e: any) {
      setNotifPrefsError(e?.message || 'Failed to load preferences');
    } finally {
      setNotifPrefsLoading(false);
    }
  };

  const saveNotifPrefs = async (nextDraft?: any) => {
    const draft = normalizeNotifPrefs(nextDraft || notifPrefsDraft || notifPrefs || defaultNotifPrefs());
    const seq = ++notifPrefsSaveSeq.current;
    setNotifPrefsSaving(true);
    setNotifPrefsStatus('saving');
    setNotifPrefsError(null);
    try {
      const d = await api('/api/notifications/preferences', { method: 'PUT', body: JSON.stringify(draft) });
      const saved = normalizeNotifPrefs(d.preferences || d);
      // ignore stale responses
      if (seq !== notifPrefsSaveSeq.current) return;
      setNotifPrefs(saved);
      setNotifPrefsDraft(saved);
      setNotifPrefsStatus('saved');
      setTimeout(() => { if (notifPrefsSaveSeq.current === seq) setNotifPrefsStatus('idle'); }, 1500);
    } catch (e: any) {
      if (seq !== notifPrefsSaveSeq.current) return;
      setNotifPrefsStatus('error');
      setNotifPrefsError(e?.message || 'Save failed');
    } finally {
      if (seq === notifPrefsSaveSeq.current) setNotifPrefsSaving(false);
    }
  };

  const updateNotifPref = (patch: any) => {
    setNotifPrefsDraft((prev: any) => normalizeNotifPrefs({ ...(prev || notifPrefs || defaultNotifPrefs()), ...patch }));
    setNotifPrefsStatus('idle');
  };

  const loadNotifications = async (opts?: { append?: boolean; before?: string }) => {
    if (notifLoading) return;
    setNotifLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '20' });
      const before = opts?.before;
      if (before) qs.set('before', before);
      const d = await api(`/api/notifications?${qs.toString()}`);
      const list = Array.isArray(d.notifications) ? d.notifications : [];
      setNotifications(prev => opts?.append ? [...prev, ...list.filter((n:any)=>!prev.some(p=>p.id===n.id))] : list);
      setNotifUnread(typeof d.unreadCount === 'number' ? d.unreadCount : 0);
      setNotifHasMore(!!d.hasMore);
      setNotifNextBefore(d.nextBefore || null);
    } catch {}
    finally { setNotifLoading(false); }
  };

  useEffect(() => { if (authed) { void onRefreshConversations?.(); void loadFriends(); void loadRequests(); void loadBlocked(); void loadRecent(); void loadNotifications(); void loadNotifPrefs(); void loadPrivacy(); } }, [authed, currentUser?.id]);

  // WebSocket realtime
  useEffect(() => {
    if (!authed) { setWsStatus('off'); return; }
    let stopped = false;
    const connect = () => {
      if (stopped) return;
      const tkn = token(); if (!tkn) return;
      setWsStatus('connecting');
      const ws = new WebSocket(`${wsUrl('/ws')}?token=${encodeURIComponent(tkn)}`);
      wsRef.current = ws;
      ws.onopen = () => { const wasReconnecting = reconnectAttemptRef.current > 0; reconnectAttemptRef.current = 0; setWsStatus('open'); setConnError(null); if (wasReconnecting) setNotice('网络已恢复，实时连接已重建'); void syncSince(); void onRefreshConversations?.(); void loadNotifications(); void loadNotifPrefs(); void loadPrivacy(); void loadBlocked(); void loadFriends(); void loadRequests(); };
      ws.onmessage = (ev) => {
        let data: any; try { data = JSON.parse(String(ev.data)); } catch { return; }
        if (data.type === 'message' && data.message) {
          const m = data.message as ChatMessage;
          if (activeConv?.id && m.conversationId === activeConv.id) {
            setMessages(prev => {
              if (prev.some(x => x.id === m.id)) return prev;
              return [...prev, m].sort((a,b)=> { const ta=new Date(a.createdAt).getTime(), tb=new Date(b.createdAt).getTime(); if (ta!==tb) return ta-tb; return String(a.id).localeCompare(String(b.id)); });
            });
            api(`/api/conversations/${m.conversationId}/read`, { method: 'POST' }).catch(()=>{});
          }
          void onRefreshConversations?.();
          void loadRecent();
        } else if (data.type === 'send_ack' && data.message) {
          if (data.clientMsgId) pendingClientIds.current.delete(data.clientMsgId);
          if (data.ok && data.message) {
            setMessages(prev => {
              const map = new Map(prev.map(x => [x.id, x]));
              if (data.clientMsgId) map.delete(data.clientMsgId);
              map.set(data.message.id, data.message);
              return Array.from(map.values()).sort((a,b)=> { const ta=new Date(a.createdAt).getTime(), tb=new Date(b.createdAt).getTime(); if (ta!==tb) return ta-tb; return String(a.id).localeCompare(String(b.id)); });
            });
            void onRefreshConversations?.();
          } else if (!data.ok && data.clientMsgId) {
            setMessages(prev => prev.map(m => m.id === data.clientMsgId ? { ...m, status: 'failed' } : m));
            setConnError(data.error === 'blocked' ? '消息被阻止（屏蔽关系）。' : '消息发送失败，请重试。');
          }
        } else if (data.type === 'read' && data.conversationId) {
          if (activeConv?.id && data.conversationId === activeConv.id) {
            setMessages(prev => prev.map(m => m.senderId === currentUser?.id ? { ...m, status: 'read', readBy: Array.from(new Set([...(m.readBy||[]), data.userId])) } : m));
          }
          void onRefreshConversations?.(); // sync unread counts across devices
        } else if (data.type === 'typing' && data.conversationId === activeConv?.id && data.userId !== currentUser?.id) {
          setTypingUsers(prev => ({ ...prev, [data.userId]: data.on ? Date.now() : 0 }));
        } else if (data.type === 'profile_updated' || data.type === 'profile_sync') {
          const u = data.user;
          if (u) {
            if (u.id && currentUser?.id && u.id === currentUser.id && onUserUpdate) onUserUpdate(u as any);
            if (selectedProfile?.user?.id === u.id || selectedProfile?.isSelf) {
              setSelectedProfile((prev: any) => prev ? ({ ...prev, user: u.id === prev.user?.id ? u : (prev.isSelf && u.id === currentUser?.id ? u : prev.user) }) : prev);
            }
            setFriends(prev => prev.map(f => f.id === u.id ? { ...f, displayName: u.displayName || f.displayName, username: u.username || f.username, avatar: u.avatar || f.avatar, isOnline: u.isOnline ?? f.isOnline, lastActiveAt: u.lastActiveAt || f.lastActiveAt, bio: u.bio ?? f.bio } : f));
            setMessages(prev => prev.map(m => m.senderId === u.id ? { ...m, senderName: u.displayName || m.senderName, senderAvatar: u.avatar || m.senderAvatar } : m));
          }
          void onRefreshConversations?.();
          void loadFriends(); void loadRecent();
        } else if (data.type === 'presence' || data.type === 'friend_request' || data.type === 'friend_request_updated' || data.type === 'conversation_created' || data.type === 'conversation_updated' || data.type === 'message_recalled') {
          if (data.type === 'friend_request') setNotice('收到新的好友申请 / New friend request');
          if (data.type === 'friend_request_updated') setNotice('好友申请状态已更新');
          if (data.type === 'presence' && data.userId) {
            setFriends(prev => prev.map(f => f.id === data.userId ? { ...f, isOnline: !!data.online, lastActiveAt: data.lastActiveAt || f.lastActiveAt } : f));
            setMessages(prev => prev.map(m => m.senderId === data.userId ? { ...m } : m));
            if (selectedProfile?.user?.id === data.userId) setSelectedProfile((p:any)=> p ? ({...p, user: { ...p.user, isOnline: !!data.online, lastActiveAt: data.lastActiveAt || p.user?.lastActiveAt }}) : p);
          }
          void onRefreshConversations?.();
          void loadFriends(); void loadRequests(); void loadRecent();
          if (data.type === 'message_recalled' && data.message?.conversationId === activeConv?.id) {
            setMessages(prev => prev.map(m => m.id === data.message.id ? data.message : m));
          }
          if (data.type === 'conversation_updated' && data.conversation?.id === activeConv?.id && showGroupPanel) void loadGroupDetail(activeConv.id);
        } else if (typeof data.type === 'string' && data.type.startsWith('call_')) {
          if (data.call) {
            const c = data.call;
            const mine = (c.participantIds || []).includes(currentUser?.id);
            if (data.type === 'call_invite') {
              if (c.initiatorId !== currentUser?.id && (c.status === 'ringing' || c.status === 'connecting')) { setIncomingCall(c); if (c.conversationId) { /* keep chat usable */ } }
              else if (c.initiatorId === currentUser?.id) { setActiveCall(c); setCallDevices({ micEnabled: c.self?.micEnabled ?? true, cameraEnabled: c.self?.cameraEnabled ?? (c.kind==='video'), screenSharing: !!c.self?.screenSharing }); }
            } else {
              if (mine) {
                if (activeCallRef.current?.id === c.id || incomingCall?.id === c.id || ['ended','rejected','missed','busy','failed','canceled'].includes(c.status) || c.status === 'active' || c.status === 'connecting' || c.status === 'reconnecting') {
                  if (['ended','rejected','missed','busy','failed','canceled'].includes(c.status)) {
                    setActiveCall((prev: any) => prev?.id === c.id ? c : prev);
                    setIncomingCall((prev: any) => prev?.id === c.id ? null : prev);
                    if (activeCallRef.current?.id === c.id || incomingCall?.id === c.id) {
                      setNotice(c.status==='missed' ? (lang==='ar'?'مكالمة فائتة':lang==='en'?'Missed call':'未接来电') : c.status==='busy' ? (lang==='ar'?'المستخدم مشغول':lang==='en'?'User busy':'对方忙线') : c.status==='rejected' ? (lang==='ar'?'تم رفض المكالمة':lang==='en'?'Call rejected':'通话已拒绝') : c.status==='canceled' ? (lang==='ar'?'تم إلغاء المكالمة':lang==='en'?'Call canceled':'通话已取消') : (lang==='ar'?'انتهت المكالمة':lang==='en'?'Call ended':'通话已结束'));
                      setCallMediaNote(null);
                    }
                  } else {
                    setActiveCall(c);
                    if (incomingCall?.id === c.id) setIncomingCall(null);
                    if (c.self) setCallDevices((d: any) => ({ ...d, micEnabled: c.self.micEnabled ?? d.micEnabled, cameraEnabled: c.self.cameraEnabled ?? d.cameraEnabled, screenSharing: !!c.self.screenSharing }));
                  }
                }
              }
            }
          }
        } else if (data.type === 'notification' && data.notification) {
          setNotifications(prev => prev.some(n => n.id === data.notification.id) ? prev : [data.notification, ...prev].slice(0, 200));
          if (typeof data.unreadCount === 'number') setNotifUnread(data.unreadCount); else setNotifUnread(u => u + (data.notification.read ? 0 : 1));
          try { maybeAlertNotification(data.notification, data.alert); } catch {}
        } else if (data.type === 'notification_sync') {
          if (typeof data.unreadCount === 'number') setNotifUnread(data.unreadCount);
          if (data.readAll) setNotifications(prev => prev.map(n => ({ ...n, read: true, readAt: n.readAt || new Date().toISOString() })));
          if (data.readId) setNotifications(prev => prev.map(n => n.id === data.readId ? { ...n, read: true, readAt: data.readAt || n.readAt } : n));
          if (data.deletedId) setNotifications(prev => prev.filter(n => n.id !== data.deletedId));
        } else if (data.type === 'notification_prefs_sync' && data.preferences) {
          setNotifPrefs(data.preferences);
          if (!notifPrefsSaving) setNotifPrefsDraft(data.preferences);
          setNotifPrefsStatus('idle');
          setNotifPrefsError(null);
        } else if (data.type === 'privacy_sync' && data.privacy) {
          const p = normalizePrivacy(data.privacy);
          setPrivacy(p);
          if (!privacySaving) setPrivacyDraft(p);
          setPrivacyStatus('idle');
          setPrivacyError(null);
        } else if (data.type === 'blocklist_sync') {
          void loadBlocked(); void loadFriends(); void loadRequests(); void onRefreshConversations?.();
        } else if (data.type === 'conversation_cleared' && data.conversationId) {
          if (activeConvIdRef.current === data.conversationId) setMessages([]);
          void onRefreshConversations?.();
        } else if (data.type === 'hello') {
          // multi-device hello ok
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        setWsStatus('closed');
        setConnError('实时连接已断开，正在自动重连…');
        const attempt = ++reconnectAttemptRef.current;
        const delay = Math.min(15000, 1000 * Math.pow(1.6, attempt));
        reconnectRef.current = setTimeout(connect, delay);
      };
      ws.onerror = () => { try { ws.close(); } catch {} };
    };
    connect();
    const onOnline = () => { if (wsRef.current?.readyState !== 1) { try { wsRef.current?.close(); } catch {}; connect(); } else { void syncSince(); } };
    window.addEventListener('online', onOnline);
    return () => { stopped = true; window.removeEventListener('online', onOnline); if (reconnectRef.current) clearTimeout(reconnectRef.current); try { wsRef.current?.close(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, currentUser?.id, activeConv?.id]);



  // Desktop (Electron) notification click -> navigate to conversation
  useEffect(() => {
    const bridge = (window as any).earthOneDesktop;
    if (!bridge?.onNotificationClick) return;
    const off = bridge.onNotificationClick((data: any) => {
      try {
        if (data?.conversationId) {
          onSelectConversation(String(data.conversationId));
          setTab('chats');
        } else {
          setTab('notifs');
          void loadNotifications();
        }
      } catch {}
    });
    return () => { try { off && off(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSelectConversation]);

  useEffect(() => { if (activeConv?.id && authed) { setMessages([]); setHasMore(false); void fetchMessages(); } }, [activeConv?.id, authed]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, activeConv?.id]);

  const loadGroupDetail = async (id: string) => {
    try { const d = await api(`/api/conversations/${id}`); setGroupDetail(d.conversation || null); } catch { setGroupDetail(null); }
  };
  useEffect(() => { if (showGroupPanel && activeConv?.type === 'group') void loadGroupDetail(activeConv.id); }, [showGroupPanel, activeConv?.id]);

  // clear stale typing indicators
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setTypingUsers(prev => {
        const next: any = {}; let changed = false;
        for (const [k,v] of Object.entries(prev)) { if (v && now - v < 5000) next[k]=v; else changed = true; }
        return changed ? next : prev;
      });
    }, 2000);
    return () => clearInterval(t);
  }, []);

  const sendTyping = (on: boolean) => {
    if (!activeConv || wsRef.current?.readyState !== 1) return;
    const now = Date.now();
    if (on && now - typingSentRef.current < 1500) return;
    typingSentRef.current = now;
    try { wsRef.current.send(JSON.stringify({ type: 'typing', conversationId: activeConv.id, on })); } catch {}
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isSending || !activeConv || !authed) return;
    const text = inputText.trim();
    const clientId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const optimistic: ChatMessage = {
      id: clientId, conversationId: activeConv.id, senderId: currentUser?.id || '', senderName: currentUser?.displayName || 'Me',
      senderAvatar: currentUser?.avatar || '', senderCountry: currentUser?.location?.countryCode || 'UN', content: text,
      createdAt: new Date().toISOString(), status: 'sending', readBy: [currentUser?.id || ''], deliveredTo: [], replyToId: replyTo?.id
    } as any;
    pendingClientIds.current.add(clientId);
    setMessages(prev => [...prev, optimistic]);
    setInputText('');
    setReplyTo(null);
    setIsSending(true);
    sendTyping(false);
    try {
      if (wsRef.current?.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: 'send', conversationId: activeConv.id, content: text, clientMsgId: clientId, replyToId: optimistic.replyToId, autoTranslate, targetLanguage: targetTranslateLang }));
        // ack handled by ws; fallback timeout
        setTimeout(() => {
          if (pendingClientIds.current.has(clientId)) {
            // fallback to HTTP if no ack
            (async () => {
              try {
                const data = await api(`/api/conversations/${activeConv.id}/messages`, { method: 'POST', body: JSON.stringify({ content: text, replyToId: optimistic.replyToId, targetLanguage: targetTranslateLang, autoTranslate, clientMsgId: clientId }) });
                pendingClientIds.current.delete(clientId);
                if (data.success && data.message) setMessages(prev => prev.map(m => m.id === clientId ? data.message : m));
              } catch { pendingClientIds.current.delete(clientId); setMessages(prev => prev.map(m => m.id === clientId ? { ...m, status: 'failed' } : m)); }
            })();
          }
        }, 5000);
      } else {
        const data = await api(`/api/conversations/${activeConv.id}/messages`, { method: 'POST', body: JSON.stringify({ content: text, replyToId: optimistic.replyToId, targetLanguage: targetTranslateLang, autoTranslate, clientMsgId: clientId }) });
        pendingClientIds.current.delete(clientId);
        if (data.success && data.message) setMessages(prev => prev.map(m => m.id === clientId ? data.message : m));
        await onRefreshConversations?.();
      }
    } catch (err: any) {
      pendingClientIds.current.delete(clientId);
      setMessages(prev => prev.map(m => m.id === clientId ? { ...m, status: 'failed' } : m));
      setConnError(err?.message || '发送失败，请重试。');
      setInputText(text);
    } finally {
      setIsSending(false);
    }
  };

  const uploadOne = (file: File, convId: string, onProgress: (p: number) => void): Promise<any> => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/messenger/upload/stream');
    const t = token();
    if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`);
    xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
    xhr.setRequestHeader('x-mime-type', encodeURIComponent(file.type || 'application/octet-stream'));
    xhr.setRequestHeader('x-conversation-id', encodeURIComponent(convId));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.max(1, Math.round((e.loaded / e.total) * 100))); };
    xhr.onerror = () => reject(new Error('上传失败，请检查网络'));
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && data.success && data.attachment) resolve(data.attachment);
        else reject(new Error(data.error || '上传失败'));
      } catch { reject(new Error('上传失败')); }
    };
    xhr.send(file);
  });

  const queueFiles = (files: FileList | File[]) => {
    if (!activeConv) return;
    const list = Array.from(files);
    const next: PendingUpload[] = [];
    for (const file of list) {
      const err = validateLocalFile(file);
      const mime = (file.type || '').toLowerCase();
      const isImg = mime.startsWith('image/') || ['.png','.jpg','.jpeg','.gif','.webp'].includes(fileExt(file.name));
      next.push({
        id: `pend_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        file, name: file.name, size: file.size, mimeType: file.type || 'application/octet-stream',
        kind: isImg ? 'image' : 'file',
        previewUrl: isImg ? URL.createObjectURL(file) : undefined,
        progress: 0,
        status: err ? 'error' : 'queued',
        error: err || undefined,
      });
    }
    if (next.length) setPendingUploads(prev => [...prev, ...next]);
  };

  const removePending = (id: string) => {
    setPendingUploads(prev => {
      const p = prev.find(x => x.id === id);
      if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl);
      return prev.filter(x => x.id !== id);
    });
  };

  const sendPendingUploads = async () => {
    if (!activeConv || !authed || isUploading) return;
    const items = pendingUploads.filter(p => p.status !== 'done');
    if (!items.length) return;
    setIsUploading(true);
    try {
      for (const item of items) {
        if (item.status === 'error' && !item.uploadedAttachment) continue;
        try {
          let att = item.uploadedAttachment;
          if (!att) {
            setPendingUploads(prev => prev.map(p => p.id === item.id ? { ...p, status: 'uploading', progress: 1, error: undefined } : p));
            att = await uploadOne(item.file, activeConv.id, (p) => setPendingUploads(prev => prev.map(x => x.id === item.id ? { ...x, progress: p } : x)));
            setPendingUploads(prev => prev.map(p => p.id === item.id ? { ...p, uploadedAttachment: att, progress: 100 } : p));
          }
          setPendingUploads(prev => prev.map(p => p.id === item.id ? { ...p, status: 'sending', error: undefined } : p));
          const clientId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
          const optimistic: ChatMessage = {
            id: clientId, conversationId: activeConv.id, senderId: currentUser?.id || '', senderName: currentUser?.displayName || 'Me',
            senderAvatar: currentUser?.avatar || '', senderCountry: currentUser?.location?.countryCode || 'UN', content: '',
            createdAt: new Date().toISOString(), status: 'sending', readBy: [currentUser?.id || ''], deliveredTo: [], attachments: [att]
          } as any;
          pendingClientIds.current.add(clientId);
          setMessages(prev => [...prev, optimistic].sort((a,b)=>{ const ta=new Date(a.createdAt).getTime(), tb=new Date(b.createdAt).getTime(); if(ta!==tb) return ta-tb; return String(a.id).localeCompare(String(b.id)); }));
          const data = await api(`/api/conversations/${activeConv.id}/messages`, { method: 'POST', body: JSON.stringify({ content: '', attachments: [att], clientMsgId: clientId }) });
          pendingClientIds.current.delete(clientId);
          if (data.success && data.message) setMessages(prev => prev.map(m => m.id === clientId ? data.message : m));
          await onRefreshConversations?.();
          setPendingUploads(prev => prev.map(p => p.id === item.id ? { ...p, status: 'done', progress: 100 } : p));
        } catch (e: any) {
          setPendingUploads(prev => prev.map(p => p.id === item.id ? { ...p, status: 'error', error: e?.message || '发送失败' } : p));
          setConnError(e?.message || '上传/发送失败');
        }
      }
    } finally {
      setIsUploading(false);
      setPendingUploads(prev => {
        const keep = prev.filter(p => p.status !== 'done');
        const done = prev.filter(p => p.status === 'done');
        for (const p of done) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
        return keep;
      });
    }
  };

  const retryPending = (id: string) => {
    setPendingUploads(prev => prev.map(p => {
      if (p.id !== id) return p;
      // if upload already succeeded, retry only message send
      if (p.uploadedAttachment) return { ...p, status: 'queued', error: undefined };
      return { ...p, status: 'queued', error: undefined, progress: 0 };
    }));
    setTimeout(() => { void sendPendingUploads(); }, 0);
  };

  const doSearchUsers = async () => {
    if (!userSearch.trim()) { setSearchResults([]); return; }
    try { const d = await api(`/api/messenger/users/search?q=${encodeURIComponent(userSearch.trim())}`); setSearchResults(d.users || []); } catch (e:any) { setConnError(e?.message || '搜索失败'); }
  };

  const doSearchMessages = async () => {
    if (!msgQuery.trim() && !msgSender && !msgConvId) { setMsgResults([]); return; }
    setMsgSearching(true);
    try {
      const qs = new URLSearchParams();
      if (msgQuery.trim()) qs.set('q', msgQuery.trim());
      if (msgSender) qs.set('senderId', msgSender);
      if (msgConvId) qs.set('conversationId', msgConvId);
      qs.set('limit', '50');
      const d = await api(`/api/messenger/messages/search?${qs.toString()}`);
      setMsgResults(d.messages || []);
    } catch (e: any) {
      setConnError(e?.message || '消息搜索失败');
    } finally {
      setMsgSearching(false);
    }
  };

  const sendFriendRequest = async (toUserId: string) => { if (pendingRequestIds.has(toUserId)) return; setPendingRequestIds(s=>new Set(s).add(toUserId)); try { await api('/api/messenger/friend-requests', { method: 'POST', body: JSON.stringify({ toUserId }) }); setNotice('好友申请已发送'); await loadRequests(); } catch (e:any) { setConnError(e?.message || '发送失败'); } finally { setPendingRequestIds(s=>{const n=new Set(s); n.delete(toUserId); return n;}); } };
  const respondRequest = async (id: string, accept: boolean) => { if (pendingRequestIds.has(id)) return; setPendingRequestIds(s=>new Set(s).add(id)); try { await api(`/api/messenger/friend-requests/${id}/respond`, { method: 'POST', body: JSON.stringify({ accept }) }); setNotice(accept?'已接受好友申请':'已拒绝好友申请'); await loadRequests(); await loadFriends(); await onRefreshConversations?.(); await loadRecent(); } catch (e:any) { setConnError(e?.message || '操作失败'); } finally { setPendingRequestIds(s=>{const n=new Set(s); n.delete(id); return n;}); } };
  const removeFriend = async (id: string) => { if(!window.confirm('确认删除好友？')) return; try { await api(`/api/messenger/friends/${id}`, { method: 'DELETE' }); setNotice('已删除好友'); await loadFriends(); await loadBlocked(); await loadRecent(); } catch (e:any) { setConnError(e?.message || '操作失败'); } };
  const blockUser = async (id: string) => { try { await api('/api/messenger/block', { method: 'POST', body: JSON.stringify({ userId: id }) }); await loadFriends(); await loadBlocked(); await onRefreshConversations?.(); } catch (e:any) { setConnError(e?.message || '操作失败'); } };
  const unblockUser = async (id: string) => { try { await api('/api/messenger/unblock', { method: 'POST', body: JSON.stringify({ userId: id }) }); await loadBlocked(); } catch (e:any) { setConnError(e?.message || '操作失败'); } };
  const openDirect = async (uid: string) => { try { const d = await api('/api/conversations/direct', { method: 'POST', body: JSON.stringify({ targetUserId: uid }) }); await onRefreshConversations?.(); await loadRecent(); if (d.conversation?.id) onSelectConversation(d.conversation.id); setTab('chats'); } catch (e:any) { setConnError(e?.message || '无法创建会话'); } };
  const openProfile = async (uid: string) => {
    try {
      const d = await api(`/api/messenger/profile/${uid}`);
      setSelectedProfile(d);
      const u = d.user || {};
      setProfileDraft({ displayName: u.displayName || '', username: u.username || '', bio: u.bio || '' });
      setProfileMode('view');
      setProfileSaveState('idle'); setProfileError(null); setAvatarPreview(null);
    } catch (e:any) { setConnError(e?.message || '无法加载资料'); }
  };

  const openMyProfile = async () => {
    try {
      const d = await api('/api/messenger/profile/me');
      const profile = { user: d.user, isSelf: true, isFriend: false, blocked: false, pendingRequest: null };
      setSelectedProfile(profile);
      setProfileDraft({ displayName: d.user?.displayName || '', username: d.user?.username || '', bio: d.user?.bio || '' });
      setProfileMode('view');
      setProfileSaveState('idle'); setProfileError(null); setAvatarPreview(null);
    } catch (e:any) { setConnError(e?.message || '无法加载资料'); }
  };

  const saveMyProfile = async () => {
    if (!selectedProfile?.isSelf) return;
    setProfileSaving(true); setProfileSaveState('saving'); setProfileError(null);
    try {
      const payload = { displayName: profileDraft.displayName.trim(), username: profileDraft.username.trim(), bio: profileDraft.bio };
      const d = await api('/api/messenger/profile/update', { method: 'POST', body: JSON.stringify(payload) });
      const u = d.user;
      setSelectedProfile((p:any)=> p ? ({...p, user: u, isSelf: true}) : p);
      setProfileDraft({ displayName: u?.displayName || '', username: u?.username || '', bio: u?.bio || '' });
      setProfileMode('view');
      setProfileSaveState('saved');
      if (onUserUpdate && u) onUserUpdate(u);
      setNotice(lang==='ar'?'تم حفظ الملف الشخصي':lang==='en'?'Profile saved':'资料已保存');
      void onRefreshConversations?.(); void loadFriends(); void loadRecent();
      // update local message sender snapshots for self
      if (currentUser?.id) setMessages(prev => prev.map(m => m.senderId === currentUser.id ? { ...m, senderName: u?.displayName || m.senderName, senderAvatar: u?.avatar || m.senderAvatar } : m));
      setTimeout(()=>setProfileSaveState('idle'), 1500);
    } catch (e:any) {
      setProfileSaveState('error'); setProfileError(e?.message || 'Save failed');
    } finally { setProfileSaving(false); }
  };

  const onPickAvatar = async (file?: File | null) => {
    if (!file || !selectedProfile?.isSelf) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { setProfileError(lang==='ar'?'يسمح فقط JPG/PNG/WebP':lang==='en'?'Only JPG, PNG, WebP allowed':'仅支持 JPG/PNG/WebP'); setProfileSaveState('error'); return; }
    if (file.size > 2*1024*1024) { setProfileError(lang==='ar'?'الحد الأقصى للصورة 2MB':lang==='en'?'Avatar max 2MB':'头像最大 2MB'); setProfileSaveState('error'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      setAvatarPreview(dataUrl);
      setAvatarUploading(true); setProfileError(null);
      try {
        const b64 = dataUrl.split(',')[1] || '';
        const d = await api('/api/messenger/profile/avatar', { method: 'POST', body: JSON.stringify({ name: file.name, mimeType: file.type, dataBase64: b64 }) });
        const u = d.user;
        setSelectedProfile((p:any)=> p ? ({...p, user: u, isSelf: true}) : p);
        if (onUserUpdate && u) onUserUpdate(u);
        setNotice(lang==='ar'?'تم تحديث الصورة':lang==='en'?'Avatar updated':'头像已更新');
        void onRefreshConversations?.(); void loadFriends();
        if (currentUser?.id) setMessages(prev => prev.map(m => m.senderId === currentUser.id ? { ...m, senderAvatar: u?.avatar || m.senderAvatar, senderName: u?.displayName || m.senderName } : m));
      } catch (e:any) {
        setProfileError(e?.message || 'Upload failed'); setProfileSaveState('error');
      } finally { setAvatarUploading(false); }
    };
    reader.onerror = () => { setProfileError('Failed to read image'); setProfileSaveState('error'); };
    reader.readAsDataURL(file);
  };

  const resetAvatar = async () => {
    if (!selectedProfile?.isSelf) return;
    setAvatarUploading(true); setProfileError(null);
    try {
      const d = await api('/api/messenger/profile/avatar', { method: 'DELETE' });
      const u = d.user;
      setSelectedProfile((p:any)=> p ? ({...p, user: u, isSelf: true}) : p);
      setAvatarPreview(null);
      if (onUserUpdate && u) onUserUpdate(u);
      void onRefreshConversations?.(); void loadFriends();
      if (currentUser?.id) setMessages(prev => prev.map(m => m.senderId === currentUser.id ? { ...m, senderAvatar: u?.avatar || m.senderAvatar } : m));
    } catch (e:any) { setProfileError(e?.message || 'Failed'); setProfileSaveState('error'); }
    finally { setAvatarUploading(false); }
  };

  const retrySend = async (msg: ChatMessage) => {
    if (!activeConv || !authed) return;
    const text = msg.content || '';
    const attachments = msg.attachments;
    const replyToId = msg.replyToId;
    // remove failed bubble and resend
    setMessages(prev => prev.filter(m => m.id !== msg.id));
    const clientId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const optimistic: ChatMessage = {
      id: clientId, conversationId: activeConv.id, senderId: currentUser?.id || '', senderName: currentUser?.displayName || 'Me',
      senderAvatar: currentUser?.avatar || '', senderCountry: currentUser?.location?.countryCode || 'UN', content: text,
      createdAt: new Date().toISOString(), status: 'sending', readBy: [currentUser?.id || ''], deliveredTo: [], replyToId, attachments
    } as any;
    pendingClientIds.current.add(clientId);
    setMessages(prev => [...prev, optimistic].sort((a,b)=> new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()));
    try {
      if (wsRef.current?.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: 'send', conversationId: activeConv.id, content: text, clientMsgId: clientId, replyToId, attachments }));
        setTimeout(async () => {
          if (pendingClientIds.current.has(clientId)) {
            try {
              const data = await api(`/api/conversations/${activeConv.id}/messages`, { method: 'POST', body: JSON.stringify({ content: text, replyToId, attachments, clientMsgId: clientId }) });
              pendingClientIds.current.delete(clientId);
              if (data.success && data.message) setMessages(prev => prev.map(m => m.id === clientId ? data.message : m));
              await onRefreshConversations?.();
            } catch {
              pendingClientIds.current.delete(clientId);
              setMessages(prev => prev.map(m => m.id === clientId ? { ...m, status: 'failed' } : m));
              setConnError('重试失败，请检查网络后再试。');
            }
          }
        }, 5000);
      } else {
        const data = await api(`/api/conversations/${activeConv.id}/messages`, { method: 'POST', body: JSON.stringify({ content: text, replyToId, attachments, clientMsgId: clientId }) });
        pendingClientIds.current.delete(clientId);
        if (data.success && data.message) setMessages(prev => prev.map(m => m.id === clientId ? data.message : m));
        await onRefreshConversations?.();
      }
    } catch {
      pendingClientIds.current.delete(clientId);
      setMessages(prev => prev.map(m => m.id === clientId ? { ...m, status: 'failed' } : m));
      setConnError('重试失败，请检查网络后再试。');
    }
  };

  const recallMessage = async (msg: ChatMessage) => { try { await api(`/api/conversations/${msg.conversationId}/messages/${msg.id}/recall`, { method: 'POST' }); } catch (e:any) { setConnError(e?.message || '撤回失败'); } };
  const deleteForMe = async (msg: ChatMessage) => { try { await api(`/api/conversations/${msg.conversationId}/messages/${msg.id}/delete`, { method: 'POST' }); setMessages(prev => prev.filter(m => m.id !== msg.id)); } catch (e:any) { setConnError(e?.message || '删除失败'); } };
  const clearConversationForMe = async () => {
    if (!activeConv) return;
    if (!window.confirm(lang==='ar'?'سيؤدي هذا إلى إزالة سجل هذه المحادثة من عرضك فقط (وليس للطرف الآخر). هل تريد المتابعة؟':lang==='en'?'This will remove this conversation history from your view only (not for others). Continue?':'这将仅从你的视图中清除此会话记录（不会删除对方记录）。继续吗？')) return;
    try {
      await api(`/api/conversations/${activeConv.id}/clear`, { method: 'POST' });
      setMessages([]);
      setNotice(lang==='ar'?'تم مسح سجلك لهذه المحادثة':lang==='en'?'Cleared your view of this conversation':'已清除你对此会话的记录');
      void onRefreshConversations?.();
    } catch (e:any) { setConnError(e?.message || '清除失败'); }
  };
  const createGroup = async () => {
    if (!newGroupName.trim() || newGroupMembers.length === 0) { setConnError('请填写群名称并选择至少1位成员'); return; }
    try {
      const d = await api('/api/conversations/group', { method: 'POST', body: JSON.stringify({ name: newGroupName.trim(), memberIds: newGroupMembers }) });
      await onRefreshConversations?.();
      if (d.conversation?.id) { onSelectConversation(d.conversation.id); setTab('chats'); }
      setShowCreateGroup(false); setNewGroupName(''); setNewGroupMembers([]); setNotice('群聊已创建');
    } catch (e:any) { setConnError(e?.message || '创建群聊失败'); }
  };

  const typingNames = useMemo(() => {
    if (!activeConv) return '';
    const ids = Object.entries(typingUsers).filter(([,v]) => v).map(([k]) => k);
    if (!ids.length) return '';
    return ids.map(id => storeNameFor(id)).join(', ');
  }, [typingUsers, activeConv, friends, conversations]);
  function storeNameFor(id: string) {
    const f = friends.find(x=>x.id===id) || searchResults.find(x=>x.id===id);
    if (f) return f.displayName;
    const c = conversations.find(c => c.otherUser?.id === id);
    return c?.otherUser?.displayName || c?.name || 'Someone';
  }


  const renameGroupAction = async () => {
    if (!activeConv || activeConv.type !== 'group') return;
    const name = window.prompt('新群名称 / New group name', activeConv.name);
    if (!name || !name.trim()) return;
    try { const d = await api(`/api/conversations/${activeConv.id}/rename`, { method: 'POST', body: JSON.stringify({ name: name.trim() }) }); await onRefreshConversations?.(); await loadGroupDetail(activeConv.id); setNotice('群名称已更新'); } catch (e:any) { setConnError(e?.message || '修改失败'); }
  };
  const changeGroupAvatar = async () => {
    if (!activeConv || activeConv.type !== 'group') return;
    const avatar = window.prompt('群头像 URL', (activeConv as any).avatar || '');
    if (avatar === null) return;
    try { await api(`/api/conversations/${activeConv.id}/rename`, { method: 'POST', body: JSON.stringify({ avatar }) }); await onRefreshConversations?.(); await loadGroupDetail(activeConv.id); setNotice('群头像已更新'); } catch (e:any) { setConnError(e?.message || '修改失败'); }
  };
  const inviteMembers = async () => {
    if (!activeConv || activeConv.type !== 'group') return;
    const ids = window.prompt('邀请成员用户ID（逗号分隔）');
    const addIds = (ids||'').split(',').map(s=>s.trim()).filter(Boolean);
    if (!addIds.length) return;
    try { await api(`/api/conversations/${activeConv.id}/members`, { method: 'POST', body: JSON.stringify({ addIds }) }); await onRefreshConversations?.(); await loadGroupDetail(activeConv.id); setNotice('已邀请成员'); } catch (e:any) { setConnError(e?.message || '邀请失败'); }
  };
  const removeMember = async (uid: string) => {
    if (!activeConv || activeConv.type !== 'group') return;
    if (!window.confirm('移除该成员？')) return;
    try { await api(`/api/conversations/${activeConv.id}/members`, { method: 'POST', body: JSON.stringify({ removeIds: [uid] }) }); await onRefreshConversations?.(); await loadGroupDetail(activeConv.id); setNotice('成员已移除'); } catch (e:any) { setConnError(e?.message || '移除失败'); }
  };
  const toggleAdmin = async (uid: string, makeAdmin: boolean) => {
    if (!activeConv || activeConv.type !== 'group' || !groupDetail) return;
    const current: string[] = groupDetail.adminIds || [];
    const next = makeAdmin ? Array.from(new Set([...current, uid])) : current.filter(x => x !== uid);
    try { await api(`/api/conversations/${activeConv.id}/admins`, { method: 'POST', body: JSON.stringify({ adminIds: next }) }); await loadGroupDetail(activeConv.id); await onRefreshConversations?.(); setNotice('管理员权限已更新'); } catch (e:any) { setConnError(e?.message || '更新失败'); }
  };
  const transferOwner = async (uid: string) => {
    if (!activeConv || activeConv.type !== 'group') return;
    if (!window.confirm('确认转让群主？此操作将变更管理权限。')) return;
    try { await api(`/api/conversations/${activeConv.id}/transfer-owner`, { method: 'POST', body: JSON.stringify({ newOwnerId: uid }) }); await loadGroupDetail(activeConv.id); await onRefreshConversations?.(); setNotice('群主已转让'); } catch (e:any) { setConnError(e?.message || '转让失败'); }
  };
  const leaveGroupAction = async () => {
    if (!activeConv || activeConv.type !== 'group') return;
    if (!window.confirm('确认退出该群聊？')) return;
    try { await api(`/api/conversations/${activeConv.id}/leave`, { method: 'POST' }); setShowGroupPanel(false); setGroupDetail(null); await onRefreshConversations?.(); setNotice('已退出群聊'); } catch (e:any) { setConnError(e?.message || '退出失败'); }
  };


  const markNotifRead = async (id: string) => {
    try {
      const d = await api(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true, readAt: d.notification?.readAt || new Date().toISOString() } : n));
      if (typeof d.unreadCount === 'number') setNotifUnread(d.unreadCount);
    } catch {}
  };
  const markAllNotifsRead = async () => {
    try { const d = await api('/api/notifications/read-all', { method: 'POST' }); setNotifications(prev => prev.map(n => ({ ...n, read: true, readAt: n.readAt || new Date().toISOString() }))); if (typeof d.unreadCount === 'number') setNotifUnread(d.unreadCount); } catch {}
  };
  const deleteNotif = async (id: string) => {
    try { const d = await api(`/api/notifications/${id}`, { method: 'DELETE' }); setNotifications(prev => prev.filter(n => n.id !== id)); if (typeof d.unreadCount === 'number') setNotifUnread(d.unreadCount); } catch {}
  };
  const openNotification = async (n: any) => {
    if (!n.read) void markNotifRead(n.id);
    if (n.type === 'call_invite') {
      const cid = n.data?.callId;
      if (cid) { try { const d = await callApi.get(token(), cid); if (d?.call) setIncomingCall(d.call); } catch { setIncomingCall({ id: cid, kind: n.data?.kind, scope: n.data?.scope, status: 'ringing', conversationId: n.conversationId || n.data?.conversationId }); } }
      else if (n.conversationId) { onSelectConversation(n.conversationId); setTab('chats'); }
      return;
    }
    if (n.conversationId) { onSelectConversation(n.conversationId); setTab('chats'); return; }
    if (n.type === 'friend_request') { setTab('requests'); void loadRequests(); return; }
    if (n.type === 'friend_accepted' || n.type === 'account_security') {
      if (n.actorId || n.targetUserId) { await openProfile(n.actorId || n.targetUserId); }
      return;
    }
    if (n.type === 'group_invite' || n.type === 'group_member_joined' || n.type === 'group_member_left' || n.type === 'group_admin_changed' || n.type === 'group_owner_transferred') {
      if (n.conversationId) { onSelectConversation(n.conversationId); setTab('chats'); }
      return;
    }
    if (n.actorId) { await openProfile(n.actorId); }
  };

  // ---- Calls (EARTH ONE signaling + LiveKit media when configured) ----
  const callErrorText = (e: any) => {
    const msg = String(e?.body?.error || e?.message || e || '');
    if (msg === 'BUSY') return lang==='ar'?'أنت في مكالمة حالياً':lang==='en'?'You are already in a call':'你当前正在通话中';
    if (msg === 'TARGET_BUSY') return lang==='ar'?'المستخدم مشغول':lang==='en'?'User is busy':'对方正在通话中';
    if (msg === 'MEDIA_NOT_CONFIGURED') return lang==='ar'?'خادم الوسائط غير مُعد (محظور)':lang==='en'?'Media server not configured (blocked)':'媒体服务未配置（BLOCKED）';
    if (msg === 'MEDIA_SDK_UNAVAILABLE') return lang==='ar'?'حزمة وسائط الخادم غير متوفرة (محظور)':lang==='en'?'Media SDK unavailable (blocked)':'媒体 SDK 不可用（BLOCKED）';
    return msg || (lang==='ar'?'فشل إجراء المكالمة':lang==='en'?'Call action failed':'通话操作失败');
  };
  const callStatusLabel = (st?: string) => {
    const m: Record<string,string> = { ringing: lang==='ar'?'يرن…':lang==='en'?'Ringing…':'呼叫中…', connecting: lang==='ar'?'جارٍ الاتصال…':lang==='en'?'Connecting…':'连接中…', active: lang==='ar'?'نشطة':lang==='en'?'Active':'通话中', reconnecting: lang==='ar'?'إعادة الاتصال…':lang==='en'?'Reconnecting…':'重连中…', ended: lang==='ar'?'انتهت':lang==='en'?'Ended':'已结束', rejected: lang==='ar'?'مرفوضة':lang==='en'?'Rejected':'已拒绝', missed: lang==='ar'?'فائتة':lang==='en'?'Missed':'未接', busy: lang==='ar'?'مشغول':lang==='en'?'Busy':'忙线', failed: lang==='ar'?'فشلت':lang==='en'?'Failed':'失败', canceled: lang==='ar'?'أُلغيت':lang==='en'?'Canceled':'已取消' };
    return m[st || ''] || (st || '');
  };
  const canStartCallHere = !!activeConv && authed && (activeConv.type === 'direct' || activeConv.type === 'group') && !!activeConv.id && activeConv.id !== 'conv_global';

  const cleanupCallMedia = async (reason = 'ended') => {
    mediaJoinedCallIdRef.current = null;
    mediaTokenRef.current = null;
    const s = mediaSessionRef.current;
    mediaSessionRef.current = null;
    try { await s?.disconnect(reason); } catch {}
    setMediaState({ phase: 'idle', canPlaybackAudio: false, participants: {} });
  };

  const syncCallStateToServer = async (callId: string, patch: any) => {
    try { await callApi.state(token(), callId, patch); } catch {}
  };

  const joinCallMedia = async (call: any, media?: any) => {
    if (!call?.id) return;
    // avoid duplicate joins for same call/token
    const isTerminal = ['ended','rejected','missed','busy','failed','canceled'].includes(call.status);
    if (isTerminal) return;
    if (mediaJoinedCallIdRef.current === call.id && mediaSessionRef.current) return;
    let info = media;
    if (!info || (!info.ok && !info.token)) {
      try { info = await callApi.token(token(), call.id); } catch (e:any) { info = e?.body || { ok:false, reason: e?.message || 'MEDIA_ERROR' }; }
    }
    if (!info || info.ok === false || info.blocked || !info.token || !info.url) {
      const reason = info?.reason || (info?.blocked ? 'MEDIA_NOT_CONFIGURED' : 'MEDIA_UNAVAILABLE');
      setCallMediaNote(reason === 'MEDIA_NOT_CONFIGURED' || reason === 'MEDIA_SDK_UNAVAILABLE'
        ? (lang==='ar'?'وسائط الصوت/الفيديو الحقيقية غير متاحة: الخادم غير مُعد (تم الاحتفاظ بالإشارة فقط).':lang==='en'?'Real audio/video media unavailable: server not configured (signaling only).':'真实音视频不可用：媒体服务未配置（仅保留信令）。')
        : (lang==='ar'?`تعذر الانضمام للوسائط: ${String(reason)}`:lang==='en'?`Cannot join media: ${String(reason)}`:`无法加入媒体：${String(reason)}`));
      setMediaState(s => ({ ...s, phase: 'blocked', reason: String(reason) }));
      return;
    }
    // if switching calls, cleanup previous
    if (mediaSessionRef.current && mediaJoinedCallIdRef.current && mediaJoinedCallIdRef.current !== call.id) {
      await cleanupCallMedia('replace');
    }
    mediaTokenRef.current = info.token;
    mediaJoinedCallIdRef.current = call.id;
    const session = new LiveKitCallSession();
    mediaSessionRef.current = session;
    setCallMediaNote(lang==='ar'?'جارٍ الاتصال بوسائط المكالمة…':lang==='en'?'Connecting to call media…':'正在连接通话媒体…');
    try {
      await session.connect({
        url: info.url,
        token: info.token,
        roomName: info.roomName || call.roomName,
        kind: call.kind || 'audio',
        initialMicEnabled: callDevices.micEnabled !== false,
        initialCameraEnabled: call.kind === 'video' ? (callDevices.cameraEnabled !== false) : false,
        onState: (st) => {
          setMediaState(st);
          if (st.phase === 'connected') {
            setCallMediaNote(null);
            void syncCallStateToServer(call.id, { status: 'active', micEnabled: callDevices.micEnabled, cameraEnabled: callDevices.cameraEnabled, screenSharing: callDevices.screenSharing });
          } else if (st.phase === 'reconnecting') {
            setCallMediaNote(lang==='ar'?'جارٍ إعادة الاتصال بالوسائط…':lang==='en'?'Reconnecting media…':'媒体重连中…');
            void syncCallStateToServer(call.id, { status: 'reconnecting' });
          } else if (st.phase === 'failed') {
            setCallMediaNote(st.error || (lang==='ar'?'فشل اتصال الوسائط':lang==='en'?'Media connection failed':'媒体连接失败'));
          }
          if (st.error) setCallMediaNote(st.error);
        }
      });
    } catch (e: any) {
      const msg = friendlyMediaError(e);
      setCallMediaNote(msg);
      setMediaState(s => ({ ...s, phase: 'failed', error: msg }));
      // keep signaling alive; do not fake success
    }
  };

  const startCall = async (kind: 'audio'|'video') => {
    if (!activeConv || !authed || callAction) return;
    if (activeCall && ['ringing','connecting','active','reconnecting'].includes(activeCall.status)) { setConnError(callErrorText({ message: 'BUSY' })); return; }
    setCallAction('start'); setCallMediaNote(null); await cleanupCallMedia('replace');
    try {
      const payload: any = activeConv.type === 'direct'
        ? { scope: 'direct', kind, targetUserId: activeConv.otherUser?.id, conversationId: activeConv.id }
        : { scope: 'group', kind, conversationId: activeConv.id };
      const d = await callApi.invite(token(), payload);
      if (d?.call) {
        setActiveCall(d.call);
        setCallDevices({ micEnabled: true, cameraEnabled: kind === 'video', screenSharing: false });
        await joinCallMedia(d.call, d.media);
      }
      if (d?.media?.blocked || d?.media?.ok === false) {
        setCallMediaNote(d.media.reason === 'MEDIA_NOT_CONFIGURED' || d.media.reason === 'MEDIA_SDK_UNAVAILABLE'
          ? (lang==='ar'?'تم إنشاء إشارة المكالمة. وسائط الصوت/الفيديو الحقيقية غير متاحة (الخادم غير مُعد).':lang==='en'?'Call signaling created. Real audio/video media unavailable (server not configured/blocked).':'已创建通话信令。真实音视频媒体不可用（服务端未配置/BLOCKED）。')
          : (d.media.reason || ''));
      }
      setNotice(kind==='video' ? (lang==='ar'?'بدء مكالمة فيديو':lang==='en'?'Video call started':'已发起视频通话') : (lang==='ar'?'بدء مكالمة صوتية':lang==='en'?'Audio call started':'已发起语音通话'));
    } catch (e: any) { setConnError(callErrorText(e)); }
    finally { setCallAction(null); }
  };
  const acceptIncomingCall = async () => {
    if (!incomingCall?.id || callAction) return;
    setCallAction('accept'); setCallMediaNote(null);
    try {
      const d = await callApi.accept(token(), incomingCall.id);
      if (d?.call) {
        setActiveCall(d.call); setIncomingCall(null);
        setCallDevices({ micEnabled: d.call.self?.micEnabled ?? true, cameraEnabled: d.call.self?.cameraEnabled ?? (d.call.kind==='video'), screenSharing: !!d.call.self?.screenSharing });
        await joinCallMedia(d.call, d.media);
      }
      if (d?.media?.blocked || d?.media?.ok === false) setCallMediaNote(lang==='ar'?'تم قبول المكالمة (إشارة). وسائط حقيقية غير متاحة/محظورة.':lang==='en'?'Call accepted (signaling). Real media unavailable/blocked.':'已接听（信令）。真实媒体不可用/BLOCKED。');
    } catch (e: any) { setConnError(callErrorText(e)); }
    finally { setCallAction(null); }
  };
  const rejectIncomingCall = async () => {
    if (!incomingCall?.id || callAction) return;
    setCallAction('reject');
    try { await callApi.reject(token(), incomingCall.id); setIncomingCall(null); setNotice(lang==='ar'?'تم رفض المكالمة':lang==='en'?'Call rejected':'已拒绝通话'); }
    catch (e: any) { setConnError(callErrorText(e)); }
    finally { setCallAction(null); }
  };
  const endOrCancelActiveCall = async () => {
    const c = activeCall; if (!c?.id || callAction) return;
    setCallAction('end');
    try {
      await cleanupCallMedia('hangup');
      if (c.status === 'ringing' && c.initiatorId === currentUser?.id) await callApi.cancel(token(), c.id);
      else await callApi.end(token(), c.id);
      setActiveCall((prev: any) => prev?.id === c.id ? { ...prev, status: 'ended' } : prev);
      setNotice(lang==='ar'?'انتهت المكالمة':lang==='en'?'Call ended':'通话已结束');
      setTimeout(()=>setActiveCall((prev: any) => (prev?.id === c.id && ['ended','rejected','missed','busy','failed','canceled'].includes(prev.status)) ? null : prev), 1500);
    } catch (e: any) { setConnError(callErrorText(e)); }
    finally { setCallAction(null); }
  };
  const leaveActiveGroupCall = async () => {
    const c = activeCall; if (!c?.id || c.scope !== 'group' || callAction) return;
    setCallAction('leave');
    try { await cleanupCallMedia('leave'); await callApi.leave(token(), c.id); setActiveCall(null); setNotice(lang==='ar'?'غادرت المكالمة':lang==='en'?'Left call':'已离开通话'); }
    catch (e: any) { setConnError(callErrorText(e)); }
    finally { setCallAction(null); }
  };
  const toggleCallDevice = async (field: 'micEnabled'|'cameraEnabled'|'screenSharing') => {
    const c = activeCall; if (!c?.id) return;
    const next = { ...callDevices, [field]: !callDevices[field] };
    setCallDevices(next);
    try {
      const session = mediaSessionRef.current;
      if (session && ['connecting','connected','reconnecting'].includes(mediaState.phase)) {
        if (field === 'micEnabled') await session.setMicrophoneEnabled(next.micEnabled);
        if (field === 'cameraEnabled') await session.setCameraEnabled(next.cameraEnabled);
        if (field === 'screenSharing') await session.setScreenShareEnabled(next.screenSharing);
      }
    } catch (e:any) { setCallMediaNote(friendlyMediaError(e)); }
    try { if (['connecting','active','reconnecting'].includes(c.status)) await callApi.state(token(), c.id, next); } catch {}
  };
  const switchCallCamera = async () => {
    const session = mediaSessionRef.current; if (!session) { setCallMediaNote(lang==='ar'?'لا يوجد اتصال وسائط نشط':lang==='en'?'No active media connection':'无活动媒体连接'); return; }
    try { await session.switchCamera(); } catch (e:any) { setCallMediaNote(friendlyMediaError(e)); }
  };
  const requestCallMediaToken = async () => {
    const c = activeCall; if (!c?.id || callAction) return;
    setCallAction('token');
    try {
      const d = await callApi.token(token(), c.id);
      if (d?.ok && d.token) {
        setCallMediaNote(lang==='ar'?'تم إصدار رمز وسائط، جارٍ الانضمام…':lang==='en'?'Media token issued, joining…':'已签发媒体令牌，正在加入…');
        await joinCallMedia(c, d);
      } else {
        setCallMediaNote(d?.reason === 'MEDIA_NOT_CONFIGURED' || d?.reason === 'MEDIA_SDK_UNAVAILABLE' ? (lang==='ar'?'وسائط حقيقية غير متاحة (محظور/غير مُعد).':lang==='en'?'Real media unavailable (blocked/not configured).':'真实媒体不可用（BLOCKED/未配置）。') : (d?.reason || 'blocked'));
      }
    } catch (e: any) { const msg = callErrorText(e); setCallMediaNote(msg); }
    finally { setCallAction(null); }
  };
  const startCallMediaPlayback = async () => { try { await mediaSessionRef.current?.startAudioPlayback(); } catch {} };

  // Auto-manage media session lifecycle based on call state
  useEffect(() => {
    const c = activeCall;
    const terminal = c && ['ended','rejected','missed','busy','failed','canceled'].includes(c.status);
    if (!c || terminal) {
      void cleanupCallMedia(terminal ? 'ended' : 'clear');
      return;
    }
    // join when we are in a joinable call and have no media session yet (e.g. caller sees callee accepted via WS)
    if (['connecting','active','reconnecting'].includes(c.status)) {
      if (!mediaSessionRef.current && mediaJoinedCallIdRef.current !== c.id) {
        void joinCallMedia(c);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall?.id, activeCall?.status]);

  // Cleanup on unmount
  useEffect(() => { return () => { void cleanupCallMedia('unmount'); }; }, []);

  const connectGoogle = () => { window.location.href = '/api/auth/google/start'; };
  const connectWechat = () => { window.location.href = '/api/auth/wechat/start'; };

  if (!authed) {
    return (
      <div className="w-full max-w-3xl mx-auto p-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center space-y-3">
          <MessageCircle className="w-10 h-10 text-cyan-400 mx-auto" />
          <h2 className="text-lg font-semibold text-slate-100">Global Messenger</h2>
          <p className="text-sm text-slate-400">请先登录以使用好友、私聊、群聊与实时消息。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto h-[calc(100vh-8rem)] min-h-[620px] p-3 sm:p-4 flex flex-col lg:flex-row gap-4">
      {/* Left panel */}
      <div className="w-full lg:w-[360px] rounded-2xl bg-slate-900/80 border border-slate-800 p-3.5 flex flex-col shrink-0 shadow-xl backdrop-blur-md min-h-0">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-cyan-400" />
            <h2 className="font-bold text-sm text-slate-100">Messenger</h2>
            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${wsStatus==='open'?'text-emerald-300 border-emerald-700/50 bg-emerald-500/10':'text-amber-300 border-amber-700/50 bg-amber-500/10'}`}>
              {wsStatus==='open' ? <Wifi className="w-3 h-3"/> : <WifiOff className="w-3 h-3"/>}{wsStatus}
            </span>
          </div>
          <div className="flex gap-1">
            <button onClick={()=>void openMyProfile()} title={lang==='ar'?'ملفي الشخصي':lang==='en'?'My profile':'我的资料'} className="p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"><UserIcon className="w-3.5 h-3.5"/></button>
            <button onClick={()=>{ setShowCreateGroup(true); void loadFriends(); }} title="创建群聊" className="p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"><Users className="w-3.5 h-3.5"/></button>
            <button onClick={() => setShowIntegrations(v=>!v)} className="p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"><Plug className="w-3.5 h-3.5"/></button>
          </div>
        </div>

        {notice && <div className="mb-2 rounded-lg border border-cyan-700/40 bg-cyan-950/40 px-2.5 py-1.5 text-[11px] text-cyan-200 flex items-center justify-between gap-2"><span>{notice}</span><button onClick={()=>setNotice(null)} className="text-cyan-300">×</button></div>}
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 mb-2 text-[11px]">
          {(['chats','friends','requests','search','msgsearch','notifs','privacy'] as const).map(k => (
            <button key={k} onClick={()=>{ setTab(k); if (k==='notifs') void loadNotifications(); if (k==='privacy') { void loadPrivacy(); void loadBlocked(); void openMyProfile(); } }} className={`relative px-1 py-1.5 rounded-lg border ${tab===k?'bg-cyan-500/15 border-cyan-500/40 text-cyan-200':'bg-slate-950 border-slate-800 text-slate-400'}`}>
              {k==='chats'?(lang==='ar'?'المحادثات':lang==='en'?'Chats':'会话'):k==='friends'?(lang==='ar'?'الأصدقاء':lang==='en'?'Friends':'好友'):k==='requests'?(lang==='ar'?'الطلبات':lang==='en'?'Requests':'申请'):k==='search'?(lang==='ar'?'بحث':lang==='en'?'Search':'找人'):k==='msgsearch'?(lang==='ar'?'الرسائل':lang==='en'?'Msgs':'搜消息'):k==='notifs'?(lang==='ar'?'الإشعارات':lang==='en'?'Notifs':'通知'):(lang==='ar'?'الخصوصية':lang==='en'?'Privacy':'隐私')}
              {k==='notifs' && notifUnread>0 && <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] leading-4">{notifUnread>99?'99+':notifUnread}</span>}
            </button>
          ))}
        </div>

        {showIntegrations && (
          <div className="mb-2 rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 space-y-2">
            <p className="text-[10px] text-slate-500 leading-relaxed">官方接口接入；不支持个人微信/WhatsApp 聊天同步或非官方自动化。</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {integrations.map(it => (
                <div key={it.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-[10px]">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-200">{it.name}</span>
                    {it.id==='google' ? <button onClick={connectGoogle} className="px-2 py-1 rounded bg-white text-slate-900 font-semibold">Google</button>
                    : it.id==='wechat' ? <button onClick={connectWechat} disabled={it.status!=='available'} className={`px-2 py-1 rounded font-semibold ${it.status==='available'?'bg-emerald-500 text-slate-950':'bg-slate-800 text-slate-400'}`}>{it.status==='available'?'微信登录':'未配置'}</button>
                    : <span className={`px-1.5 py-0.5 rounded border ${it.status==='available'?'text-emerald-300 border-emerald-700':'text-amber-300 border-amber-700'}`}>{it.status}</span>}
                  </div>
                  {it.limitations?.[0] && <p className="mt-1 text-amber-300/80 flex gap-1"><ShieldAlert className="w-3 h-3 mt-0.5"/>{it.limitations[0]}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'chats' && (
          <>
            <div className="relative mb-2"><Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" /><input value={convQuery} onChange={e=>setConvQuery(e.target.value)} placeholder="搜索会话…" className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200" /></div>
            <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
              {sorted.map(conv => (
                <button key={conv.id} onClick={()=>onSelectConversation(conv.id)} className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left ${conv.id===activeConv?.id?'bg-cyan-500/15 border border-cyan-500/40':'bg-slate-950/40 border border-slate-800/60 hover:bg-slate-800/60'}`}>
                  {conv.type==='global_channel' ? <div className="w-10 h-10 rounded-full bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-300"><Globe className="w-5 h-5"/></div>
                  : <div className="relative"><img src={conv.otherUser?.avatar || conv.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'} className="w-10 h-10 rounded-full object-cover border border-slate-700"/>{(conv.isOnline || conv.otherUser?.isOnline) && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950"/>}</div>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2"><span className="font-semibold text-xs truncate text-slate-200">{conv.name}</span>{(conv.unreadCount||0)>0 && <span className="text-[10px] px-1.5 rounded-full bg-cyan-500 text-slate-950 font-bold">{conv.unreadCount}</span>}</div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{conv.lastMessage || '暂无消息'}</p>
                  </div>
                </button>
              ))}
              {sorted.length===0 && <div className="text-xs text-slate-500 text-center py-8">暂无会话</div>}
            </div>
          </>
        )}

        {tab === 'friends' && (
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            <div className="flex items-center justify-between"><p className="text-[11px] text-slate-400">好友列表 ({friends.length})</p><button onClick={()=>{void loadFriends(); void loadRecent();}} className="text-[11px] text-cyan-300">刷新</button></div>
            {friends.map(f => (
              <div key={f.id} className="flex items-center gap-2 p-2 rounded-xl border border-slate-800 bg-slate-950/50">
                <button onClick={()=>void openProfile(f.id)} className="shrink-0"><img src={f.avatar} className="w-9 h-9 rounded-full object-cover"/></button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-200 truncate">{f.displayName}</p>
                  <p className="text-[10px] text-slate-500 truncate">@{f.username} · {f.isOnline ? '在线' : (f.lastActiveAt ? `最近活跃 ${new Date(f.lastActiveAt).toLocaleString()}` : '离线')}</p>
                </div>
                <button onClick={()=>openDirect(f.id)} className="px-2 py-1 text-[10px] rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">聊天</button>
                <button onClick={()=>removeFriend(f.id)} className="px-2 py-1 text-[10px] rounded bg-slate-800 text-rose-300">删除</button>
                <button onClick={()=>blockUser(f.id)} className="px-2 py-1 text-[10px] rounded bg-slate-800 text-slate-300">屏蔽</button>
              </div>
            ))}
            {recentConvs.length>0 && <div className="pt-2 border-t border-slate-800 space-y-1.5"><p className="text-[11px] text-slate-400">最近联系人</p>{recentConvs.slice(0,8).map(c => (
              <button key={c.id} onClick={()=>{ onSelectConversation(c.id); setTab('chats'); }} className="w-full flex items-center gap-2 p-2 rounded-lg bg-slate-950/40 border border-slate-800 text-left">
                <img src={c.otherUser?.avatar || c.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'} className="w-7 h-7 rounded-full object-cover"/>
                <div className="flex-1 min-w-0"><p className="text-[11px] text-slate-200 truncate">{c.name}</p><p className="text-[10px] text-slate-500 truncate">{c.lastMessage || ''}</p></div>
                {(c.unreadCount||0)>0 && <span className="text-[10px] px-1.5 rounded-full bg-cyan-500 text-slate-950 font-bold">{c.unreadCount}</span>}
              </button>
            ))}</div>}
            {blocked.length>0 && <div className="pt-2 border-t border-slate-800"><p className="text-[11px] text-slate-400 mb-1">已屏蔽用户</p>{blocked.map(b => (
              <div key={b.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 text-xs"><span className="text-slate-300">{b.displayName}</span><button onClick={()=>unblockUser(b.id)} className="text-cyan-300">解除屏蔽</button></div>
            ))}</div>}
            {friends.length===0 && <div className="text-xs text-slate-500 text-center py-6">暂无好友，可在“查找”添加</div>}
          </div>
        )}

        {tab === 'requests' && (
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            <div className="flex items-center justify-between"><p className="text-[11px] text-slate-400">收到的好友申请 ({incomingReqs.length})</p><button onClick={()=>void loadRequests()} className="text-[11px] text-cyan-300">刷新</button></div>
            {incomingReqs.map(r => (
              <div key={r.id} className="flex items-center gap-2 p-2 rounded-xl border border-slate-800 bg-slate-950/50">
                <button onClick={()=>r.fromUser?.id && void openProfile(r.fromUser.id)}><img src={r.fromUser?.avatar || ''} className="w-8 h-8 rounded-full object-cover"/></button>
                <div className="flex-1 min-w-0"><p className="text-xs text-slate-200 truncate">{r.fromUser?.displayName || r.fromUserId}</p><p className="text-[10px] text-slate-500 truncate">@{r.fromUser?.username || r.fromUserId} {r.fromUser?.isOnline?'· 在线':''}</p></div>
                <button disabled={pendingRequestIds.has(r.id)} onClick={()=>respondRequest(r.id,true)} className="p-1.5 rounded bg-emerald-600/30 text-emerald-300 disabled:opacity-40" title="接受"><Check className="w-3.5 h-3.5"/></button>
                <button disabled={pendingRequestIds.has(r.id)} onClick={()=>respondRequest(r.id,false)} className="p-1.5 rounded bg-rose-600/30 text-rose-300 disabled:opacity-40" title="拒绝"><X className="w-3.5 h-3.5"/></button>
              </div>
            ))}
            {incomingReqs.length===0 && <div className="text-xs text-slate-500">无待处理申请</div>}
            <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-800">我发出的申请 ({outgoingReqs.length})</p>
            {outgoingReqs.map(r => (<div key={r.id} className="flex items-center gap-2 p-2 rounded-xl border border-slate-800 bg-slate-950/50 text-xs text-slate-300"><img src={r.toUser?.avatar || ''} className="w-7 h-7 rounded-full"/><span className="flex-1 truncate">→ {r.toUser?.displayName || r.toUserId}</span><span className="text-slate-500">待确认</span></div>))}
          </div>
        )}

        {tab === 'search' && (
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            <div className="flex gap-2"><input value={userSearch} onChange={e=>setUserSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') void doSearchUsers();}} placeholder="用户名 / 昵称 / ID" className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200"/><button onClick={()=>void doSearchUsers()} className="px-3 rounded-xl bg-cyan-500 text-slate-950 text-xs font-semibold">搜索</button></div>
            {searchResults.map(u => {
              const isFriend = friends.some(f => f.id === u.id);
              const outgoing = outgoingReqs.some(r => r.toUserId === u.id);
              const incoming = incomingReqs.find(r => r.fromUserId === u.id);
              return (
              <div key={u.id} className="flex items-center gap-2 p-2 rounded-xl border border-slate-800 bg-slate-950/50">
                <button onClick={()=>void openProfile(u.id)}><img src={u.avatar} className="w-9 h-9 rounded-full object-cover"/></button>
                <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-slate-200 truncate">{u.displayName}</p><p className="text-[10px] text-slate-500 truncate">@{u.username} · {u.isOnline?'在线':(u.lastActiveAt?`最近 ${new Date(u.lastActiveAt).toLocaleString()}`:'离线')}</p></div>
                {isFriend ? <span className="text-[10px] text-emerald-300">已是好友</span> : incoming ? <button onClick={()=>respondRequest(incoming.id,true)} className="px-2 py-1 text-[10px] rounded bg-emerald-600/30 text-emerald-300">接受</button> : outgoing ? <span className="text-[10px] text-slate-400">已申请</span> : <button disabled={pendingRequestIds.has(u.id)} onClick={()=>sendFriendRequest(u.id)} className="p-1.5 rounded bg-slate-800 text-cyan-300 disabled:opacity-40" title="加好友"><UserPlus className="w-3.5 h-3.5"/></button>}
                <button onClick={()=>openDirect(u.id)} className="px-2 py-1 text-[10px] rounded bg-cyan-500/20 text-cyan-300">私聊</button>
              </div>
            );})}
            {searchResults.length===0 && userSearch.trim() && <div className="text-xs text-slate-500 text-center py-4">无匹配用户</div>}
          </div>
        )}

        {tab === 'msgsearch' && (
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            <input value={msgQuery} onChange={e=>setMsgQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') void doSearchMessages();}} placeholder="关键词（消息内容/附件名）" className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200"/>
            <div className="grid grid-cols-2 gap-2">
              <select value={msgConvId} onChange={e=>{setMsgConvId(e.target.value); setMsgSender('');}} className="px-2 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200">
                <option value="">全部会话</option>
                {conversations.filter(c=>c.type!=='country_room').map(c => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
              </select>
              <select value={msgSender} onChange={e=>setMsgSender(e.target.value)} className="px-2 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200">
                <option value="">全部发送者</option>
                {(() => {
                  const opts: {id:string; name:string}[] = [];
                  const seen = new Set<string>();
                  const add = (id?:string,name?:string)=>{ if(!id||seen.has(id)) return; seen.add(id); opts.push({id,name:name||id}); };
                  add(currentUser?.id, currentUser?.displayName || '我');
                  for (const c of conversations) {
                    if (msgConvId && c.id !== msgConvId) continue;
                    if (c.otherUser) add(c.otherUser.id, c.otherUser.displayName);
                    for (const p of (c as any).members || []) add(p.id, p.displayName);
                    for (const pid of c.participantIds || []) add(pid, pid);
                  }
                  for (const f of friends) add(f.id, f.displayName);
                  return opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>);
                })()}
              </select>
            </div>
            <button onClick={()=>void doSearchMessages()} disabled={msgSearching} className="w-full px-3 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-semibold disabled:opacity-40">{msgSearching?'搜索中…':'搜索消息'}</button>
            <div className="text-[10px] text-slate-500">支持关键词、发送者、会话筛选（真实后端搜索）</div>
            {msgResults.map(m => (
              <button key={m.id} onClick={()=>{ onSelectConversation(m.conversationId); setTab('chats'); }} className="w-full text-left p-2.5 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/60 space-y-1">
                <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-slate-200 truncate">{(m as any).conversationName || m.conversationId}</span><span className="text-[10px] text-slate-500 shrink-0">{new Date(m.createdAt).toLocaleString()}</span></div>
                <p className="text-[11px] text-slate-300 truncate">{m.senderName}: {m.content || (m.attachments?.length ? `[附件] ${m.attachments.map(a=>a.name).join(', ')}` : '')}</p>
              </button>
            ))}
            {msgResults.length===0 && (msgQuery.trim()||msgSender||msgConvId) && !msgSearching && <div className="text-xs text-slate-500 text-center py-4">无匹配消息</div>}
          </div>
        )}
        {tab === 'privacy' && (
          <div className="flex-1 overflow-y-auto space-y-3 min-h-0" dir={lang==='ar'?'rtl':'ltr'}>
            {(() => {
              const L = (zh:string,en:string,ar:string) => lang==='ar'?ar:lang==='en'?en:zh;
              const draft = normalizePrivacy(privacyDraft || privacy || defaultPrivacy());
              const self = (selectedProfile?.isSelf ? selectedProfile.user : (currentUser as any)) || {};
              const bindings = self.bindingStatus || {};
              const linked = Array.isArray(self.linkedIdentities) ? self.linkedIdentities : [];
              const Section = ({title, children}: any) => (<div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 space-y-2"><p className="text-xs font-semibold text-slate-200">{title}</p>{children}</div>);
              const Radio = ({name, value, label, desc}: any) => (
                <label className="flex items-start gap-2 py-1 cursor-pointer">
                  <input type="radio" name={name} checked={draft[name]===value} onChange={()=>updatePrivacy({ [name]: value })} className="mt-0.5 accent-cyan-500" />
                  <span className="min-w-0"><span className="block text-[11px] text-slate-200">{label}</span>{desc && <span className="block text-[10px] text-slate-500">{desc}</span>}</span>
                </label>
              );
              const Toggle = ({k, label, desc}: any) => (
                <label className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0"><span className="block text-[11px] text-slate-200">{label}</span>{desc && <span className="block text-[10px] text-slate-500">{desc}</span>}</span>
                  <input type="checkbox" checked={!!draft[k]} onChange={e=>updatePrivacy({ [k]: e.target.checked })} className="h-4 w-4 accent-cyan-500" />
                </label>
              );
              return (<>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{L('隐私与安全','Privacy & Security','الخصوصية والأمان')}</p>
                    <p className="text-[10px] text-slate-500">{L('设置保存在服务器并跨设备同步；服务器始终强制执行。','Settings are saved on server, synced across devices, and enforced by server.','يتم حفظ الإعدادات على الخادم ومزامنتها عبر الأجهزة ويفرضها الخادم.')}</p>
                  </div>
                  <button onClick={()=>{ void loadPrivacy(); void loadBlocked(); }} disabled={privacyLoading} className="text-[10px] px-2 py-1 rounded border border-slate-700 text-slate-300 disabled:opacity-40">{privacyLoading ? L('加载中…','Loading…','جارٍ التحميل…') : L('刷新','Reload','تحديث')}</button>
                </div>

                <Section title={L('个人资料可见性','Profile visibility','ظهور الملف الشخصي')}>
                  <Radio name="profileVisibility" value="everyone" label={L('所有人可见','Everyone','الجميع')} />
                  <Radio name="profileVisibility" value="friends" label={L('仅好友可见','Friends only','الأصدقاء فقط')} />
                  <Radio name="profileVisibility" value="self" label={L('仅自己可见','Only me','أنا فقط')} />
                </Section>

                <Section title={L('搜索可见性','Search visibility','ظهور البحث')}>
                  <Toggle k="searchableByUsername" label={L('允许通过用户名搜索','Searchable by username','قابل للبحث باسم المستخدم')} />
                  <Toggle k="searchableById" label={L('允许通过唯一 ID 搜索','Searchable by unique ID','قابل للبحث بالمعرّف الفريد')} />
                  <Toggle k="searchableByDisplayName" label={L('允许通过昵称搜索','Searchable by display name','قابل للبحث بالاسم المعروض')} />
                  <p className="text-[10px] text-slate-500">{L('关闭全部选项将使他人无法通过搜索找到你。','Disabling all options prevents others from finding you via search.','تعطيل جميع الخيارات يمنع الآخرين من العثور عليك عبر البحث.')}</p>
                </Section>

                <Section title={L('好友申请权限','Friend request permissions','أذونات طلبات الصداقة')}>
                  <Radio name="friendRequestPolicy" value="everyone" label={L('所有人','Everyone','الجميع')} />
                  <Radio name="friendRequestPolicy" value="mutual_group" label={L('仅共同群组用户','Mutual group members only','أعضاء المجموعات المشتركة فقط')} />
                  <Radio name="friendRequestPolicy" value="none" label={L('禁止陌生人申请','Do not accept requests','عدم قبول الطلبات')} />
                </Section>

                <Section title={L('在线状态与活跃时间','Online status & activity','حالة الاتصال والنشاط')}>
                  <Toggle k="showOnlineStatus" label={L('展示在线状态','Show online status','إظهار حالة الاتصال')} />
                  <Toggle k="showLastActive" label={L('展示最近活跃时间','Show last active time','إظهار آخر وقت نشاط')} />
                  <p className="text-[10px] text-slate-500">{L('关闭后，其他用户无法通过界面或接口获取被隐藏的信息。','When off, others cannot obtain hidden info via UI or APIs.','عند الإيقاف، لا يمكن للآخرين الحصول على المعلومات المخفية عبر الواجهة أو الواجهات البرمجية.')}</p>
                </Section>

                <Section title={L('陌生人消息','Messages from strangers','رسائل الغرباء')}>
                  <Radio name="strangerMessagePolicy" value="everyone" label={L('所有人可以发送','Everyone can message','يمكن للجميع الإرسال')} />
                  <Radio name="strangerMessagePolicy" value="friends" label={L('仅好友可以发送','Friends only','الأصدقاء فقط')} />
                  <Radio name="strangerMessagePolicy" value="mutual_group" label={L('仅共同群组用户可以发送','Friends or mutual group members','الأصدقاء أو أعضاء المجموعات المشتركة')} />
                </Section>

                <Section title={L('已读回执','Read receipts','إيصالات القراءة')}>
                  <Toggle k="readReceipts" label={L('发送已读回执','Send read receipts','إرسال إيصالات القراءة')} desc={L('关闭后，你仍可正常阅读消息，但不会向对方发送新的已读状态。','When off, you can still read messages but won’t send new read status to others.','عند الإيقاف، يمكنك قراءة الرسائل لكن لن ترسل حالة القراءة للآخرين.')} />
                </Section>

                <Section title={L('屏蔽名单','Blocked users','المستخدمون المحظورون')}>
                  <p className="text-[10px] text-slate-500">{L('屏蔽会阻止新的好友申请和受限的私聊互动，抑制对方通知，并隐藏相应在线状态；不会自动删除历史记录或移除共同群组。','Blocking prevents new friend requests and restricted direct interactions, suppresses notifications, and hides presence; it does not auto-delete history or remove mutual groups.','يمنع الحظر طلبات الصداقة الجديدة والتفاعلات المباشرة المقيدة ويخفي الحالة؛ ولا يحذف السجل تلقائيًا ولا يزيل المجموعات المشتركة.')}</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {blocked.map(b => (
                      <div key={b.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-xs">
                        <button onClick={()=>void openProfile(b.id)} className="flex items-center gap-2 min-w-0 text-left">
                          <img src={b.avatar} className="w-7 h-7 rounded-full object-cover" />
                          <span className="text-slate-200 truncate">{b.displayName}</span>
                        </button>
                        <button onClick={()=>void unblockUser(b.id)} className="text-cyan-300 shrink-0">{L('解除屏蔽','Unblock','إلغاء الحظر')}</button>
                      </div>
                    ))}
                    {blocked.length===0 && <div className="text-xs text-slate-500 py-2">{L('暂无屏蔽用户','No blocked users','لا يوجد مستخدمون محظورون')}</div>}
                  </div>
                </Section>

                <Section title={L('聊天记录管理','Chat history management','إدارة سجل الدردشة')}>
                  <div className="space-y-1.5 text-[11px] text-slate-300">
                    <p>• {L('清除当前设备本地缓存：仅清理本设备内存中的会话视图，不影响服务器或其他设备。','Clear local cache on this device: clears in-memory view only; does not affect server or other devices.','مسح ذاكرة التخزين المؤقت المحلية: يمسح العرض المحلي فقط.')}</p>
                    <p>• {L('删除自己视图中的聊天记录：在会话中使用“清除记录”，仅对你隐藏，不删除对方记录。','Delete chat history in your view: use “Clear” in a conversation to hide for you only.','حذف السجل من عرضك: استخدم "مسح" داخل المحادثة لإخفائه لك فقط.')}</p>
                    <p>• {L('删除单条消息：对你删除单条消息，不影响对方。','Delete a single message: removes it for you only.','حذف رسالة واحدة: يزيلها لك فقط.')}</p>
                    <p>• {L('双方撤回消息：撤回对双方生效（按现有撤回机制与时效）。','Recall for both sides: follows existing recall behavior/timing.','سحب الرسالة للطرفين: وفق آلية السحب الحالية.')}</p>
                    <button onClick={()=>{ setMessages([]); setNotice(L('已清除本设备会话缓存视图','Cleared local conversation cache view','تم مسح عرض ذاكرة المحادثات المحلية')); }} className="mt-1 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800">{L('清除当前设备本地缓存','Clear local device cache','مسح ذاكرة الجهاز المحلية')}</button>
                  </div>
                </Section>

                <Section title={L('账户安全信息','Account security','أمان الحساب')}>
                  <div className="grid grid-cols-1 gap-2 text-[11px]">
                    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5"><p className="text-slate-500">{L('唯一用户 ID','Unique User ID','معرّف المستخدم الفريد')}</p><p className="text-slate-200 break-all mt-0.5">{self.id || '-'}</p></div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5"><p className="text-slate-500">Email</p><p className="text-slate-200 mt-0.5">{bindings.email?.bound ? `${bindings.email?.value || L('已绑定','Bound','مرتبط')} (${bindings.email?.verified?L('已验证','verified','موثّق'):L('未验证','unverified','غير موثّق')})` : L('未绑定','Not bound','غير مرتبط')}</p></div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5"><p className="text-slate-500">{L('手机','Phone','الهاتف')}</p><p className="text-slate-200 mt-0.5">{bindings.phone?.bound ? `${bindings.phone?.value || L('已绑定','Bound','مرتبط')} (${bindings.phone?.verified?L('已验证','verified','موثّق'):L('未验证','unverified','غير موثّق')})` : L('未绑定','Not bound','غير مرتبط')}</p></div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5"><p className="text-slate-500">Google</p><p className="text-slate-200 mt-0.5">{bindings.google?.bound ? L('已绑定','Bound','مرتبط') : L('未绑定 (config required)','Not bound (config required)','غير مرتبط (يتطلب إعدادًا)')}</p></div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5"><p className="text-slate-500">WeChat</p><p className="text-slate-200 mt-0.5">{bindings.wechat?.bound ? L('已绑定','Bound','مرتبط') : L('未绑定 (config required)','Not bound (config required)','غير مرتبط (يتطلب إعدادًا)')}</p></div>
                    {Array.isArray(linked) && linked.length > 0 && <p className="text-[10px] text-slate-500">{L('已关联身份','Linked identities','الهويات المرتبطة')}: {linked.map((i:any)=>i.provider).join(', ')}</p>}
                  </div>
                </Section>

                <div className="sticky bottom-0 bg-slate-900/95 backdrop-blur py-2 border-t border-slate-800 flex items-center justify-between gap-2">
                  <div className="text-[10px] min-h-[16px]">
                    {privacyStatus==='saving' && <span className="text-cyan-300">{L('保存中…','Saving…','جارٍ الحفظ…')}</span>}
                    {privacyStatus==='saved' && <span className="text-emerald-300">{L('已保存并同步','Saved & synced','تم الحفظ والمزامنة')}</span>}
                    {privacyStatus==='error' && <span className="text-rose-300">{L('保存失败','Save failed','فشل الحفظ')}{privacyError?`: ${privacyError}`:''}</span>}
                    {privacyStatus==='idle' && privacyError && <span className="text-rose-300">{privacyError}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={()=>void loadPrivacy()} className="text-[10px] px-3 py-1.5 rounded border border-slate-700 text-slate-300">{L('重置','Reset','إعادة تعيين')}</button>
                    <button onClick={()=>void savePrivacy()} disabled={privacySaving || !privacyDraft} className="text-[10px] px-3 py-1.5 rounded bg-cyan-500 text-slate-950 font-semibold disabled:opacity-40">{L('保存设置','Save settings','حفظ الإعدادات')}</button>
                  </div>
                </div>
              </>);
            })()}
          </div>
        )}

        {tab === 'notifs' && (
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-slate-400">{lang==='ar' ? 'مركز الإشعارات' : lang==='en' ? 'Notification Center' : '通知中心'} · {lang==='ar' ? 'غير مقروء' : lang==='en' ? 'Unread' : '未读'} {notifUnread}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={()=>{ setShowNotifSettings((v:boolean)=>!v); if (!notifPrefs) void loadNotifPrefs(); }} className={`p-1.5 rounded border ${showNotifSettings?'border-cyan-500/50 text-cyan-300 bg-cyan-500/10':'border-slate-700 text-slate-300 hover:bg-slate-800'}`} title={lang==='ar'?'الإعدادات':lang==='en'?'Settings':'设置'}><Settings className="w-3.5 h-3.5"/></button>
                <button onClick={()=>void loadNotifications()} className="text-[11px] text-cyan-300">{lang==='ar'?'تحديث':lang==='en'?'Refresh':'刷新'}</button>
                <button onClick={()=>void markAllNotifsRead()} className="text-[11px] text-cyan-300 inline-flex items-center gap-1"><CheckCheck className="w-3 h-3"/>{lang==='ar'?'قراءة الكل':lang==='en'?'Read all':'全部已读'}</button>
              </div>
            </div>

            {showNotifSettings && (
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 space-y-3" dir={lang==='ar'?'rtl':'ltr'}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-100">{lang==='ar'?'إعدادات الإشعارات':lang==='en'?'Notification Settings':'通知设置'}</p>
                    <p className="text-[10px] text-slate-500">{lang==='ar'?'تُحفظ على الخادم وتُزامن عبر الأجهزة.':lang==='en'?'Saved on server and synced across devices.':'保存在服务器并跨设备同步。'}</p>
                  </div>
                  <button onClick={()=>void loadNotifPrefs()} disabled={notifPrefsLoading} className="text-[10px] px-2 py-1 rounded border border-slate-700 text-slate-300 disabled:opacity-40">{notifPrefsLoading ? (lang==='ar'?'جارٍ التحميل…':lang==='en'?'Loading…':'加载中…') : (lang==='ar'?'إعادة تحميل':lang==='en'?'Reload':'重载')}</button>
                </div>
                {(() => {
                  const draft = notifPrefsDraft || notifPrefs || defaultNotifPrefs();
                  const row = (key: string, label: string, desc?: string) => (
                    <label key={key} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="min-w-0">
                        <span className="block text-[11px] text-slate-200">{label}</span>
                        {desc && <span className="block text-[10px] text-slate-500">{desc}</span>}
                      </span>
                      <input type="checkbox" checked={!!draft[key]} onChange={e=>updateNotifPref({ [key]: e.target.checked })} className="h-4 w-4 accent-cyan-500" />
                    </label>
                  );
                  return (
                    <div className="space-y-1">
                      {row('messages', lang==='ar'?'إشعارات الرسائل الجديدة':lang==='en'?'New message notifications':'新消息通知')}
                      {row('friendRequests', lang==='ar'?'إشعارات طلبات الصداقة':lang==='en'?'Friend request notifications':'好友申请通知')}
                      {row('friendAccepted', lang==='ar'?'إشعارات قبول الصداقة':lang==='en'?'Friend accepted notifications':'好友通过通知')}
                      {row('groupEvents', lang==='ar'?'إشعارات المجموعة والإدارة':lang==='en'?'Group & admin event notifications':'群聊/群邀请/群管理通知')}
                      <div className="h-px bg-slate-800 my-1" />
                      {row('desktop', lang==='ar'?'إشعارات سطح المكتب':lang==='en'?'Desktop system notifications':'桌面系统通知', lang==='ar'?'يتطلب إذن النظام/إلكترون.':lang==='en'?'Requires system/Electron permission.':'需系统/Electron 权限。')}
                      {row('sound', lang==='ar'?'صوت الإشعار':lang==='en'?'Notification sound':'通知声音')}
                      <div className="h-px bg-slate-800 my-1" />
                      {row('dndEnabled', lang==='ar'?'وضع عدم الإزعاج':lang==='en'?'Do Not Disturb':'免打扰模式', lang==='ar'?'يُكتم الصوت والتنبيهات مع استمرار حفظ الرسائل والإشعارات.':lang==='en'?'Mutes alerts/sound; messages and notifications are still saved.':'静音并关闭提醒；消息和通知仍正常接收保存。')}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <label className="text-[10px] text-slate-400 space-y-1">
                          <span>{lang==='ar'?'وقت البدء':lang==='en'?'Start time':'开始时间'}</span>
                          <input type="time" value={draft.dndStart || '22:00'} onChange={e=>updateNotifPref({ dndStart: e.target.value })} disabled={!draft.dndEnabled} className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 disabled:opacity-50" />
                        </label>
                        <label className="text-[10px] text-slate-400 space-y-1">
                          <span>{lang==='ar'?'وقت الانتهاء':lang==='en'?'End time':'结束时间'}</span>
                          <input type="time" value={draft.dndEnd || '08:00'} onChange={e=>updateNotifPref({ dndEnd: e.target.value })} disabled={!draft.dndEnabled} className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 disabled:opacity-50" />
                        </label>
                      </div>
                      {draft.dndEnabled && draft.dndStart === draft.dndEnd && <p className="text-[10px] text-amber-300">{lang==='ar'?'وقت البدء والانتهاء متطابقان — لن يتم تفعيل عدم الإزعاج.':lang==='en'?'Start and end are equal — DND will not activate.':'开始与结束时间相同 — 免打扰不会生效。'}</p>}
                    </div>
                  );
                })()}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="text-[10px] min-h-[16px]">
                    {notifPrefsStatus==='saving' && <span className="text-cyan-300">{lang==='ar'?'جارٍ الحفظ…':lang==='en'?'Saving…':'保存中…'}</span>}
                    {notifPrefsStatus==='saved' && <span className="text-emerald-300">{lang==='ar'?'تم الحفظ':lang==='en'?'Saved':'保存成功'}</span>}
                    {notifPrefsStatus==='error' && <span className="text-rose-300">{lang==='ar'?'فشل الحفظ':lang==='en'?'Save failed':'保存失败'}{notifPrefsError?`: ${notifPrefsError}`:''}</span>}
                    {notifPrefsStatus==='idle' && notifPrefsError && <span className="text-rose-300">{notifPrefsError}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={()=>{ void ensureAudioUnlocked(); void playNotifSound(); }} className="text-[10px] px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1"><Volume2 className="w-3 h-3"/>{lang==='ar'?'اختبار':lang==='en'?'Test':'测试'}</button>
                    <button onClick={()=>void saveNotifPrefs()} disabled={notifPrefsSaving || !notifPrefsDraft} className="text-[10px] px-3 py-1.5 rounded bg-cyan-500 text-slate-950 font-semibold disabled:opacity-40">{lang==='ar'?'حفظ':lang==='en'?'Save':'保存'}</button>
                  </div>
                </div>
              </div>
            )}

            {notifications.map(n => (
              <div key={n.id} className={`p-2.5 rounded-xl border text-left space-y-1 ${n.read ? 'border-slate-800 bg-slate-950/40' : 'border-cyan-700/40 bg-cyan-950/20'}`}>
                <button onClick={()=>void openNotification(n)} className="w-full text-left space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {n.actorAvatar ? <img src={n.actorAvatar} className="w-6 h-6 rounded-full object-cover"/> : <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center"><Bell className="w-3 h-3 text-slate-300"/></div>}
                      <p className="text-xs font-semibold text-slate-200 truncate">{n.title || (lang==='ar'?'إشعار':lang==='en'?'Notification':'通知')}</p>
                    </div>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-cyan-400 mt-1 shrink-0"/>}
                  </div>
                  {n.body && <p className="text-[11px] text-slate-400 line-clamp-2">{n.body}</p>}
                  <p className="text-[10px] text-slate-500">{new Date(n.createdAt).toLocaleString()}</p>
                </button>
                <div className="flex items-center gap-2 pt-1">
                  {!n.read && <button onClick={()=>void markNotifRead(n.id)} className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-200">{lang==='ar'?'وضع علامة مقروء':lang==='en'?'Mark read':'标记已读'}</button>}
                  <button onClick={()=>void deleteNotif(n.id)} className="text-[10px] px-2 py-1 rounded bg-slate-800 text-rose-300 inline-flex items-center gap-1"><Trash2 className="w-3 h-3"/>{lang==='ar'?'حذف':lang==='en'?'Delete':'删除'}</button>
                </div>
              </div>
            ))}
            {notifHasMore && <button onClick={()=>void loadNotifications({ append: true, before: notifNextBefore || undefined })} disabled={notifLoading} className="w-full text-[11px] px-3 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40">{notifLoading?(lang==='ar'?'جارٍ التحميل…':lang==='en'?'Loading…':'加载中…'):(lang==='ar'?'تحميل المزيد':lang==='en'?'Load more':'加载更多')}</button>}
            {notifications.length===0 && !notifLoading && <div className="text-xs text-slate-500 text-center py-8">{lang==='ar'?'لا توجد إشعارات':lang==='en'?'No notifications':'暂无通知'}</div>}
            {notifLoading && notifications.length===0 && <div className="text-xs text-slate-500 text-center py-8">{lang==='ar'?'جارٍ التحميل…':lang==='en'?'Loading…':'加载中…'}</div>}
          </div>
        )}
      </div>

      {/* Right: chat */}
      <div className="flex-1 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col shadow-xl backdrop-blur-md overflow-hidden min-h-0">
        <div className="p-3.5 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-3 bg-slate-950/40">
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-slate-100 truncate flex items-center gap-2">{activeConv?.name || 'Chat'} {activeConv?.type==='group' && <span className="text-[10px] px-1.5 rounded bg-slate-800 text-slate-300">群聊</span>}</h3>
            <p className="text-[11px] text-slate-400 truncate">{typingNames ? `${typingNames} 正在输入…` : (activeConv?.otherUser?.isOnline || activeConv?.isOnline ? '在线' : 'Earth One Messenger')}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {canStartCallHere && (
              <div className="flex items-center gap-1">
                <button onClick={()=>void startCall('audio')} disabled={!!callAction || (activeCall && ['ringing','connecting','active','reconnecting'].includes(activeCall.status))} className="p-1.5 rounded border border-slate-700 text-emerald-300 hover:bg-slate-800 disabled:opacity-40" title={lang==='ar'?'مكالمة صوتية':lang==='en'?'Audio call':'语音通话'}><Phone className="w-3.5 h-3.5"/></button>
                <button onClick={()=>void startCall('video')} disabled={!!callAction || (activeCall && ['ringing','connecting','active','reconnecting'].includes(activeCall.status))} className="p-1.5 rounded border border-slate-700 text-cyan-300 hover:bg-slate-800 disabled:opacity-40" title={lang==='ar'?'مكالمة فيديو':lang==='en'?'Video call':'视频通话'}><Video className="w-3.5 h-3.5"/></button>
              </div>
            )}
            {activeConv?.type === 'group' && <button onClick={()=>{ setShowGroupPanel(v=>!v); if (!showGroupPanel) void loadGroupDetail(activeConv.id); }} className="p-1.5 rounded border border-slate-700 text-slate-300" title="群信息"><Info className="w-3.5 h-3.5"/></button>}
            <Languages className="w-4 h-4 text-cyan-400" />
            <select value={targetTranslateLang} onChange={e=>setTargetTranslateLang(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs"><option value="Chinese">中文</option><option value="English">English</option><option value="Arabic">العربية</option><option value="Spanish">Español</option><option value="French">Français</option><option value="Russian">Русский</option></select>
            <button onClick={()=>setAutoTranslate(v=>!v)} className={`px-2 py-1 rounded text-[11px] border ${autoTranslate?'bg-cyan-500/20 text-cyan-300 border-cyan-500/50':'bg-slate-800 text-slate-400 border-slate-700'}`}>{autoTranslate?'AUTO':'OFF'}</button>
            <button onClick={()=>void fetchMessages(false)} className="p-1.5 rounded border border-slate-700 text-slate-300"><RefreshCw className="w-3.5 h-3.5"/></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {incomingCall && incomingCall.initiatorId !== currentUser?.id && ['ringing','connecting'].includes(incomingCall.status) && (
            <div className="rounded-xl border border-cyan-700/50 bg-cyan-950/40 px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-cyan-100">{incomingCall.kind === 'video' ? (lang==='ar'?'مكالمة فيديو واردة':lang==='en'?'Incoming video call':'视频来电') : (lang==='ar'?'مكالمة صوتية واردة':lang==='en'?'Incoming audio call':'语音来电')}</p>
                  <p className="text-[11px] text-cyan-200/80 truncate">{incomingCall.scope === 'group' ? (lang==='ar'?'مكالمة جماعية':lang==='en'?'Group call':'群组通话') : (lang==='ar'?'مكالمة مباشرة':lang==='en'?'Direct call':'一对一通话')} · {callStatusLabel(incomingCall.status)}</p>
                </div>
                <span className="text-[10px] text-cyan-300/80">{incomingCall.id?.slice(-8)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={()=>void acceptIncomingCall()} disabled={!!callAction} className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40"><Phone className="w-3.5 h-3.5"/>{lang==='ar'?'قبول':lang==='en'?'Accept':'接听'}</button>
                <button onClick={()=>void rejectIncomingCall()} disabled={!!callAction} className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-200 border border-rose-500/40 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40"><PhoneOff className="w-3.5 h-3.5"/>{lang==='ar'?'رفض':lang==='en'?'Reject':'拒绝'}</button>
              </div>
              <p className="text-[10px] text-cyan-200/70">{lang==='ar'?'طبقة الإشارة من EARTH ONE؛ الوسائط الحقيقية تتطلب خادم وسائط مُهيأ.':lang==='en'?'EARTH ONE signaling only; real media requires configured media runtime.':'EARTH ONE 信令层；真实音视频需已配置媒体运行时。'}</p>
            </div>
          )}
          {activeCall && (() => {
            const mediaPhase = mediaState.phase || 'idle';
            const mediaParticipants = Object.values(mediaState.participants || {});
            const remoteAudioParticipants = mediaParticipants.filter((p: any) => !p.isLocal && (p.audioTrack || p.audioEnabled));
            const remoteVideoTiles = mediaParticipants.filter((p: any) => !p.isLocal);
            const localP: any = mediaParticipants.find((p: any) => p.isLocal) || null;
            const participantUsers: any[] = Array.isArray(activeCall.users) ? activeCall.users : [];
            const nameFor = (id: string) => {
              const fromState = mediaParticipants.find((p:any)=>p.identity===id);
              if (fromState?.name) return fromState.name;
              const u = participantUsers.find((x:any)=>x.id===id); if (u?.displayName) return u.displayName;
              if (id === currentUser?.id) return currentUser?.displayName || 'Me';
              return id?.slice(0,8) || 'participant';
            };
            const qualityLabel = (q?: string) => {
              const v = String(q||'').toLowerCase();
              if (v.includes('excellent')) return lang==='ar'?'ممتازة':lang==='en'?'Excellent':'优秀';
              if (v.includes('good')) return lang==='ar'?'جيدة':lang==='en'?'Good':'良好';
              if (v.includes('poor')) return lang==='ar'?'ضعيفة':lang==='en'?'Poor':'较差';
              if (v.includes('lost')) return lang==='ar'?'مفقودة':lang==='en'?'Lost':'丢失';
              return lang==='ar'?'غير معروف':lang==='en'?'Unknown':'未知';
            };
            const mediaPhaseLabel = ({ idle: lang==='ar'?'خامل':lang==='en'?'Idle':'空闲', acquiring: lang==='ar'?'جارٍ الحصول على الأجهزة':lang==='en'?'Acquiring devices':'获取设备中', connecting: lang==='ar'?'جارٍ اتصال الوسائط':lang==='en'?'Connecting media':'媒体连接中', connected: lang==='ar'?'الوسائط متصلة':lang==='en'?'Media connected':'媒体已连接', reconnecting: lang==='ar'?'إعادة اتصال الوسائط':lang==='en'?'Reconnecting media':'媒体重连中', disconnected: lang==='ar'?'انقطع اتصال الوسائط':lang==='en'?'Media disconnected':'媒体已断开', failed: lang==='ar'?'فشل الوسائط':lang==='en'?'Media failed':'媒体失败', blocked: lang==='ar'?'الوسائط محظورة/غير مُعدة':lang==='en'?'Media blocked/unconfigured':'媒体被阻止/未配置' } as any)[mediaPhase] || mediaPhase;
            return (
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-100 inline-flex items-center gap-1.5">{activeCall.kind === 'video' ? <Video className="w-3.5 h-3.5 text-cyan-300"/> : <Phone className="w-3.5 h-3.5 text-emerald-300"/>}{activeCall.kind === 'video' ? (lang==='ar'?'مكالمة فيديو':lang==='en'?'Video call':'视频通话') : (lang==='ar'?'مكالمة صوتية':lang==='en'?'Audio call':'语音通话')} · {callStatusLabel(activeCall.status)}</p>
                  <p className="text-[11px] text-slate-400 truncate">{activeCall.scope === 'group' ? (lang==='ar'?'جماعية':lang==='en'?'Group':'群组') : (lang==='ar'?'مباشرة':lang==='en'?'Direct':'一对一')} · {(activeCall.participantIds || []).length} {lang==='ar'?'مشاركين':lang==='en'?'participants':'参与者'} · {mediaPhaseLabel}{activeCall.roomName ? ` · ${activeCall.roomName}` : ''}</p>
                </div>
                <span className="text-[10px] text-slate-500">{activeCall.id?.slice(-8)}</span>
              </div>

              {!mediaState.canPlaybackAudio && ['connected','reconnecting','connecting'].includes(mediaPhase) && remoteAudioParticipants.length > 0 && (
                <button onClick={()=>void startCallMediaPlayback()} className="w-full text-[11px] px-2.5 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 inline-flex items-center justify-center gap-2"><Volume2 className="w-3.5 h-3.5"/>{lang==='ar'?'انقر لتشغيل الصوت الوارد':lang==='en'?'Click to enable incoming audio playback':'点击启用来电音频播放'}</button>
              )}

              {['connecting','active','reconnecting','ringing'].includes(activeCall.status) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(remoteVideoTiles.length ? remoteVideoTiles : (activeCall.participantIds||[]).filter((id:string)=>id!==currentUser?.id).map((id:string)=>({ identity:id, isLocal:false, audioEnabled: !!activeCall.participants?.[id]?.micEnabled, videoEnabled: !!activeCall.participants?.[id]?.cameraEnabled, screenShareEnabled: !!activeCall.participants?.[id]?.screenSharing, speaking:false, connectionQuality: mediaState.connectionQuality, audioTrack:null, videoTrack:null, screenTrack:null }))).map((p:any) => (
                    <div key={p.identity} className="rounded-lg border border-slate-800 bg-slate-900/70 overflow-hidden">
                      <div className="aspect-video bg-slate-950 flex items-center justify-center relative">
                        {p.videoTrack ? <CallTrackView track={p.videoTrack} kind="video" className="w-full h-full object-cover" /> : p.screenTrack ? <CallTrackView track={p.screenTrack} kind="video" className="w-full h-full object-contain bg-black" /> : <div className="flex flex-col items-center gap-2 text-slate-500"><UserIcon className="w-8 h-8"/><span className="text-[11px]">{activeCall.kind==='video' ? (lang==='ar'?'لا يوجد فيديو':lang==='en'?'No video':'无视频画面') : (lang==='ar'?'مكالمة صوتية':lang==='en'?'Audio call':'语音通话')}</span></div>}
                        {p.speaking && <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-500/40">{lang==='ar'?'يتحدث':lang==='en'?'Speaking':'正在说话'}</span>}
                      </div>
                      <div className="px-2.5 py-2 space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[11px]"><span className="text-slate-200 truncate">{nameFor(p.identity)}</span><span className="text-slate-500">{p.isLocal ? (lang==='ar'?'أنت':lang==='en'?'You':'我') : (lang==='ar'?'مشارك':lang==='en'?'Participant':'参与者')}</span></div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span className="inline-flex items-center gap-1">{p.audioEnabled ? <Mic className="w-3 h-3 text-emerald-300"/> : <MicOff className="w-3 h-3 text-rose-300"/>}{p.audioEnabled ? (lang==='ar'?'ميكروفون':lang==='en'?'Mic':'麦克风') : (lang==='ar'?'كتم':lang==='en'?'Muted':'静音')}</span>
                          <span className="inline-flex items-center gap-1">{p.videoEnabled ? <Video className="w-3 h-3 text-cyan-300"/> : <VideoOff className="w-3 h-3 text-slate-500"/>}{p.videoEnabled ? (lang==='ar'?'كاميرا':lang==='en'?'Cam':'摄像头') : (lang==='ar'?'بلا كاميرا':lang==='en'?'Cam off':'关摄像头')}</span>
                          {p.screenShareEnabled && <span className="inline-flex items-center gap-1"><Monitor className="w-3 h-3 text-cyan-300"/>{lang==='ar'?'مشاركة':lang==='en'?'Share':'共享'}</span>}
                        </div>
                        <div className="text-[10px] text-slate-500">{lang==='ar'?'جودة الشبكة':lang==='en'?'Network':'网络质量'}: {qualityLabel(p.connectionQuality || mediaState.connectionQuality)}</div>
                      </div>
                      {p.audioTrack && <CallTrackView track={p.audioTrack} kind="audio" />}
                      {p.screenTrack && p.videoTrack && <div className="px-2.5 pb-2 text-[10px] text-cyan-300 inline-flex items-center gap-1"><Monitor className="w-3 h-3"/>{lang==='ar'?'مشاركة شاشة نشطة':lang==='en'?'Screen sharing active':'屏幕共享中'}</div>}
                    </div>
                  ))}
                  <div className="rounded-lg border border-slate-800 bg-slate-900/70 overflow-hidden">
                    <div className="aspect-video bg-slate-950 flex items-center justify-center relative">
                      {localP?.videoTrack || localP?.screenTrack ? <CallTrackView track={localP.screenTrack || localP.videoTrack} kind="video" muted className="w-full h-full object-cover" mirror={!localP?.screenTrack} /> : <div className="flex flex-col items-center gap-2 text-slate-500"><UserIcon className="w-8 h-8"/><span className="text-[11px]">{lang==='ar'?'معاينة محلية':lang==='en'?'Local preview':'本地预览'}</span></div>}
                    </div>
                    <div className="px-2.5 py-2 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[11px]"><span className="text-slate-200 truncate">{currentUser?.displayName || (lang==='ar'?'أنا':lang==='en'?'You':'我')}</span><span className="text-cyan-300">{lang==='ar'?'محلي':lang==='en'?'Local':'本地'}</span></div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="inline-flex items-center gap-1">{callDevices.micEnabled ? <Mic className="w-3 h-3 text-emerald-300"/> : <MicOff className="w-3 h-3 text-rose-300"/>}{lang==='ar'?'ميكروفون':lang==='en'?'Mic':'麦克风'}</span>
                        <span className="inline-flex items-center gap-1">{callDevices.cameraEnabled ? <Video className="w-3 h-3 text-cyan-300"/> : <VideoOff className="w-3 h-3 text-slate-500"/>}{lang==='ar'?'كاميرا':lang==='en'?'Camera':'摄像头'}</span>
                        {callDevices.screenSharing && <span className="inline-flex items-center gap-1"><Monitor className="w-3 h-3 text-cyan-300"/>{lang==='ar'?'مشاركة':lang==='en'?'Sharing':'共享中'}</span>}
                      </div>
                      <div className="text-[10px] text-slate-500">{lang==='ar'?'حالة الصوت':lang==='en'?'Audio':'音频'}: {mediaPhase==='connected' ? (lang==='ar'?'متصل':lang==='en'?'Connected':'已连接') : mediaPhaseLabel}{!mediaState.canPlaybackAudio && remoteAudioParticipants.length>0 ? ` · ${lang==='ar'?'التشغيل يحتاج تفاعل':lang==='en'?'Playback needs interaction':'需交互启用播放'}` : ''}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {['connecting','active','reconnecting'].includes(activeCall.status) && (
                  <>
                    <button onClick={()=>void toggleCallDevice('micEnabled')} className={`px-2.5 py-1.5 rounded-lg border text-xs inline-flex items-center gap-1 ${callDevices.micEnabled ? 'border-slate-700 text-slate-200 bg-slate-800/60' : 'border-rose-500/40 text-rose-200 bg-rose-500/10'}`}>{callDevices.micEnabled ? <Mic className="w-3.5 h-3.5"/> : <MicOff className="w-3.5 h-3.5"/>}{callDevices.micEnabled ? (lang==='ar'?'ميكروفون':lang==='en'?'Mic':'麦克风') : (lang==='ar'?'كتم':lang==='en'?'Muted':'静音')}</button>
                    <button onClick={()=>void toggleCallDevice('cameraEnabled')} disabled={activeCall.kind !== 'video'} className={`px-2.5 py-1.5 rounded-lg border text-xs inline-flex items-center gap-1 disabled:opacity-40 ${callDevices.cameraEnabled ? 'border-slate-700 text-slate-200 bg-slate-800/60' : 'border-rose-500/40 text-rose-200 bg-rose-500/10'}`}>{callDevices.cameraEnabled ? <Video className="w-3.5 h-3.5"/> : <VideoOff className="w-3.5 h-3.5"/>}{callDevices.cameraEnabled ? (lang==='ar'?'كاميرا':lang==='en'?'Camera':'摄像头') : (lang==='ar'?'إيقاف الكاميرا':lang==='en'?'Camera off':'关摄像头')}</button>
                    <button onClick={()=>void toggleCallDevice('screenSharing')} className={`px-2.5 py-1.5 rounded-lg border text-xs inline-flex items-center gap-1 ${!callDevices.screenSharing ? 'border-slate-700 text-slate-200 bg-slate-800/60' : 'border-cyan-500/40 text-cyan-200 bg-cyan-500/10'}`}>{callDevices.screenSharing ? <MonitorOff className="w-3.5 h-3.5"/> : <Monitor className="w-3.5 h-3.5"/>}{callDevices.screenSharing ? (lang==='ar'?'إيقاف المشاركة':lang==='en'?'Stop share':'停止共享') : (lang==='ar'?'مشاركة الشاشة':lang==='en'?'Share screen':'共享屏幕')}</button>
                    {activeCall.kind === 'video' && <button onClick={()=>void switchCallCamera()} disabled={!callDevices.cameraEnabled || !mediaSessionRef.current} className="px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-200 text-xs inline-flex items-center gap-1 disabled:opacity-40"><RefreshCw className="w-3.5 h-3.5"/>{lang==='ar'?'تبديل الكاميرا':lang==='en'?'Switch camera':'切换摄像头'}</button>}
                    <button onClick={()=>void requestCallMediaToken()} disabled={!!callAction} className="px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs disabled:opacity-40">{lang==='ar'?'حالة/إعادة وسائط':lang==='en'?'Media retry/status':'媒体重试/状态'}</button>
                  </>
                )}
                {activeCall.scope === 'group' && ['connecting','active','reconnecting'].includes(activeCall.status) && <button onClick={()=>void leaveActiveGroupCall()} disabled={!!callAction} className="px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-200 text-xs disabled:opacity-40">{lang==='ar'?'مغادرة':lang==='en'?'Leave':'离开'}</button>}
                {['ringing','connecting','active','reconnecting'].includes(activeCall.status) && <button onClick={()=>void endOrCancelActiveCall()} disabled={!!callAction} className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-200 border border-rose-500/40 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40"><PhoneOff className="w-3.5 h-3.5"/>{activeCall.status==='ringing' && activeCall.initiatorId===currentUser?.id ? (lang==='ar'?'إلغاء':lang==='en'?'Cancel':'取消') : (lang==='ar'?'إنهاء':lang==='en'?'End':'挂断')}</button>}
                {['ended','rejected','missed','busy','failed','canceled'].includes(activeCall.status) && <button onClick={()=>{ void cleanupCallMedia('dismiss'); setActiveCall(null); setCallMediaNote(null); }} className="px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs">{lang==='ar'?'إغلاق':lang==='en'?'Dismiss':'关闭'}</button>}
              </div>

              {callMediaNote && <p className="text-[10px] text-amber-200/90">{callMediaNote}</p>}
              {mediaState.error && !callMediaNote && <p className="text-[10px] text-amber-200/90">{mediaState.error}</p>}
              <p className="text-[10px] text-slate-500">{lang==='ar'?'إشارات EARTH ONE مع طبقة وسائط LiveKit عند التهيئة. الرموز تصدر من الخادم فقط (هوية المستخدم + غرفة المكالمة) دون أسرار في الواجهة.':lang==='en'?'EARTH ONE signaling with LiveKit media layer when configured. Tokens issued server-side only (user identity + call room), no secrets in frontend.':'EARTH ONE 信令 + 已配置时的 LiveKit 媒体层；令牌仅服务端签发（绑定用户身份与通话房间），前端无密钥。'}</p>
            </div>
          ); })()}
          {hasMore && <div className="text-center"><button disabled={loadingMore} onClick={async()=>{ if(!messages[0]) return; setLoadingMore(true); await fetchMessages(true, messages[0].id); setLoadingMore(false); }} className="text-[11px] px-3 py-1 rounded-full border border-slate-700 text-slate-300 hover:bg-slate-800">加载更早消息</button></div>}
          {connError && <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200 flex items-center justify-between gap-2"><span>{connError}</span><button onClick={()=>{setConnError(null); void fetchMessages(false);}} className="px-2 py-1 rounded bg-amber-800/50">重试</button></div>}
          {messages.map(msg => {
            const isMe = msg.senderId === currentUser?.id;
            const showOrig = !!showOriginalMap[msg.id];
            if (msg.recalled) return <div key={msg.id} className="text-center text-[11px] text-slate-500 py-1">消息已撤回</div>;
            return (
              <div key={msg.id} className={`flex items-start gap-2.5 ${isMe?'flex-row-reverse':''}`}>
                <img src={msg.senderAvatar} className="w-8 h-8 rounded-full object-cover border border-slate-700 mt-1"/>
                <div className={`max-w-[min(42rem,85%)] ${isMe?'items-end':'items-start'}`}>
                  <div className={`flex items-center gap-1.5 text-[11px] text-slate-400 mb-1 ${isMe?'justify-end':''}`}><span className="font-semibold text-slate-300">{msg.senderName}</span><span>{new Date(msg.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div>
                  <div className={`p-3 rounded-2xl text-sm leading-relaxed shadow-md space-y-2 ${isMe?'bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-tr-none':'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-tl-none'}`}>
                    {msg.replyToId && <div className="text-[11px] opacity-80 border-l-2 border-white/30 pl-2">回复消息</div>}
                    {msg.attachments && msg.attachments.length>0 && (() => {
                      const imgs = (msg.attachments || []).filter(a => a.type === 'image');
                      return (
                        <div className="space-y-2">
                          {msg.attachments.map((a, idx) => a.type === 'image' ? (
                            <div key={a.id} className="space-y-1">
                              {imgErrors[a.id] ? (
                                <div className="text-xs rounded-lg border border-rose-400/40 bg-rose-950/30 px-3 py-2 flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5"/>图片加载失败</span><button onClick={()=>setImgErrors(m=>{const n={...m}; delete n[a.id]; return n;})} className="underline">重试</button></div>
                              ) : (
                                <button type="button" onClick={()=>setLightbox({ items: imgs.map(i=>({url: authFileUrl(i.url), name: i.name})), index: Math.max(0, imgs.findIndex(i=>i.id===a.id)) })} className="block">
                                  <img src={authFileUrl(a.url)} alt={a.name} loading="lazy" onError={()=>setImgErrors(m=>({...m,[a.id]:true}))} className="max-h-56 rounded-lg border border-white/10 cursor-zoom-in"/>
                                </button>
                              )}
                              <div className="flex items-center justify-between gap-2 text-[10px] opacity-80"><span className="truncate">{a.name}</span><button onClick={()=>void downloadAttachment(a)} className="inline-flex items-center gap-1 underline shrink-0"><Download className="w-3 h-3"/>{dlState[a.id]==='downloading'?'下载中…':dlState[a.id]==='error'?'重试下载':'下载'}</button></div>
                            </div>
                          ) : (
                            <div key={a.id} className="rounded-xl border border-white/15 bg-black/10 p-2.5 space-y-2">
                              <div className="flex items-start gap-2 min-w-0">
                                <FileText className="w-4 h-4 mt-0.5 shrink-0"/>
                                <div className="min-w-0 flex-1"><p className="text-xs font-semibold truncate">{a.name}</p><p className="text-[10px] opacity-80">{a.mimeType || 'file'} · {formatBytes(a.size)}</p></div>
                              </div>
                              {(a.mimeType === 'application/pdf' || a.mimeType === 'text/plain') && (
                                <button type="button" onClick={()=>setLightbox({ items: [{ url: authFileUrl(a.url), name: a.name, type: a.mimeType } as any], index: 0 })} className="text-[11px] underline inline-flex items-center gap-1"><Eye className="w-3 h-3"/>预览</button>
                              )}
                              <div className="flex items-center gap-2 text-[11px]">
                                <button onClick={()=>void downloadAttachment(a)} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20"><Download className="w-3 h-3"/>{dlState[a.id]==='downloading'?'下载中…':dlState[a.id]==='error'?'下载失败·重试':'下载'}</button>
                                {dlState[a.id]==='done' && <span className="opacity-80">已下载</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {msg.translatedContent && !showOrig ? (
                      <div><p className="whitespace-pre-wrap break-words">{msg.translatedContent}</p><div className="mt-1 text-[10px] opacity-80 flex items-center justify-between"><span className="inline-flex items-center gap-1"><Sparkles className="w-3 h-3"/>译文</span><button onClick={()=>setShowOriginalMap(p=>({...p,[msg.id]:!p[msg.id]}))} className="underline">原文</button></div></div>
                    ) : (
                      <div><p className="whitespace-pre-wrap break-words">{msg.content || (msg.attachments?.length?'':'')}</p>{msg.translatedContent && <div className="mt-1 text-[10px] opacity-80 text-right"><button onClick={()=>setShowOriginalMap(p=>({...p,[msg.id]:!p[msg.id]}))} className="underline">译文</button></div>}</div>
                    )}
                    <div className={`flex items-center gap-2 text-[10px] opacity-80 ${isMe?'justify-end':''}`}>
                      {isMe && <span>{msg.status==='read'?'已读':msg.status==='delivered'?'已送达':msg.status==='failed'?<button onClick={()=>void retrySend(msg)} className="underline text-amber-200 hover:text-amber-100">失败·重试</button>:msg.status==='sending'?'发送中':'已发送'}</span>}
                      <button onClick={()=>setReplyTo(msg)} className="hover:underline inline-flex items-center gap-0.5"><Reply className="w-3 h-3"/>回复</button>
                      {isMe && !msg.recalled && <button onClick={()=>void recallMessage(msg)} className="hover:underline inline-flex items-center gap-0.5"><Undo2 className="w-3 h-3"/>撤回</button>}
                      <button onClick={()=>void deleteForMe(msg)} className="hover:underline inline-flex items-center gap-0.5"><Trash2 className="w-3 h-3"/>删除</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {messages.length===0 && <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center text-slate-400 gap-2"><MessageCircle className="w-10 h-10 text-slate-600"/><p className="text-sm">选择会话开始聊天（实时 WebSocket）</p></div>}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-3 bg-slate-950/60 border-t border-slate-800 space-y-2">
          {replyTo && <div className="text-[11px] text-slate-300 flex items-center justify-between bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5"><span className="truncate">回复：{replyTo.content || '[附件]'}</span><button type="button" onClick={()=>setReplyTo(null)}><X className="w-3.5 h-3.5"/></button></div>}
          {pendingUploads.length > 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-2.5 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-300"><span>待发送附件 ({pendingUploads.length})</span><button type="button" onClick={()=>void sendPendingUploads()} disabled={isUploading || pendingUploads.every(p=>p.status==='error')} className="px-2.5 py-1 rounded-lg bg-cyan-500 text-slate-950 font-semibold disabled:opacity-40">上传并发送</button></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {pendingUploads.map(p => (
                  <div key={p.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-2 space-y-1.5">
                    <div className="flex items-start gap-2">
                      {p.kind === 'image' && p.previewUrl ? <img src={p.previewUrl} alt={p.name} className="w-14 h-14 object-cover rounded-md border border-slate-700"/> : <div className="w-10 h-10 rounded-md bg-slate-800 flex items-center justify-center"><FileText className="w-4 h-4 text-slate-300"/></div>}
                      <div className="min-w-0 flex-1"><p className="text-xs text-slate-200 truncate">{p.name}</p><p className="text-[10px] text-slate-500">{formatBytes(p.size)} · {p.mimeType || 'file'}</p></div>
                      <button type="button" onClick={()=>removePending(p.id)} className="p-1 rounded hover:bg-slate-800 text-slate-400"><X className="w-3.5 h-3.5"/></button>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className={`h-full ${p.status==='error'?'bg-rose-500':'bg-cyan-500'}`} style={{ width: `${p.progress}%` }} /></div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>{p.status==='error' ? `失败：${p.error || '失败'}` : p.status==='uploading' ? `上传中 ${p.progress}%` : p.status==='sending' ? '发送中…' : p.status==='done' ? '已发送' : (p.uploadedAttachment ? '待发送' : '待上传')}</span>
                      {p.status==='error' && <button type="button" onClick={()=>retryPending(p.id)} className="text-cyan-300 underline">重新上传</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple className="hidden" onChange={e=>{ if(e.target.files?.length) queueFiles(e.target.files); e.currentTarget.value=''; }} />
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e=>{ if(e.target.files?.length) queueFiles(e.target.files); e.currentTarget.value=''; }} />
            <button type="button" onClick={()=>imageInputRef.current?.click()} title="发送图片" className="p-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800"><ImagePlus className="w-4 h-4"/></button>
            <button type="button" onClick={()=>fileInputRef.current?.click()} title="发送文件" className="p-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800"><Paperclip className="w-4 h-4"/></button>
            <textarea
              value={inputText}
              onChange={e=>{ setInputText(e.target.value); sendTyping(true); }}
              onBlur={()=>sendTyping(false)}
              onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); void handleSendMessage(); } }}
              placeholder="输入消息… (Enter 发送)"
              rows={1}
              className="flex-1 min-h-[42px] max-h-32 resize-y px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-100"
            />
            <button type="submit" disabled={(!inputText.trim() && pendingUploads.length===0) || isSending || isUploading || !activeConv} className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-semibold text-xs flex items-center gap-1.5 h-[42px]"><Send className="w-3.5 h-3.5"/><span>{(isSending||isUploading)?'...':'发送'}</span></button>
          </div>
        </form>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col" onClick={()=>setLightbox(null)}>
          <div className="flex items-center justify-between p-3 text-slate-200" onClick={e=>e.stopPropagation()}>
            <div className="text-xs truncate max-w-[70vw]">{lightbox.items[lightbox.index]?.name || ''}</div>
            <div className="flex items-center gap-2">
              {lightbox.items.length > 1 && <span className="text-xs text-slate-400">{lightbox.index + 1}/{lightbox.items.length}</span>}
              <button onClick={()=>setLightbox(null)} className="p-1.5 rounded bg-slate-800 hover:bg-slate-700"><X className="w-4 h-4"/></button>
            </div>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center gap-3 px-3 pb-4" onClick={e=>e.stopPropagation()}>
            {lightbox.items.length > 1 && <button onClick={()=>setLightbox(l=>l?{...l,index:(l.index-1+l.items.length)%l.items.length}:l)} className="p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white"><ChevronLeft className="w-5 h-5"/></button>}
            <div className="flex-1 min-h-0 flex items-center justify-center">
              {(() => { const it: any = lightbox.items[lightbox.index]; if (!it) return null; if (it.type === 'application/pdf' || /\.pdf$/i.test(it.name||'')) return <iframe src={it.url} title={it.name||'PDF'} className="w-full h-[80vh] rounded-lg bg-white" />; if (it.type === 'text/plain' || /\.txt$/i.test(it.name||'')) return <iframe src={it.url} title={it.name||'Text'} className="w-full max-w-4xl h-[80vh] rounded-lg bg-slate-950 border border-slate-700" />; return <img src={it.url} alt={it.name||''} className="max-w-full max-h-[80vh] object-contain rounded-lg" />; })()}
            </div>
            {lightbox.items.length > 1 && <button onClick={()=>setLightbox(l=>l?{...l,index:(l.index+1)%l.items.length}:l)} className="p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white"><ChevronRight className="w-5 h-5"/></button>}
          </div>
        </div>
      )}

      {selectedProfile && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={()=>{ setSelectedProfile(null); setAvatarPreview(null); setProfileMode('view'); }}>
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4" dir={lang==='ar'?'rtl':'ltr'} onClick={e=>e.stopPropagation()}>
            {(() => {
              const u = selectedProfile.user || {};
              const isSelf = !!selectedProfile.isSelf || u.id === currentUser?.id;
              const editing = isSelf && profileMode === 'edit';
              const bindings = u.bindingStatus || {};
              const linked = Array.isArray(u.linkedIdentities) ? u.linkedIdentities : [];
              const fmtDate = (v?: string) => v ? new Date(v).toLocaleString() : (lang==='ar'?'غير متوفر':lang==='en'?'N/A':'暂无');
              const L = (zh:string,en:string,ar:string) => lang==='ar'?ar:lang==='en'?en:zh;
              return (<>
                <div className="flex items-start gap-4">
                  <div className="relative shrink-0">
                    <img src={avatarPreview || u.avatar} alt={u.displayName} className="w-20 h-20 rounded-full object-cover border border-slate-700" />
                    {u.isOnline && <span className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-slate-900" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold text-slate-100 truncate">{u.displayName || '-'}</p>
                    <p className="text-xs text-cyan-300 truncate">@{u.username || '-'}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{u.isOnline ? L('在线','Online','متصل') : L('离线','Offline','غير متصل')} · {L('最近活跃','Last active','آخر نشاط')}: {fmtDate(u.lastActiveAt)}</p>
                    {isSelf && !editing && <button onClick={()=>{ setProfileDraft({ displayName: u.displayName || '', username: u.username || '', bio: u.bio || '' }); setProfileMode('edit'); setProfileSaveState('idle'); setProfileError(null); }} className="mt-2 px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-semibold">{L('编辑资料','Edit profile','تعديل الملف')}</button>}
                  </div>
                  <button onClick={()=>{ setSelectedProfile(null); setAvatarPreview(null); setProfileMode('view'); }} className="p-1.5 rounded-lg border border-slate-700 text-slate-300"><X className="w-4 h-4"/></button>
                </div>

                {isSelf && editing ? (
                  <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                    <p className="text-xs font-semibold text-slate-200">{L('编辑个人资料','Edit your profile','تعديل ملفك الشخصي')}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input ref={profileAvatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) void onPickAvatar(f); e.currentTarget.value=''; }} />
                      <button onClick={()=>profileAvatarInputRef.current?.click()} disabled={avatarUploading} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs disabled:opacity-40">{avatarUploading ? L('上传中…','Uploading…','جارٍ الرفع…') : L('上传头像','Upload avatar','رفع صورة')}</button>
                      <button onClick={()=>void resetAvatar()} disabled={avatarUploading} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs disabled:opacity-40">{L('恢复默认头像','Reset avatar','استعادة الصورة الافتراضية')}</button>
                      <span className="text-[10px] text-slate-500">JPG/PNG/WebP · ≤2MB</span>
                    </div>
                    <label className="block space-y-1"><span className="text-[11px] text-slate-400">{L('昵称','Display name','الاسم المعروض')}</span><input value={profileDraft.displayName} onChange={e=>{ setProfileDraft(p=>({...p, displayName:e.target.value})); setProfileSaveState('idle'); }} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100" maxLength={40} /></label>
                    <label className="block space-y-1"><span className="text-[11px] text-slate-400">{L('用户名 (唯一)','Username (unique)','اسم المستخدم (فريد)')}</span><input value={profileDraft.username} onChange={e=>{ setProfileDraft(p=>({...p, username:e.target.value.toLowerCase()})); setProfileSaveState('idle'); }} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100" maxLength={30} placeholder="a-z 0-9 _ (3-30)" /><span className="text-[10px] text-slate-500">{L('3-30 位，小写字母/数字/下划线，修改后需全局唯一','3-30 chars: lowercase letters, numbers, underscore. Must be unique.','3-30 حرفًا: أحرف صغيرة/أرقام/شرطة سفلية، يجب أن يكون فريدًا.')}</span></label>
                    <label className="block space-y-1"><span className="text-[11px] text-slate-400">{L('个人简介','Bio','نبذة شخصية')}</span><textarea value={profileDraft.bio} onChange={e=>{ setProfileDraft(p=>({...p, bio:e.target.value})); setProfileSaveState('idle'); }} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100 min-h-[72px]" maxLength={300} /></label>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] min-h-[16px]">
                        {profileSaveState==='saving' && <span className="text-cyan-300">{L('保存中…','Saving…','جارٍ الحفظ…')}</span>}
                        {profileSaveState==='saved' && <span className="text-emerald-300">{L('保存成功','Saved','تم الحفظ')}</span>}
                        {(profileSaveState==='error' || profileError) && <span className="text-rose-300">{profileError || L('保存失败','Save failed','فشل الحفظ')}</span>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={()=>{ setProfileMode('view'); setProfileError(null); setAvatarPreview(null); setProfileDraft({ displayName: u.displayName || '', username: u.username || '', bio: u.bio || '' }); }} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs">{L('取消','Cancel','إلغاء')}</button>
                        <button onClick={()=>void saveMyProfile()} disabled={profileSaving} className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs disabled:opacity-40">{L('保存','Save','حفظ')}</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {u.bio && <div><p className="text-[11px] text-slate-400 mb-1">{L('个人简介','Bio','نبذة')}</p><p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{u.bio}</p></div>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5"><p className="text-slate-500">{L('唯一用户 ID','Unique User ID','معرّف المستخدم')}</p><p className="text-slate-200 break-all mt-0.5">{u.id}</p></div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5"><p className="text-slate-500">{L('注册时间','Joined','تاريخ التسجيل')}</p><p className="text-slate-200 mt-0.5">{fmtDate(u.joinedAt)}</p></div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5"><p className="text-slate-500">{L('最近活跃','Last active','آخر نشاط')}</p><p className="text-slate-200 mt-0.5">{fmtDate(u.lastActiveAt)}</p></div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5"><p className="text-slate-500">{L('在线状态','Status','الحالة')}</p><p className={`${u.isOnline?'text-emerald-300':'text-slate-300'} mt-0.5`}>{u.isOnline ? L('在线','Online','متصل') : L('离线','Offline','غير متصل')}</p></div>
                    </div>
                    {isSelf && (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 space-y-2">
                        <p className="text-xs font-semibold text-slate-200">{L('账户绑定状态','Account binding status','حالة ربط الحساب')}</p>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="text-slate-300">Email: <span className={bindings.email?.bound?'text-emerald-300':'text-slate-500'}>{bindings.email?.bound ? (bindings.email?.value || L('已绑定','Bound','مرتبط')) : L('未绑定','Not bound','غير مرتبط')}</span>{bindings.email?.bound && <span className="text-slate-500"> ({bindings.email?.verified?L('已验证','verified','موثّق'):L('未验证','unverified','غير موثّق')})</span>}</div>
                          <div className="text-slate-300">{L('手机','Phone','الهاتف')}: <span className={bindings.phone?.bound?'text-emerald-300':'text-slate-500'}>{bindings.phone?.bound ? (bindings.phone?.value || L('已绑定','Bound','مرتبط')) : L('未绑定','Not bound','غير مرتبط')}</span></div>
                          <div className="text-slate-300">Google: <span className={bindings.google?.bound?'text-emerald-300':'text-slate-500'}>{bindings.google?.bound?L('已绑定','Bound','مرتبط'):L('未绑定','Not bound','غير مرتبط')}</span></div>
                          <div className="text-slate-300">WeChat: <span className={bindings.wechat?.bound?'text-emerald-300':'text-slate-500'}>{bindings.wechat?.bound?L('已绑定','Bound','مرتبط'):L('未绑定','Not bound','غير مرتبط')}</span></div>
                        </div>
                        {Array.isArray(linked) && linked.length > 0 && <p className="text-[10px] text-slate-500">{L('已关联身份','Linked identities','الهويات المرتبطة')}: {linked.map((i:any)=>i.provider).join(', ')}</p>}
                      </div>
                    )}
                  </>
                )}

                {!editing && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {!isSelf && u.id && <>
                      <button onClick={()=>{ void openDirect(u.id); setSelectedProfile(null); }} className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs">{L('发消息','Message','رسالة')}</button>
                      {!selectedProfile.isFriend && !selectedProfile.blocked && <button onClick={()=>{ void sendFriendRequest(u.id); }} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs">{L('加好友','Add friend','إضافة صديق')}</button>}
                      {selectedProfile.isFriend && <button onClick={()=>{ void removeFriend(u.id); setSelectedProfile(null); }} className="px-3 py-1.5 rounded-lg bg-slate-800 text-rose-300 text-xs">{L('删除好友','Remove friend','إزالة صديق')}</button>}
                      {!selectedProfile.blocked ? <button onClick={()=>{ void blockUser(u.id); setSelectedProfile(null); }} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs">{L('屏蔽','Block','حظر')}</button> : <span className="text-[11px] text-amber-300">{L('已屏蔽','Blocked','محظور')}</span>}
                    </>}
                    {isSelf && profileMode==='view' && <button onClick={()=>{ setProfileDraft({ displayName: u.displayName || '', username: u.username || '', bio: u.bio || '' }); setProfileMode('edit'); }} className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs">{L('编辑资料','Edit profile','تعديل الملف')}</button>}
                    <button onClick={()=>{ setSelectedProfile(null); setAvatarPreview(null); setProfileMode('view'); }} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs">{L('关闭','Close','إغلاق')}</button>
                  </div>
                )}
                {selectedProfile.pendingRequest && <p className="text-[11px] text-amber-300">{L('存在待处理好友申请','Pending friend request','يوجد طلب صداقة قيد الانتظار')}</p>}
              </>);
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
