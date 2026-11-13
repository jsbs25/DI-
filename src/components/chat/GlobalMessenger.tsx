import { getApiBase, wsUrl } from '../../apiBase.ts';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation, ChatMessage, User, Language, ChannelIntegration } from '../../types/index.ts';
import {
  Send, Languages, Sparkles, MessageCircle, Globe, Search, Plug, ShieldAlert,
  Users, UserPlus, Check, X, ImagePlus, Paperclip, Reply, Trash2, Undo2,
  Wifi, WifiOff, RefreshCw, Info, Crown, Shield, LogOut, UserMinus,
  Download, ChevronLeft, ChevronRight, FileText, AlertTriangle, Eye,
  Bell, CheckCheck, User as UserIcon, Settings, Volume2, Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Monitor, MonitorOff,
  Minimize2, Maximize2
} from 'lucide-react';
import { callApi } from '../../services/calls/api.ts';
import { createCallMediaSession, type ICallMediaSession, type CallMediaState, friendlyMediaError } from '../../services/calls/media.ts';

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
  directOpenSeq?: number;
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
  onUserUpdate,
  directOpenSeq = 0
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
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'off' | 'connecting' | 'open' | 'closed'>('off');
  const [tab, setTab] = useState<'chats' | 'friends' | 'requests' | 'search' | 'msgsearch' | 'notifs' | 'privacy'>('chats');
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState<FriendUser[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState(false);
  const [showTranslateBar, setShowTranslateBar] = useState(false);
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

  // Calls (EARTH ONE signaling + LiveKit/WebRTC media transport)
  const [activeCall, setActiveCall] = useState<any>(null);
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [callAction, setCallAction] = useState<string | null>(null);
  const [callMediaNote, setCallMediaNote] = useState<string | null>(null);
  const [callDevices, setCallDevices] = useState<{ micEnabled: boolean; cameraEnabled: boolean; screenSharing: boolean }>({ micEnabled: true, cameraEnabled: true, screenSharing: false });
  const [callMinimized, setCallMinimized] = useState(false);
  const [callElapsedSec, setCallElapsedSec] = useState(0);
  const activeCallRef = useRef<any>(null);
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  const incomingCallRef = useRef<any>(null);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);
  const mediaSessionRef = useRef<ICallMediaSession | null>(null);
  const mediaJoinedCallIdRef = useRef<string | null>(null);
  const mediaTokenRef = useRef<string | null>(null);
  const [mediaState, setMediaState] = useState<CallMediaState>({ phase: 'idle', canPlaybackAudio: false, participants: {} });

  useEffect(() => {
    if (directOpenSeq > 0) {
      setTab('chats');
      setMobileShowChat(true);
    }
  }, [directOpenSeq]);

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
      return new URL(absolute, base || window.location.origin).toString();
    } catch { return url; }
  };
  const downloadAttachment = async (a: any) => {
    if (!a?.url) return;
    setDlState(s => ({ ...s, [a.id]: 'downloading' }));
    try {
      const res = await fetch(authFileUrl(`${a.url}?download=1`), { credentials: 'include' });
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

  const token = () => {
    try { return localStorage.getItem('earth_one_token') || ''; } catch { return ''; }
  };
  const authed = !!currentUser;

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
    const res = await fetch(path, { ...init, headers, credentials: 'include' });
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
      if (!quiet) setConnError(err?.status === 401 ? '登录状态已失效。' : (err?.message || '消息加载失败'));
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

  // Real-time WebSocket (/ws) + resilient fallback sync & call polling
  useEffect(() => {
    if (!authed) { setWsStatus('off'); return; }
    let stopped = false;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    void syncSince();

    const pollCalls = async () => {
      if (stopped) return;
      try {
        const d = await callApi.list();
        const calls: any[] = Array.isArray(d?.calls) ? d.calls : [];
        const curActive = activeCallRef.current;
        const curIncoming = incomingCallRef.current;
        if (curActive) {
          const updated = calls.find((c: any) => c.id === curActive.id);
          if (updated) setActiveCall(updated);
        }
        const ringingForMe = calls.find(
          (c: any) =>
            (c.status === 'ringing' || c.status === 'connecting') &&
            c.initiatorId !== currentUser?.id &&
            c.participants?.[currentUser?.id || '']?.status !== 'joined'
        );
        if (ringingForMe && (!curActive || curActive.id !== ringingForMe.id)) {
          setIncomingCall(ringingForMe);
        } else if (curIncoming) {
          const matched = calls.find((c: any) => c.id === curIncoming.id);
          if (matched && ['ended', 'rejected', 'missed', 'busy', 'failed', 'canceled'].includes(matched.status)) {
            setIncomingCall(null);
          }
        }
      } catch {}
    };

    const connect = () => {
      if (stopped) return;
      setWsStatus('connecting');
      const tkn = token();
      const base = wsUrl('/ws');
      const url = tkn ? `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(tkn)}` : base;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        setWsStatus('closed');
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (stopped) { try { ws.close(); } catch {} return; }
        const wasReconnecting = reconnectAttemptRef.current > 0;
        reconnectAttemptRef.current = 0;
        setWsStatus('open');
        setConnError(null);
        if (wasReconnecting) {
          setNotice('网络已恢复，实时连接已重建');
          setTimeout(() => setNotice(n => n === '网络已恢复，实时连接已重建' ? null : n), 2500);
        }
        void syncSince();
        void onRefreshConversations?.();
        void loadNotifications();
        void loadFriends();
        void loadRequests();
        void pollCalls();
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(() => {
          if (ws.readyState === 1) {
            try { ws.send(JSON.stringify({ type: 'ping' })); } catch {}
          }
        }, 25000);
      };

      ws.onmessage = (ev) => {
        if (stopped) return;
        let msg: any;
        try { msg = JSON.parse(String(ev.data)); } catch { return; }
        const type = msg?.type;
        if (!type || type === 'pong' || type === 'hello') return;

        if (type === 'presence') {
          setFriends(prev => prev.map(f => f.id === msg.userId ? { ...f, isOnline: !!msg.online, lastActiveAt: msg.lastActiveAt || f.lastActiveAt } : f));
          return;
        }
        if (type === 'typing') {
          if (msg.conversationId === activeConvIdRef.current && msg.userId && msg.userId !== currentUser?.id) {
            setTypingUsers(prev => ({ ...prev, [msg.userId]: msg.on ? Date.now() : 0 }));
          }
          return;
        }
        if (type === 'read') {
          if (msg.conversationId === activeConvIdRef.current && msg.userId) {
            setMessages(prev => prev.map(m => {
              const rb = Array.isArray(m.readBy) ? m.readBy : [];
              if (rb.includes(msg.userId)) return m;
              return { ...m, readBy: [...rb, msg.userId], status: m.senderId === currentUser?.id ? 'read' : m.status };
            }));
          }
          return;
        }
        if (type === 'message' && msg.message) {
          const incomingMsg: ChatMessage = msg.message;
          if (msg.conversationId === activeConvIdRef.current || incomingMsg.conversationId === activeConvIdRef.current) {
            setMessages(prev => {
              const map = new Map(prev.map(m => [m.id, m]));
              map.set(incomingMsg.id, incomingMsg);
              return Array.from(map.values()).sort((a, b) => {
                const ta = new Date(a.createdAt).getTime(), tb = new Date(b.createdAt).getTime();
                if (ta !== tb) return ta - tb;
                return String(a.id).localeCompare(String(b.id));
              });
            });
            if (ws.readyState === 1 && incomingMsg.senderId !== currentUser?.id) {
              try { ws.send(JSON.stringify({ type: 'read', conversationId: activeConvIdRef.current })); } catch {}
            }
          }
          void onRefreshConversations?.();
          return;
        }
        if (type === 'send_ack') {
          const cid = msg.clientMsgId;
          if (cid) pendingClientIds.current.delete(cid);
          if (msg.ok && msg.message) {
            setMessages(prev => {
              const replaced = prev.map(m => m.id === cid ? msg.message : m);
              const seen = new Set<string>();
              const deduped: ChatMessage[] = [];
              for (const m of replaced) {
                if (seen.has(m.id)) continue;
                seen.add(m.id);
                deduped.push(m);
              }
              return deduped;
            });
            void onRefreshConversations?.();
          } else if (!msg.ok && cid) {
            setMessages(prev => prev.map(m => m.id === cid ? { ...m, status: 'failed' } : m));
          }
          return;
        }
        if (type === 'recall' && msg.messageId) {
          setMessages(prev => prev.map(m => m.id === msg.messageId ? { ...m, recalled: true, content: '消息已撤回', translatedContent: undefined, attachments: [] } : m));
          void onRefreshConversations?.();
          return;
        }
        if (type === 'conversation_updated') {
          void onRefreshConversations?.();
          void loadRecent();
          return;
        }
        if (type === 'friend_request' || type === 'friend_request_updated') {
          void loadRequests();
          void loadFriends();
          void onRefreshConversations?.();
          return;
        }
        if (type === 'notification' && msg.notification) {
          setNotifications(prev => [msg.notification, ...prev.filter(n => n.id !== msg.notification.id)]);
          if (typeof msg.unreadCount === 'number') setNotifUnread(msg.unreadCount);
          maybeAlertNotification(msg.notification, msg.alert);
          return;
        }
        if (type === 'notification_sync') {
          void loadNotifications();
          return;
        }
        if (type === 'notification_prefs_sync' && msg.preferences) {
          setNotifPrefs(normalizeNotifPrefs(msg.preferences));
          return;
        }
        if (type === 'call_invite' && msg.call) {
          if (msg.call.initiatorId !== currentUser?.id) {
            setIncomingCall(msg.call);
            void ensureAudioUnlocked();
          }
          return;
        }
        if (type === 'call_accept' || type === 'call_state' || type === 'call_leave') {
          if (msg.call) {
            if (activeCallRef.current?.id === msg.call.id) setActiveCall(msg.call);
            if (incomingCallRef.current?.id === msg.call.id && msg.call.participants?.[currentUser?.id || '']?.status === 'joined') {
              setIncomingCall(null);
            }
          }
          return;
        }
        if (type === 'call_reject' || type === 'call_cancel' || type === 'call_end') {
          if (msg.call) {
            if (incomingCallRef.current?.id === msg.call.id) setIncomingCall(null);
            if (activeCallRef.current?.id === msg.call.id) {
              setActiveCall(msg.call);
              if (['ended', 'rejected', 'missed', 'busy', 'failed', 'canceled'].includes(msg.call.status)) {
                void cleanupCallMedia(msg.call.status);
                setTimeout(() => {
                  setActiveCall((prev: any) => prev?.id === msg.call.id && ['ended', 'rejected', 'missed', 'busy', 'failed', 'canceled'].includes(prev.status) ? null : prev);
                }, 1500);
              }
            }
          }
          return;
        }
        if (type === 'call_signal' && msg.callId && msg.fromUserId && msg.signal) {
          if (mediaJoinedCallIdRef.current === msg.callId && mediaSessionRef.current?.handleRemoteSignal) {
            void mediaSessionRef.current.handleRemoteSignal(msg.fromUserId, msg.signal, msg.seq);
          }
          return;
        }
      };

      ws.onerror = () => {};
      ws.onclose = () => {
        if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
        if (wsRef.current === ws) wsRef.current = null;
        if (stopped) return;
        setWsStatus('closed');
        const delay = Math.min(10000, 1000 * Math.pow(2, reconnectAttemptRef.current));
        reconnectAttemptRef.current += 1;
        reconnectRef.current = setTimeout(connect, delay);
      };
    };

    connect();
    const syncTimer = setInterval(() => {
      if (stopped) return;
      if (wsRef.current?.readyState !== 1) void syncSince();
    }, 10000);
    const callTimer = setInterval(() => {
      if (stopped) return;
      if (wsRef.current?.readyState !== 1 || activeCallRef.current || incomingCallRef.current) {
        void pollCalls();
      }
    }, 3500);
    const onOnline = () => {
      if (!stopped) {
        void syncSince();
        void pollCalls();
        if (!wsRef.current || wsRef.current.readyState !== 1) connect();
      }
    };
    window.addEventListener('online', onOnline);
    return () => {
      stopped = true;
      if (pingTimer) clearInterval(pingTimer);
      clearInterval(syncTimer);
      clearInterval(callTimer);
      window.removeEventListener('online', onOnline);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, currentUser?.id]);


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
    if (!activeConv || !authed) return;
    if (!inputText.trim() && pendingUploads.length > 0) {
      await sendPendingUploads();
      return;
    }
    if (!inputText.trim() || isSending) return;
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
    if (pendingUploads.length > 0) void sendPendingUploads();
  };

  const uploadOne = (file: File, convId: string, onProgress: (p: number) => void): Promise<any> => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/messenger/upload/stream');
    xhr.withCredentials = true;
    const tkn = token();
    if (tkn) xhr.setRequestHeader('Authorization', `Bearer ${tkn}`);
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

  const doSearchUsers = async (queryOverride?: string) => {
    const q = (queryOverride !== undefined ? queryOverride : userSearch).trim();
    setSuggestedLoading(true);
    try {
      const url = q
        ? `/api/messenger/users/search?q=${encodeURIComponent(q)}`
        : `/api/messenger/users/search?suggested=1`;
      const d = await api(url);
      setSearchResults(d.users || []);
    } catch (e: any) {
      setConnError(e?.message || '搜索失败');
    } finally {
      setSuggestedLoading(false);
    }
  };

  useEffect(() => {
    if (!authed || tab !== 'search') return;
    const t = setTimeout(() => { void doSearchUsers(); }, userSearch.trim() ? 220 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, userSearch, authed]);

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
  const openDirect = async (uid: string) => { try { const d = await api('/api/conversations/direct', { method: 'POST', body: JSON.stringify({ targetUserId: uid }) }); await onRefreshConversations?.(); await loadRecent(); if (d.conversation?.id) onSelectConversation(d.conversation.id); setTab('chats'); setMobileShowChat(true); } catch (e:any) { setConnError(e?.message || '无法创建会话'); } };
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
      if (d.conversation?.id) { onSelectConversation(d.conversation.id); setTab('chats'); setMobileShowChat(true); }
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
      if (cid) { try { const d = await callApi.get(cid); if (d?.call) setIncomingCall(d.call); } catch { setIncomingCall({ id: cid, kind: n.data?.kind, scope: n.data?.scope, status: 'ringing', conversationId: n.conversationId || n.data?.conversationId }); } }
      else if (n.conversationId) { onSelectConversation(n.conversationId); setTab('chats'); setMobileShowChat(true); }
      return;
    }
    if (n.conversationId) { onSelectConversation(n.conversationId); setTab('chats'); setMobileShowChat(true); return; }
    if (n.type === 'friend_request') { setTab('requests'); void loadRequests(); return; }
    if (n.type === 'friend_accepted' || n.type === 'account_security') {
      if (n.actorId || n.targetUserId) { await openProfile(n.actorId || n.targetUserId); }
      return;
    }
    if (n.type === 'group_invite' || n.type === 'group_member_joined' || n.type === 'group_member_left' || n.type === 'group_admin_changed' || n.type === 'group_owner_transferred') {
      if (n.conversationId) { onSelectConversation(n.conversationId); setTab('chats'); setMobileShowChat(true); }
      return;
    }
    if (n.actorId) { await openProfile(n.actorId); }
  };

  // ---- Calls (EARTH ONE signaling + LiveKit / WebRTC media) ----
  const formatDuration = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!activeCall || ['ended', 'rejected', 'missed', 'busy', 'failed', 'canceled'].includes(activeCall.status)) {
      setCallElapsedSec(0);
      return;
    }
    if (activeCall.status !== 'active' && mediaState.phase !== 'connected') {
      setCallElapsedSec(0);
      return;
    }
    const baseMs = activeCall.startedAt ? new Date(activeCall.startedAt).getTime() : Date.now();
    const tick = () => setCallElapsedSec(Math.max(0, Math.floor((Date.now() - baseMs) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [activeCall?.id, activeCall?.status, activeCall?.startedAt, mediaState.phase]);

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
    try { await callApi.state(callId, patch); } catch {}
  };

  const joinCallMedia = async (call: any, media?: any) => {
    if (!call?.id) return;
    const isTerminal = ['ended','rejected','missed','busy','failed','canceled'].includes(call.status);
    if (isTerminal) return;
    if (mediaJoinedCallIdRef.current === call.id && mediaSessionRef.current) return;
    let info = media;
    if (!info || (!info.ok && info.provider !== 'webrtc' && !info.token)) {
      try { info = await callApi.token(call.id); } catch (e:any) { info = e?.body || { ok:false, reason: e?.message || 'MEDIA_ERROR' }; }
    }
    const isWebRtc = info?.provider === 'webrtc';
    const hasLiveKit = !!info?.token && !!info?.url;
    if (!info || info.ok === false || info.blocked || (!isWebRtc && !hasLiveKit)) {
      const reason = info?.reason || (info?.blocked ? 'MEDIA_NOT_CONFIGURED' : 'MEDIA_UNAVAILABLE');
      setCallMediaNote(reason === 'MEDIA_NOT_CONFIGURED' || reason === 'MEDIA_SDK_UNAVAILABLE'
        ? (lang==='ar'?'وسائط الصوت/الفيديو الحقيقية غير متاحة: الخادم غير مُعد (تم الاحتفاظ بالإشارة فقط).':lang==='en'?'Real audio/video media unavailable: server not configured (signaling only).':'真实音视频不可用：媒体服务未配置（仅保留信令）。')
        : (lang==='ar'?`تعذر الانضمام للوسائط: ${String(reason)}`:lang==='en'?`Cannot join media: ${String(reason)}`:`无法加入媒体：${String(reason)}`));
      setMediaState(s => ({ ...s, phase: 'blocked', reason: String(reason) }));
      return;
    }
    if (mediaSessionRef.current && mediaJoinedCallIdRef.current && mediaJoinedCallIdRef.current !== call.id) {
      await cleanupCallMedia('replace');
    }
    mediaTokenRef.current = info.token || `webrtc_${call.id}`;
    mediaJoinedCallIdRef.current = call.id;
    const session = createCallMediaSession(info.provider);
    mediaSessionRef.current = session;
    setCallMediaNote(lang==='ar'?'جارٍ الاتصال بوسائط المكالمة…':lang==='en'?'Connecting to call media…':'正在连接音视频通道…');
    try {
      await session.connect({
        url: info.url,
        token: info.token,
        roomName: info.roomName || call.roomName,
        callId: call.id,
        selfUserId: currentUser?.id,
        selfName: currentUser?.displayName,
        participantIds: call.participantIds || [],
        iceServers: info.iceServers,
        kind: call.kind || 'audio',
        initialMicEnabled: callDevices.micEnabled !== false,
        initialCameraEnabled: call.kind === 'video' ? (callDevices.cameraEnabled !== false) : false,
        sendSignal: async (toUserId, signal) => {
          if (wsRef.current?.readyState === 1) {
            try {
              wsRef.current.send(JSON.stringify({ type: 'call_signal', callId: call.id, toUserId, signal }));
            } catch {}
          }
          try { await callApi.signal(call.id, { toUserId, signal }); } catch {}
        },
        pollSignals: (afterSeq) => callApi.signals(call.id, afterSeq),
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
    }
  };

  const startCall = async (kind: 'audio'|'video', overrideTarget?: { targetUserId: string; conversationId?: string }) => {
    if (!authed || callAction) return;
    if (!overrideTarget && !activeConv) return;
    if (activeCall && ['ringing','connecting','active','reconnecting'].includes(activeCall.status)) { setConnError(callErrorText({ message: 'BUSY' })); return; }
    setCallAction('start'); setCallMediaNote(null); setCallMinimized(false); await cleanupCallMedia('replace');
    try {
      const payload: any = overrideTarget?.targetUserId
        ? { scope: 'direct', kind, targetUserId: overrideTarget.targetUserId, ...(overrideTarget.conversationId ? { conversationId: overrideTarget.conversationId } : {}) }
        : activeConv?.type === 'direct'
          ? { scope: 'direct', kind, targetUserId: activeConv.otherUser?.id, conversationId: activeConv.id }
          : { scope: 'group', kind, conversationId: activeConv?.id };
      const d = await callApi.invite(payload);
      if (d?.call) {
        setActiveCall(d.call);
        setCallDevices({ micEnabled: true, cameraEnabled: kind === 'video', screenSharing: false });
        await joinCallMedia(d.call, d.media);
      }
      if (d?.media?.blocked || d?.media?.ok === false) {
        setCallMediaNote(d.media.reason === 'MEDIA_NOT_CONFIGURED' || d.media.reason === 'MEDIA_SDK_UNAVAILABLE'
          ? (lang==='ar'?'تم إنشاء إشارة المكالمة. وسائط الصوت/الفيديو الحقيقية غير متاحة.':lang==='en'?'Call signaling created. Real audio/video media unavailable.':'已创建通话信令，真实音视频暂不可用。')
          : (d.media.reason || ''));
      }
      setNotice(kind==='video' ? (lang==='ar'?'بدء مكالمة فيديو':lang==='en'?'Video call started':'已发起视频通话') : (lang==='ar'?'بدء مكالمة صوتية':lang==='en'?'Audio call started':'已发起语音通话'));
    } catch (e: any) { setConnError(callErrorText(e)); }
    finally { setCallAction(null); }
  };
  const acceptIncomingCall = async () => {
    if (!incomingCall?.id || callAction) return;
    setCallAction('accept'); setCallMediaNote(null); setCallMinimized(false);
    try {
      const d = await callApi.accept(incomingCall.id);
      if (d?.call) {
        setActiveCall(d.call); setIncomingCall(null);
        setCallDevices({ micEnabled: d.call.self?.micEnabled ?? true, cameraEnabled: d.call.self?.cameraEnabled ?? (d.call.kind==='video'), screenSharing: !!d.call.self?.screenSharing });
        await joinCallMedia(d.call, d.media);
      }
      if (d?.media?.blocked || d?.media?.ok === false) setCallMediaNote(lang==='ar'?'تم قبول المكالمة (إشارة). وسائط حقيقية غير متاحة.':lang==='en'?'Call accepted (signaling). Real media unavailable.':'已接听（信令），真实媒体不可用。');
    } catch (e: any) { setConnError(callErrorText(e)); }
    finally { setCallAction(null); }
  };
  const rejectIncomingCall = async () => {
    if (!incomingCall?.id || callAction) return;
    setCallAction('reject');
    try { await callApi.reject(incomingCall.id); setIncomingCall(null); setNotice(lang==='ar'?'تم رفض المكالمة':lang==='en'?'Call rejected':'已拒绝通话'); }
    catch (e: any) { setConnError(callErrorText(e)); }
    finally { setCallAction(null); }
  };
  const endOrCancelActiveCall = async () => {
    const c = activeCall; if (!c?.id || callAction) return;
    setCallAction('end');
    try {
      await cleanupCallMedia('hangup');
      if (c.status === 'ringing' && c.initiatorId === currentUser?.id) await callApi.cancel(c.id);
      else await callApi.end(c.id);
      setActiveCall((prev: any) => prev?.id === c.id ? { ...prev, status: 'ended' } : prev);
      setNotice(lang==='ar'?'انتهت المكالمة':lang==='en'?'Call ended':'通话已结束');
      setTimeout(()=>setActiveCall((prev: any) => (prev?.id === c.id && ['ended','rejected','missed','busy','failed','canceled'].includes(prev.status)) ? null : prev), 1500);
    } catch (e: any) { setConnError(callErrorText(e)); }
    finally { setCallAction(null); }
  };
  const leaveActiveGroupCall = async () => {
    const c = activeCall; if (!c?.id || c.scope !== 'group' || callAction) return;
    setCallAction('leave');
    try { await cleanupCallMedia('leave'); await callApi.leave(c.id); setActiveCall(null); setNotice(lang==='ar'?'غادرت المكالمة':lang==='en'?'Left call':'已离开通话'); }
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
    try { if (['connecting','active','reconnecting'].includes(c.status)) await callApi.state(c.id, next); } catch {}
  };
  const switchCallCamera = async () => {
    const session = mediaSessionRef.current; if (!session) { setCallMediaNote(lang==='ar'?'لا يوجد اتصال وسائط نشط':lang==='en'?'No active media connection':'无活动媒体连接'); return; }
    try { await session.switchCamera(); } catch (e:any) { setCallMediaNote(friendlyMediaError(e)); }
  };
  const requestCallMediaToken = async () => {
    const c = activeCall; if (!c?.id || callAction) return;
    setCallAction('token');
    try {
      const d = await callApi.token(c.id);
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
      <div className="w-full h-full min-h-0 p-3 sm:p-6 flex items-center justify-center">
        <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-[rgba(10,14,20,0.72)] backdrop-blur-xl p-6 sm:p-8 text-center space-y-3 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <div className="mx-auto w-12 h-12 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 flex items-center justify-center"><MessageCircle className="w-5 h-5 text-cyan-200" /></div>
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-[var(--one-text,#f4f3ee)]">ONE MESSENGER</h2>
          <p className="text-sm text-slate-400 leading-relaxed">正在同步登录状态与会话上下文…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-0 p-1.5 sm:p-4 lg:p-5"><div className="mx-auto h-full min-h-0 max-w-[1680px] rounded-[28px] border border-white/10 bg-[rgba(8,11,16,0.72)] backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.35)] overflow-hidden flex flex-col lg:flex-row">
      {/* Left rail / list */}
      <aside className={`w-full lg:w-[380px] xl:w-[420px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 bg-[rgba(10,14,20,0.55)] p-3 sm:p-4 flex-col min-h-0 ${mobileShowChat ? "hidden lg:flex" : "flex"}`}>
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl border border-cyan-400/20 bg-cyan-400/10 flex items-center justify-center shrink-0"><MessageCircle className="w-4 h-4 text-cyan-200" /></div>
            <div className="min-w-0">
              <h2 className="font-semibold text-sm sm:text-[15px] tracking-tight text-[var(--one-text,#f4f3ee)] truncate">ONE MESSENGER</h2>
              <p className="text-[11px] text-slate-400 truncate">对话、联系人与通知</p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full border shrink-0 ${wsStatus==='open'?'text-emerald-300 border-emerald-500/30 bg-emerald-500/10':'text-amber-300 border-amber-500/30 bg-amber-500/10'}`}>
            {wsStatus==='open' ? <Wifi className="w-3 h-3"/> : <WifiOff className="w-3 h-3"/>}{wsStatus==='open'?'实时':'同步'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" onClick={()=>setTab(t => t === 'msgsearch' ? 'chats' : 'msgsearch')} title={lang==='ar'?'بحث الرسائل':lang==='en'?'Search messages':'搜索消息'} className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border transition-colors ${tab==='msgsearch'?'border-cyan-400/40 bg-cyan-400/12 text-cyan-100':'border-white/10 text-slate-300 hover:bg-white/5 hover:text-[var(--one-text,#f4f3ee)]'}`}><Search className="w-4 h-4"/></button>
          <button type="button" onClick={()=>{ setTab(t => t === 'privacy' ? 'chats' : 'privacy'); void loadPrivacy(); void loadBlocked(); }} title={lang==='ar'?'الخصوصية':lang==='en'?'Privacy':'隐私与安全'} className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border transition-colors ${tab==='privacy'?'border-cyan-400/40 bg-cyan-400/12 text-cyan-100':'border-white/10 text-slate-300 hover:bg-white/5 hover:text-[var(--one-text,#f4f3ee)]'}`}><Shield className="w-4 h-4"/></button>
          <button type="button" onClick={()=>{ setShowCreateGroup(true); void loadFriends(); }} title="创建群聊" className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 hover:text-[var(--one-text,#f4f3ee)]"><Users className="w-4 h-4"/></button>
          <button type="button" onClick={()=>void openMyProfile()} title={lang==='ar'?'ملفي الشخصي':lang==='en'?'My profile':'我的资料'} className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 hover:text-[var(--one-text,#f4f3ee)]"><UserIcon className="w-4 h-4"/></button>
          <button type="button" onClick={() => setShowIntegrations(v=>!v)} title="官方接入" className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border transition-colors ${showIntegrations?'border-cyan-400/40 bg-cyan-400/12 text-cyan-100':'border-white/10 text-slate-300 hover:bg-white/5 hover:text-[var(--one-text,#f4f3ee)]'}`}><Plug className="w-4 h-4"/></button>
        </div>

        {notice && <div className="mb-3 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100 flex items-center justify-between gap-2"><span className="min-w-0">{notice}</span><button onClick={()=>setNotice(null)} className="text-cyan-200/90 p-1 shrink-0">×</button></div>}
        <div className="grid grid-cols-5 gap-1.5 mb-2.5 text-xs">
          {([
            { k: 'chats', label: lang==='ar'?'المحادثات':lang==='en'?'Chats':'会话' },
            { k: 'friends', label: lang==='ar'?'الأصدقاء':lang==='en'?'Friends':'好友', badge: friends.length > 0 ? friends.length : 0, tone: 'slate' },
            { k: 'requests', label: lang==='ar'?'الطلبات':lang==='en'?'Requests':'申请', badge: incomingReqs.length, tone: 'rose' },
            { k: 'search', label: lang==='ar'?'إضافة':lang==='en'?'Add':'加好友' },
            { k: 'notifs', label: lang==='ar'?'الإشعارات':lang==='en'?'Notifs':'通知', badge: notifUnread, tone: 'rose' },
          ] as const).map(item => (
            <button
              key={item.k}
              onClick={()=>{
                setTab(item.k);
                if (item.k === 'notifs') void loadNotifications();
                if (item.k === 'requests') void loadRequests();
                if (item.k === 'friends') void loadFriends();
              }}
              className={`relative min-h-[40px] px-1 py-1.5 rounded-xl border font-medium whitespace-nowrap transition-colors flex items-center justify-center ${tab===item.k?'bg-cyan-400/12 border-cyan-400/35 text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]':'bg-white/[0.02] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'}`}
            >
              <span>{item.label}</span>
              {!!(item as any).badge && (item as any).badge > 0 && (
                <span className={`ml-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] leading-4 font-semibold ${(item as any).tone === 'rose' ? 'bg-rose-500 text-white' : 'bg-white/[0.06] text-slate-300'}`}>
                  {(item as any).badge > 99 ? '99+' : (item as any).badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {showIntegrations && (
          <div className="mb-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 space-y-2">
            <p className="text-[10px] text-slate-500 leading-relaxed">官方接口接入；不支持个人微信/WhatsApp 聊天同步或非官方自动化。</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {integrations.map(it => (
                <div key={it.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-[10px]">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-200">{it.name}</span>
                    {it.id==='google' ? <button onClick={connectGoogle} className="px-2 py-1 rounded bg-white text-slate-900 font-semibold">Google</button>
                    : it.id==='wechat' ? <button onClick={connectWechat} disabled={it.status!=='available'} className={`px-2 py-1 rounded font-semibold ${it.status==='available'?'bg-emerald-500 text-slate-950':'bg-white/[0.06] text-slate-400'}`}>{it.status==='available'?'微信登录':'未配置'}</button>
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
            <div className="relative mb-2"><Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" /><input value={convQuery} onChange={e=>setConvQuery(e.target.value)} placeholder="搜索会话…" className="w-full min-h-[44px] pl-9 pr-3 py-2.5 rounded-xl bg-black/20 border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-400/35 focus:bg-black/30 transition-colors" /></div>
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-0.5">
              {sorted.map(conv => (
                <button key={conv.id} onClick={()=>{onSelectConversation(conv.id); setMobileShowChat(true);}} className={`w-full min-h-[64px] flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${conv.id===activeConv?.id?'bg-cyan-400/10 border border-cyan-400/30':'bg-white/[0.02] border border-white/10 hover:bg-white/[0.05]'}`}>
                  {conv.type==='global_channel' ? <div className="w-11 h-11 rounded-full bg-cyan-950 border border-cyan-400/30 flex items-center justify-center text-cyan-200 shrink-0"><Globe className="w-5 h-5"/></div>
                  : <div className="relative shrink-0"><img src={conv.otherUser?.avatar || conv.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'} className="w-11 h-11 rounded-full object-cover border border-white/10"/>{(conv.isOnline || conv.otherUser?.isOnline) && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-slate-950"/>}</div>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm sm:text-xs truncate text-[var(--one-text,#f4f3ee)]">{conv.name}</span>
                      {(conv.unreadCount||0)>0 && <span className="text-[11px] px-1.5 min-w-[20px] text-center rounded-full bg-cyan-400 text-slate-950 font-bold">{conv.unreadCount}</span>}
                    </div>
                    <p className="text-xs sm:text-[11px] text-slate-400 truncate mt-0.5">{conv.lastMessage || '点击开始对话'}</p>
                  </div>
                </button>
              ))}
              {sorted.length===0 && <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-10 text-center text-sm text-slate-400">暂无会话</div>}
            </div>
          </>
        )}

        {tab === 'friends' && (
          <div className="flex-1 overflow-y-auto space-y-2.5 min-h-0 pr-0.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-400">好友 ({friends.length})</p>
              <div className="flex items-center gap-2">
                <button onClick={()=>setTab('search')} className="px-2.5 py-1.5 rounded-lg bg-cyan-400/10 border border-cyan-500/30 text-cyan-200 text-xs font-medium inline-flex items-center gap-1"><UserPlus className="w-3.5 h-3.5"/>加好友</button>
                <button onClick={()=>{void loadFriends(); void loadRecent();}} className="px-2 py-1.5 rounded-lg border border-white/10 text-slate-300 text-xs">刷新</button>
              </div>
            </div>
            {friends.map(f => (
              <div key={f.id} className="p-3 rounded-xl border border-white/10 bg-white/[0.03] space-y-2.5">
                <div className="flex items-center gap-3">
                  <button onClick={()=>void openProfile(f.id)} className="relative shrink-0">
                    <img src={f.avatar} className="w-11 h-11 rounded-full object-cover border border-white/10"/>
                    {f.isOnline && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950"/>}
                  </button>
                  <button onClick={()=>void openProfile(f.id)} className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-[var(--one-text,#f4f3ee)] truncate">{f.displayName}</p>
                    <p className="text-xs text-slate-400 truncate">@{f.username} · {f.isOnline ? '在线' : (f.lastActiveAt ? `最近 ${new Date(f.lastActiveAt).toLocaleDateString()}` : '离线')}</p>
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  <button onClick={()=>void openDirect(f.id)} className="col-span-2 min-h-[38px] px-2 rounded-lg bg-cyan-400/12 text-cyan-200 border border-cyan-400/30 text-xs font-medium inline-flex items-center justify-center gap-1.5"><MessageCircle className="w-3.5 h-3.5"/>发消息</button>
                  <button onClick={()=>void startCall('audio', { targetUserId: f.id })} disabled={!!callAction} className="min-h-[38px] px-2 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 text-xs font-medium inline-flex items-center justify-center gap-1" title="语音通话"><Phone className="w-3.5 h-3.5"/><span>语音</span></button>
                  <button onClick={()=>void startCall('video', { targetUserId: f.id })} disabled={!!callAction} className="min-h-[38px] px-2 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/35 text-xs font-medium inline-flex items-center justify-center gap-1" title="视频通话"><Video className="w-3.5 h-3.5"/><span>视频</span></button>
                  <button onClick={()=>void removeFriend(f.id)} className="min-h-[38px] px-1 rounded-lg bg-white/[0.06] text-rose-300 text-xs inline-flex items-center justify-center" title="删除好友"><Trash2 className="w-3.5 h-3.5"/></button>
                </div>
              </div>
            ))}
            {recentConvs.length>0 && <div className="pt-2.5 border-t border-white/10 space-y-1.5"><p className="text-xs text-slate-400">最近联系人</p>{recentConvs.slice(0,8).map(c => (
              <button key={c.id} onClick={()=>{ onSelectConversation(c.id); setTab('chats'); setMobileShowChat(true); }} className="w-full min-h-[48px] flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.02] border border-white/10 text-left">
                <img src={c.otherUser?.avatar || c.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'} className="w-8 h-8 rounded-full object-cover shrink-0"/>
                <div className="flex-1 min-w-0"><p className="text-xs font-medium text-slate-200 truncate">{c.name}</p><p className="text-[11px] text-slate-500 truncate">{c.lastMessage || ''}</p></div>
                {(c.unreadCount||0)>0 && <span className="text-[10px] px-1.5 rounded-full bg-cyan-400 text-slate-950 font-bold">{c.unreadCount}</span>}
              </button>
            ))}</div>}
            {blocked.length>0 && <div className="pt-2.5 border-t border-white/10"><p className="text-xs text-slate-400 mb-1.5">已屏蔽用户</p>{blocked.map(b => (
              <div key={b.id} className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/10 text-xs"><span className="text-slate-300">{b.displayName}</span><button onClick={()=>unblockUser(b.id)} className="text-cyan-200 px-2 py-1">解除屏蔽</button></div>
            ))}</div>}
            {friends.length===0 && (
              <div className="text-xs text-slate-400 text-center py-8 space-y-3">
                <p>暂无好友</p>
                <button onClick={()=>setTab('search')} className="px-4 py-2 rounded-xl bg-cyan-400 text-slate-950 font-semibold inline-flex items-center gap-1.5"><UserPlus className="w-4 h-4"/>去添加好友</button>
              </div>
            )}
          </div>
        )}

        {tab === 'requests' && (
          <div className="flex-1 overflow-y-auto space-y-2.5 min-h-0 pr-0.5">
            <div className="flex items-center justify-between"><p className="text-xs text-slate-400">收到的好友申请 ({incomingReqs.length})</p><button onClick={()=>void loadRequests()} className="text-xs text-cyan-200 px-2 py-1">刷新</button></div>
            {incomingReqs.map(r => (
              <div key={r.id} className="p-3 rounded-xl border border-white/10 bg-white/[0.03] space-y-2.5">
                <div className="flex items-center gap-3">
                  <button onClick={()=>r.fromUser?.id && void openProfile(r.fromUser.id)} className="shrink-0"><img src={r.fromUser?.avatar || ''} className="w-10 h-10 rounded-full object-cover border border-white/10"/></button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--one-text,#f4f3ee)] truncate">{r.fromUser?.displayName || r.fromUserId}</p>
                    <p className="text-xs text-slate-400 truncate">@{r.fromUser?.username || r.fromUserId} {r.fromUser?.isOnline?'· 在线':''}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={pendingRequestIds.has(r.id)} onClick={()=>respondRequest(r.id,true)} className="min-h-[40px] rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40"><Check className="w-4 h-4"/>同意加好友</button>
                  <button disabled={pendingRequestIds.has(r.id)} onClick={()=>respondRequest(r.id,false)} className="min-h-[40px] rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40"><X className="w-4 h-4"/>拒绝</button>
                </div>
              </div>
            ))}
            {incomingReqs.length===0 && <div className="text-xs text-slate-500 py-3">无待处理好友申请</div>}
            <p className="text-xs text-slate-400 pt-2.5 border-t border-white/10">我发出的申请 ({outgoingReqs.length})</p>
            {outgoingReqs.map(r => (
              <div key={r.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-white/10 bg-white/[0.02] text-xs text-slate-300">
                <img src={r.toUser?.avatar || ''} className="w-8 h-8 rounded-full object-cover shrink-0"/>
                <span className="flex-1 truncate">→ {r.toUser?.displayName || r.toUserId}</span>
                <span className="text-amber-300/90 text-[11px] shrink-0">等待通过</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'search' && (
          <div className="flex-1 overflow-y-auto space-y-2.5 min-h-0 pr-0.5">
            <div className="flex gap-2">
              <input value={userSearch} onChange={e=>setUserSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') void doSearchUsers();}} placeholder="输入用户名 / 昵称 / ID 添加好友" className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-sm sm:text-xs text-slate-200 outline-none focus:border-cyan-400/35"/>
              <button onClick={()=>void doSearchUsers()} className="min-h-[42px] px-4 rounded-xl bg-cyan-400 text-slate-950 text-xs font-semibold shrink-0">搜索</button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5">
              <span>{userSearch.trim() ? `搜索结果 (${searchResults.length})` : `可添加的好友 (${searchResults.length})`}</span>
              {suggestedLoading && <span className="text-cyan-200">加载中…</span>}
            </div>
            {searchResults.map(u => {
              const isFriend = friends.some(f => f.id === u.id);
              const outgoing = outgoingReqs.some(r => r.toUserId === u.id);
              const incoming = incomingReqs.find(r => r.fromUserId === u.id);
              return (
              <div key={u.id} className="p-3 rounded-xl border border-white/10 bg-white/[0.03] space-y-2.5">
                <div className="flex items-center gap-3">
                  <button onClick={()=>void openProfile(u.id)} className="relative shrink-0">
                    <img src={u.avatar} className="w-11 h-11 rounded-full object-cover border border-white/10"/>
                    {u.isOnline && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950"/>}
                  </button>
                  <button onClick={()=>void openProfile(u.id)} className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-[var(--one-text,#f4f3ee)] truncate">{u.displayName}</p>
                    <p className="text-xs text-slate-400 truncate">@{u.username} · {u.isOnline?'在线':(u.lastActiveAt?`最近 ${new Date(u.lastActiveAt).toLocaleDateString()}`:'离线')}</p>
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {isFriend ? (
                    <span className="col-span-1 min-h-[38px] px-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium inline-flex items-center justify-center">已好友</span>
                  ) : incoming ? (
                    <button onClick={()=>respondRequest(incoming.id,true)} className="col-span-1 min-h-[38px] px-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-[11px] font-semibold inline-flex items-center justify-center">通过</button>
                  ) : outgoing ? (
                    <span className="col-span-1 min-h-[38px] px-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-slate-400 text-[11px] inline-flex items-center justify-center">已申请</span>
                  ) : (
                    <button disabled={pendingRequestIds.has(u.id)} onClick={()=>sendFriendRequest(u.id)} className="col-span-1 min-h-[38px] px-1.5 rounded-lg bg-cyan-400 text-slate-950 text-[11px] font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-40"><UserPlus className="w-3.5 h-3.5"/>加好友</button>
                  )}
                  <button onClick={()=>void openDirect(u.id)} className="col-span-1 min-h-[38px] px-1.5 rounded-lg bg-cyan-400/12 border border-cyan-500/35 text-cyan-200 text-[11px] font-medium inline-flex items-center justify-center gap-1"><MessageCircle className="w-3.5 h-3.5"/>私聊</button>
                  <button onClick={()=>void startCall('audio', { targetUserId: u.id })} disabled={!!callAction} className="col-span-1 min-h-[38px] px-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-[11px] font-medium inline-flex items-center justify-center gap-1"><Phone className="w-3.5 h-3.5"/>语音</button>
                  <button onClick={()=>void startCall('video', { targetUserId: u.id })} disabled={!!callAction} className="col-span-1 min-h-[38px] px-1.5 rounded-lg bg-sky-500/15 border border-sky-500/35 text-sky-300 text-[11px] font-medium inline-flex items-center justify-center gap-1"><Video className="w-3.5 h-3.5"/>视频</button>
                </div>
              </div>
            );})}
            {!suggestedLoading && searchResults.length===0 && <div className="text-xs text-slate-500 text-center py-8">{userSearch.trim() ? '无匹配用户' : '暂无其他可添加用户'}</div>}
          </div>
        )}

        {tab === 'msgsearch' && (
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            <input value={msgQuery} onChange={e=>setMsgQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') void doSearchMessages();}} placeholder="关键词（消息内容/附件名）" className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-sm sm:text-xs text-slate-200"/>
            <div className="grid grid-cols-2 gap-2">
              <select value={msgConvId} onChange={e=>{setMsgConvId(e.target.value); setMsgSender('');}} className="min-h-[40px] px-2 py-2 rounded-xl bg-black/20 border border-white/10 text-xs text-slate-200">
                <option value="">全部会话</option>
                {conversations.filter(c=>c.type!=='country_room').map(c => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
              </select>
              <select value={msgSender} onChange={e=>setMsgSender(e.target.value)} className="min-h-[40px] px-2 py-2 rounded-xl bg-black/20 border border-white/10 text-xs text-slate-200">
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
            <button onClick={()=>void doSearchMessages()} disabled={msgSearching} className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-cyan-400 text-slate-950 text-xs font-semibold disabled:opacity-40">{msgSearching?'搜索中…':'搜索消息'}</button>
            <div className="text-[10px] text-slate-500">支持关键词、发送者、会话筛选</div>
            {msgResults.map(m => (
              <button key={m.id} onClick={()=>{ onSelectConversation(m.conversationId); setTab('chats'); setMobileShowChat(true); }} className="w-full text-left p-2.5 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] space-y-1">
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
              const Section = ({title, children}: any) => (<div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2"><p className="text-xs font-semibold text-slate-200">{title}</p>{children}</div>);
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
                    <p className="text-sm font-semibold text-[var(--one-text,#f4f3ee)]">{L('隐私与安全','Privacy & Security','الخصوصية والأمان')}</p>
                    <p className="text-[10px] text-slate-500">{L('设置保存在服务器并跨设备同步；服务器始终强制执行。','Settings are saved on server, synced across devices, and enforced by server.','يتم حفظ الإعدادات على الخادم ومزامنتها عبر الأجهزة ويفرضها الخادم.')}</p>
                  </div>
                  <button onClick={()=>{ void loadPrivacy(); void loadBlocked(); }} disabled={privacyLoading} className="text-[10px] px-2 py-1 rounded border border-white/10 text-slate-300 disabled:opacity-40">{privacyLoading ? L('加载中…','Loading…','جارٍ التحميل…') : L('刷新','Reload','تحديث')}</button>
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
                      <div key={b.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white/[0.04] border border-white/10 text-xs">
                        <button onClick={()=>void openProfile(b.id)} className="flex items-center gap-2 min-w-0 text-left">
                          <img src={b.avatar} className="w-7 h-7 rounded-full object-cover" />
                          <span className="text-slate-200 truncate">{b.displayName}</span>
                        </button>
                        <button onClick={()=>void unblockUser(b.id)} className="text-cyan-200 shrink-0">{L('解除屏蔽','Unblock','إلغاء الحظر')}</button>
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
                    <button onClick={()=>{ setMessages([]); setNotice(L('已清除本设备会话缓存视图','Cleared local conversation cache view','تم مسح عرض ذاكرة المحادثات المحلية')); }} className="mt-1 px-3 py-1.5 rounded-lg border border-white/10 text-slate-200 hover:bg-white/[0.06]">{L('清除当前设备本地缓存','Clear local device cache','مسح ذاكرة الجهاز المحلية')}</button>
                  </div>
                </Section>

                <Section title={L('账户安全信息','Account security','أمان الحساب')}>
                  <div className="grid grid-cols-1 gap-2 text-[11px]">
                    <div className="rounded-lg border border-white/10 bg-[rgba(15,20,28,0.72)]/50 p-2.5"><p className="text-slate-500">{L('唯一用户 ID','Unique User ID','معرّف المستخدم الفريد')}</p><p className="text-slate-200 break-all mt-0.5">{self.id || '-'}</p></div>
                    <div className="rounded-lg border border-white/10 bg-[rgba(15,20,28,0.72)]/50 p-2.5"><p className="text-slate-500">Email</p><p className="text-slate-200 mt-0.5">{bindings.email?.bound ? `${bindings.email?.value || L('已绑定','Bound','مرتبط')} (${bindings.email?.verified?L('已验证','verified','موثّق'):L('未验证','unverified','غير موثّق')})` : L('未绑定','Not bound','غير مرتبط')}</p></div>
                    <div className="rounded-lg border border-white/10 bg-[rgba(15,20,28,0.72)]/50 p-2.5"><p className="text-slate-500">{L('手机','Phone','الهاتف')}</p><p className="text-slate-200 mt-0.5">{bindings.phone?.bound ? `${bindings.phone?.value || L('已绑定','Bound','مرتبط')} (${bindings.phone?.verified?L('已验证','verified','موثّق'):L('未验证','unverified','غير موثّق')})` : L('未绑定','Not bound','غير مرتبط')}</p></div>
                    <div className="rounded-lg border border-white/10 bg-[rgba(15,20,28,0.72)]/50 p-2.5"><p className="text-slate-500">Google</p><p className="text-slate-200 mt-0.5">{bindings.google?.bound ? L('已绑定','Bound','مرتبط') : L('未绑定 (config required)','Not bound (config required)','غير مرتبط (يتطلب إعدادًا)')}</p></div>
                    <div className="rounded-lg border border-white/10 bg-[rgba(15,20,28,0.72)]/50 p-2.5"><p className="text-slate-500">WeChat</p><p className="text-slate-200 mt-0.5">{bindings.wechat?.bound ? L('已绑定','Bound','مرتبط') : L('未绑定 (config required)','Not bound (config required)','غير مرتبط (يتطلب إعدادًا)')}</p></div>
                    {Array.isArray(linked) && linked.length > 0 && <p className="text-[10px] text-slate-500">{L('已关联身份','Linked identities','الهويات المرتبطة')}: {linked.map((i:any)=>i.provider).join(', ')}</p>}
                  </div>
                </Section>

                <div className="sticky bottom-0 bg-[rgba(15,20,28,0.72)]/95 backdrop-blur py-2 border-t border-white/10 flex items-center justify-between gap-2">
                  <div className="text-[10px] min-h-[16px]">
                    {privacyStatus==='saving' && <span className="text-cyan-200">{L('保存中…','Saving…','جارٍ الحفظ…')}</span>}
                    {privacyStatus==='saved' && <span className="text-emerald-300">{L('已保存并同步','Saved & synced','تم الحفظ والمزامنة')}</span>}
                    {privacyStatus==='error' && <span className="text-rose-300">{L('保存失败','Save failed','فشل الحفظ')}{privacyError?`: ${privacyError}`:''}</span>}
                    {privacyStatus==='idle' && privacyError && <span className="text-rose-300">{privacyError}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={()=>void loadPrivacy()} className="text-[10px] px-3 py-1.5 rounded border border-white/10 text-slate-300">{L('重置','Reset','إعادة تعيين')}</button>
                    <button onClick={()=>void savePrivacy()} disabled={privacySaving || !privacyDraft} className="text-[10px] px-3 py-1.5 rounded bg-cyan-400 text-slate-950 font-semibold disabled:opacity-40">{L('保存设置','Save settings','حفظ الإعدادات')}</button>
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
                <button onClick={()=>{ setShowNotifSettings((v:boolean)=>!v); if (!notifPrefs) void loadNotifPrefs(); }} className={`p-1.5 rounded border ${showNotifSettings?'border-cyan-400/35 text-cyan-200 bg-cyan-400/10':'border-white/10 text-slate-300 hover:bg-white/[0.06]'}`} title={lang==='ar'?'الإعدادات':lang==='en'?'Settings':'设置'}><Settings className="w-3.5 h-3.5"/></button>
                <button onClick={()=>void loadNotifications()} className="text-[11px] text-cyan-200">{lang==='ar'?'تحديث':lang==='en'?'Refresh':'刷新'}</button>
                <button onClick={()=>void markAllNotifsRead()} className="text-[11px] text-cyan-200 inline-flex items-center gap-1"><CheckCheck className="w-3 h-3"/>{lang==='ar'?'قراءة الكل':lang==='en'?'Read all':'全部已读'}</button>
              </div>
            </div>

            {showNotifSettings && (
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3" dir={lang==='ar'?'rtl':'ltr'}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-[var(--one-text,#f4f3ee)]">{lang==='ar'?'إعدادات الإشعارات':lang==='en'?'Notification Settings':'通知设置'}</p>
                    <p className="text-[10px] text-slate-500">{lang==='ar'?'تُحفظ على الخادم وتُزامن عبر الأجهزة.':lang==='en'?'Saved on server and synced across devices.':'保存在服务器并跨设备同步。'}</p>
                  </div>
                  <button onClick={()=>void loadNotifPrefs()} disabled={notifPrefsLoading} className="text-[10px] px-2 py-1 rounded border border-white/10 text-slate-300 disabled:opacity-40">{notifPrefsLoading ? (lang==='ar'?'جارٍ التحميل…':lang==='en'?'Loading…':'加载中…') : (lang==='ar'?'إعادة تحميل':lang==='en'?'Reload':'重载')}</button>
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
                      <div className="h-px bg-white/[0.06] my-1" />
                      {row('desktop', lang==='ar'?'إشعارات سطح المكتب':lang==='en'?'Desktop system notifications':'桌面系统通知', lang==='ar'?'يتطلب إذن النظام/إلكترون.':lang==='en'?'Requires system/Electron permission.':'需系统/Electron 权限。')}
                      {row('sound', lang==='ar'?'صوت الإشعار':lang==='en'?'Notification sound':'通知声音')}
                      <div className="h-px bg-white/[0.06] my-1" />
                      {row('dndEnabled', lang==='ar'?'وضع عدم الإزعاج':lang==='en'?'Do Not Disturb':'免打扰模式', lang==='ar'?'يُكتم الصوت والتنبيهات مع استمرار حفظ الرسائل والإشعارات.':lang==='en'?'Mutes alerts/sound; messages and notifications are still saved.':'静音并关闭提醒；消息和通知仍正常接收保存。')}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <label className="text-[10px] text-slate-400 space-y-1">
                          <span>{lang==='ar'?'وقت البدء':lang==='en'?'Start time':'开始时间'}</span>
                          <input type="time" value={draft.dndStart || '22:00'} onChange={e=>updateNotifPref({ dndStart: e.target.value })} disabled={!draft.dndEnabled} className="w-full px-2 py-1.5 rounded-lg bg-[rgba(15,20,28,0.72)] border border-white/10 text-xs text-slate-200 disabled:opacity-50" />
                        </label>
                        <label className="text-[10px] text-slate-400 space-y-1">
                          <span>{lang==='ar'?'وقت الانتهاء':lang==='en'?'End time':'结束时间'}</span>
                          <input type="time" value={draft.dndEnd || '08:00'} onChange={e=>updateNotifPref({ dndEnd: e.target.value })} disabled={!draft.dndEnabled} className="w-full px-2 py-1.5 rounded-lg bg-[rgba(15,20,28,0.72)] border border-white/10 text-xs text-slate-200 disabled:opacity-50" />
                        </label>
                      </div>
                      {draft.dndEnabled && draft.dndStart === draft.dndEnd && <p className="text-[10px] text-amber-300">{lang==='ar'?'وقت البدء والانتهاء متطابقان — لن يتم تفعيل عدم الإزعاج.':lang==='en'?'Start and end are equal — DND will not activate.':'开始与结束时间相同 — 免打扰不会生效。'}</p>}
                    </div>
                  );
                })()}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="text-[10px] min-h-[16px]">
                    {notifPrefsStatus==='saving' && <span className="text-cyan-200">{lang==='ar'?'جارٍ الحفظ…':lang==='en'?'Saving…':'保存中…'}</span>}
                    {notifPrefsStatus==='saved' && <span className="text-emerald-300">{lang==='ar'?'تم الحفظ':lang==='en'?'Saved':'保存成功'}</span>}
                    {notifPrefsStatus==='error' && <span className="text-rose-300">{lang==='ar'?'فشل الحفظ':lang==='en'?'Save failed':'保存失败'}{notifPrefsError?`: ${notifPrefsError}`:''}</span>}
                    {notifPrefsStatus==='idle' && notifPrefsError && <span className="text-rose-300">{notifPrefsError}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={()=>{ void ensureAudioUnlocked(); void playNotifSound(); }} className="text-[10px] px-2 py-1 rounded border border-white/10 text-slate-300 hover:bg-white/[0.06] inline-flex items-center gap-1"><Volume2 className="w-3 h-3"/>{lang==='ar'?'اختبار':lang==='en'?'Test':'测试'}</button>
                    <button onClick={()=>void saveNotifPrefs()} disabled={notifPrefsSaving || !notifPrefsDraft} className="text-[10px] px-3 py-1.5 rounded bg-cyan-400 text-slate-950 font-semibold disabled:opacity-40">{lang==='ar'?'حفظ':lang==='en'?'Save':'保存'}</button>
                  </div>
                </div>
              </div>
            )}

            {notifications.map(n => (
              <div key={n.id} className={`p-2.5 rounded-xl border text-left space-y-1 ${n.read ? 'border-white/10 bg-white/[0.02]' : 'border-cyan-700/40 bg-cyan-950/20'}`}>
                <button onClick={()=>void openNotification(n)} className="w-full text-left space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {n.actorAvatar ? <img src={n.actorAvatar} className="w-6 h-6 rounded-full object-cover"/> : <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center"><Bell className="w-3 h-3 text-slate-300"/></div>}
                      <p className="text-xs font-semibold text-slate-200 truncate">{n.title || (lang==='ar'?'إشعار':lang==='en'?'Notification':'通知')}</p>
                    </div>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-cyan-400 mt-1 shrink-0"/>}
                  </div>
                  {n.body && <p className="text-[11px] text-slate-400 line-clamp-2">{n.body}</p>}
                  <p className="text-[10px] text-slate-500">{new Date(n.createdAt).toLocaleString()}</p>
                </button>
                <div className="flex items-center gap-2 pt-1">
                  {!n.read && <button onClick={()=>void markNotifRead(n.id)} className="text-[10px] px-2 py-1 rounded bg-white/[0.06] text-slate-200">{lang==='ar'?'وضع علامة مقروء':lang==='en'?'Mark read':'标记已读'}</button>}
                  <button onClick={()=>void deleteNotif(n.id)} className="text-[10px] px-2 py-1 rounded bg-white/[0.06] text-rose-300 inline-flex items-center gap-1"><Trash2 className="w-3 h-3"/>{lang==='ar'?'حذف':lang==='en'?'Delete':'删除'}</button>
                </div>
              </div>
            ))}
            {notifHasMore && <button onClick={()=>void loadNotifications({ append: true, before: notifNextBefore || undefined })} disabled={notifLoading} className="w-full text-[11px] px-3 py-2 rounded-xl border border-white/10 text-slate-300 hover:bg-white/[0.06] disabled:opacity-40">{notifLoading?(lang==='ar'?'جارٍ التحميل…':lang==='en'?'Loading…':'加载中…'):(lang==='ar'?'تحميل المزيد':lang==='en'?'Load more':'加载更多')}</button>}
            {notifications.length===0 && !notifLoading && <div className="text-xs text-slate-500 text-center py-8">{lang==='ar'?'لا توجد إشعارات':lang==='en'?'No notifications':'暂无通知'}</div>}
            {notifLoading && notifications.length===0 && <div className="text-xs text-slate-500 text-center py-8">{lang==='ar'?'جارٍ التحميل…':lang==='en'?'Loading…':'加载中…'}</div>}
          </div>
        )}
      </aside>

      {/* Right: chat */}
      <main className={`flex-1 bg-[rgba(12,16,23,0.35)] flex-col overflow-hidden min-h-0 ${mobileShowChat ? "flex" : "hidden lg:flex"}`}>
        <div className="px-2.5 py-2 sm:px-4 sm:py-3 border-b border-white/10 flex items-center justify-between gap-2 bg-white/[0.02] shrink-0">
          <div className="min-w-0 flex items-center gap-2 flex-1">
            <button type="button" onClick={()=>setMobileShowChat(false)} className="lg:hidden rounded-xl border border-white/10 text-slate-200 hover:bg-white/[0.06] shrink-0 min-h-[40px] min-w-[40px] inline-flex items-center justify-center" aria-label="Back"><ChevronLeft className="w-5 h-5"/></button>
            {activeConv?.type !== 'global_channel' && (
              <div className="relative shrink-0 hidden xs:block sm:block">
                <img src={activeConv?.otherUser?.avatar || activeConv?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'} className="w-9 h-9 rounded-full object-cover border border-white/10" />
                {(activeConv?.otherUser?.isOnline || activeConv?.isOnline) && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" />}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-sm text-[var(--one-text,#f4f3ee)] truncate flex items-center gap-1.5">{activeConv?.name || 'Chat'} {activeConv?.type==='group' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-300 shrink-0">群聊</span>}</h3>
              <p className="text-[11px] text-slate-400 truncate">{typingNames ? `${typingNames} 正在输入…` : (activeConv?.otherUser?.isOnline || activeConv?.isOnline ? '在线' : 'Earth One Messenger')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 text-xs shrink-0">
            {canStartCallHere && (
              <>
                <button type="button" onClick={()=>void startCall('audio')} disabled={!!callAction || (activeCall && ['ringing','connecting','active','reconnecting'].includes(activeCall.status))} className="min-h-[38px] min-w-[38px] sm:px-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40 inline-flex items-center justify-center gap-1" title={lang==='ar'?'مكالمة صوتية':lang==='en'?'Audio call':'语音通话'}><Phone className="w-4 h-4"/><span className="hidden md:inline text-xs font-medium">语音</span></button>
                <button type="button" onClick={()=>void startCall('video')} disabled={!!callAction || (activeCall && ['ringing','connecting','active','reconnecting'].includes(activeCall.status))} className="min-h-[38px] min-w-[38px] sm:px-2.5 rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-300/25 disabled:opacity-40 inline-flex items-center justify-center gap-1" title={lang==='ar'?'مكالمة فيديو':lang==='en'?'Video call':'视频通话'}><Video className="w-4 h-4"/><span className="hidden md:inline text-xs font-medium">视频</span></button>
              </>
            )}
            {activeConv?.type === 'group' && <button type="button" onClick={()=>{ setShowGroupPanel(v=>!v); if (!showGroupPanel) void loadGroupDetail(activeConv.id); }} className="min-h-[38px] min-w-[38px] rounded-xl border border-white/10 text-slate-300 hover:bg-white/[0.06] inline-flex items-center justify-center" title="群信息"><Info className="w-4 h-4"/></button>}
            <button type="button" onClick={()=>setShowTranslateBar(v=>!v)} className={`sm:hidden min-h-[38px] min-w-[38px] rounded-xl border inline-flex items-center justify-center ${autoTranslate?'border-cyan-400/30 bg-cyan-400/10 text-cyan-200':'border-white/10 text-slate-400'}`} title="实时翻译"><Languages className="w-4 h-4"/></button>
            <div className="hidden sm:flex items-center gap-1.5">
              <Languages className="w-4 h-4 text-cyan-300" />
              <select value={targetTranslateLang} onChange={e=>setTargetTranslateLang(e.target.value)} className="bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 text-slate-200 text-xs"><option value="Chinese">中文</option><option value="English">English</option><option value="Arabic">العربية</option><option value="Spanish">Español</option><option value="French">Français</option><option value="Russian">Русский</option></select>
              <button type="button" onClick={()=>setAutoTranslate(v=>!v)} className={`px-2 py-1 rounded text-[11px] border ${autoTranslate?'bg-cyan-400/12 text-cyan-200 border-cyan-400/35':'bg-white/[0.06] text-slate-400 border-white/10'}`}>{autoTranslate?'AUTO':'OFF'}</button>
            </div>
            <button type="button" onClick={()=>void fetchMessages(false)} className="min-h-[38px] min-w-[38px] rounded-xl border border-white/10 text-slate-300 hover:bg-white/[0.06] inline-flex items-center justify-center" title="刷新"><RefreshCw className="w-4 h-4"/></button>
          </div>
        </div>

        {showTranslateBar && (
          <div className="sm:hidden px-3 py-2 bg-black/20/80 border-b border-white/10 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Languages className="w-4 h-4 text-cyan-300" />
              <span className="text-slate-300">目标语言</span>
              <select value={targetTranslateLang} onChange={e=>setTargetTranslateLang(e.target.value)} className="bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 text-slate-200 text-xs"><option value="Chinese">中文</option><option value="English">English</option><option value="Arabic">العربية</option><option value="Spanish">Español</option><option value="French">Français</option><option value="Russian">Русский</option></select>
            </div>
            <button type="button" onClick={()=>setAutoTranslate(v=>!v)} className={`px-2.5 py-1 rounded-lg text-xs border font-medium ${autoTranslate?'bg-cyan-400/12 text-cyan-200 border-cyan-400/35':'bg-white/[0.06] text-slate-400 border-white/10'}`}>{autoTranslate?'自动翻译开':'已关闭'}</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 min-h-0">
          {hasMore && <div className="text-center"><button disabled={loadingMore} onClick={async()=>{ if(!messages[0]) return; setLoadingMore(true); await fetchMessages(true, messages[0].id); setLoadingMore(false); }} className="text-[11px] px-3 py-1 rounded-full border border-white/10 text-slate-300 hover:bg-white/[0.06]">加载更早消息</button></div>}
          {connError && <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200 flex items-center justify-between gap-2"><span>{connError}</span><button onClick={()=>{setConnError(null); void fetchMessages(false);}} className="px-2 py-1 rounded bg-amber-800/50">重试</button></div>}
          {messages.map(msg => {
            const isMe = msg.senderId === currentUser?.id;
            const showOrig = !!showOriginalMap[msg.id];
            if (msg.recalled) return <div key={msg.id} className="text-center text-[11px] text-slate-500 py-1">消息已撤回</div>;
            return (
              <div key={msg.id} className={`flex items-start gap-2.5 ${isMe?'flex-row-reverse':''}`}>
                <img src={msg.senderAvatar} className="w-8 h-8 rounded-full object-cover border border-white/10 mt-1"/>
                <div className={`max-w-[min(42rem,88%)] sm:max-w-[min(42rem,85%)] ${isMe?'items-end':'items-start'}`}>
                  <div className={`flex items-center gap-1.5 text-[11px] text-slate-400 mb-1 ${isMe?'justify-end':''}`}><span className="font-semibold text-slate-300">{msg.senderName}</span><span>{new Date(msg.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div>
                  <div className={`p-3 rounded-2xl text-sm leading-relaxed shadow-md space-y-2 ${isMe?'bg-gradient-to-r from-cyan-500/90 to-sky-500/80 text-white rounded-tr-none':'bg-white/[0.06] text-slate-200 border border-white/10 rounded-tl-none'}`}>
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
          {messages.length===0 && <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center text-slate-400 gap-2"><MessageCircle className="w-10 h-10 text-slate-600"/><p className="text-sm">选择会话开始聊天</p></div>}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-2.5 sm:p-3 bg-black/20 border-t border-white/10 space-y-2 shrink-0">
          {replyTo && <div className="text-[11px] text-slate-300 flex items-center justify-between bg-[rgba(15,20,28,0.72)] border border-white/10 rounded-lg px-3 py-1.5"><span className="truncate">回复：{replyTo.content || '[附件]'}</span><button type="button" onClick={()=>setReplyTo(null)}><X className="w-3.5 h-3.5"/></button></div>}
          {pendingUploads.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-[rgba(12,16,23,0.55)] p-2.5 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-300"><span>待发送附件 ({pendingUploads.length})</span><button type="button" onClick={()=>void sendPendingUploads()} disabled={isUploading || pendingUploads.every(p=>p.status==='error')} className="px-2.5 py-1 rounded-lg bg-cyan-400 text-slate-950 font-semibold disabled:opacity-40">上传并发送</button></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {pendingUploads.map(p => (
                  <div key={p.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2 space-y-1.5">
                    <div className="flex items-start gap-2">
                      {p.kind === 'image' && p.previewUrl ? <img src={p.previewUrl} alt={p.name} className="w-14 h-14 object-cover rounded-md border border-white/10"/> : <div className="w-10 h-10 rounded-md bg-white/[0.06] flex items-center justify-center"><FileText className="w-4 h-4 text-slate-300"/></div>}
                      <div className="min-w-0 flex-1"><p className="text-xs text-slate-200 truncate">{p.name}</p><p className="text-[10px] text-slate-500">{formatBytes(p.size)} · {p.mimeType || 'file'}</p></div>
                      <button type="button" onClick={()=>removePending(p.id)} className="p-1 rounded hover:bg-white/[0.06] text-slate-400"><X className="w-3.5 h-3.5"/></button>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden"><div className={`h-full ${p.status==='error'?'bg-rose-500':'bg-cyan-400'}`} style={{ width: `${p.progress}%` }} /></div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>{p.status==='error' ? `失败：${p.error || '失败'}` : p.status==='uploading' ? `上传中 ${p.progress}%` : p.status==='sending' ? '发送中…' : p.status==='done' ? '已发送' : (p.uploadedAttachment ? '待发送' : '待上传')}</span>
                      {p.status==='error' && <button type="button" onClick={()=>retryPending(p.id)} className="text-cyan-200 underline">重新上传</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-end gap-1.5 sm:gap-2">
            <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple className="hidden" onChange={e=>{ if(e.target.files?.length) queueFiles(e.target.files); e.currentTarget.value=''; }} />
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e=>{ if(e.target.files?.length) queueFiles(e.target.files); e.currentTarget.value=''; }} />
            <button type="button" onClick={()=>imageInputRef.current?.click()} title="发送图片" className="min-h-[44px] min-w-[40px] px-2.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/[0.06] inline-flex items-center justify-center shrink-0"><ImagePlus className="w-4 h-4"/></button>
            <button type="button" onClick={()=>fileInputRef.current?.click()} title="发送文件" className="min-h-[44px] min-w-[40px] px-2.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/[0.06] inline-flex items-center justify-center shrink-0"><Paperclip className="w-4 h-4"/></button>
            <textarea
              value={inputText}
              onChange={e=>{ setInputText(e.target.value); sendTyping(true); }}
              onBlur={()=>sendTyping(false)}
              onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); void handleSendMessage(); } }}
              placeholder="输入消息…"
              rows={1}
              className="flex-1 min-h-[44px] max-h-28 resize-none px-3.5 py-2.5 rounded-xl bg-[rgba(15,20,28,0.72)] border border-white/10 text-base sm:text-sm text-[var(--one-text,#f4f3ee)] outline-none focus:border-cyan-400/35"
            />
            <button type="submit" disabled={(!inputText.trim() && pendingUploads.length===0) || isSending || isUploading || !activeConv} className="px-3.5 sm:px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40 text-slate-950 font-semibold text-xs flex items-center gap-1.5 h-[44px] shrink-0"><Send className="w-3.5 h-3.5"/><span>{(isSending||isUploading)?'...':'发送'}</span></button>
          </div>
        </form>
      </main>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col" onClick={()=>setLightbox(null)}>
          <div className="flex items-center justify-between p-3 text-slate-200" onClick={e=>e.stopPropagation()}>
            <div className="text-xs truncate max-w-[70vw]">{lightbox.items[lightbox.index]?.name || ''}</div>
            <div className="flex items-center gap-2">
              {lightbox.items.length > 1 && <span className="text-xs text-slate-400">{lightbox.index + 1}/{lightbox.items.length}</span>}
              <button onClick={()=>setLightbox(null)} className="p-1.5 rounded bg-white/[0.06] hover:bg-slate-700"><X className="w-4 h-4"/></button>
            </div>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center gap-3 px-3 pb-4" onClick={e=>e.stopPropagation()}>
            {lightbox.items.length > 1 && <button onClick={()=>setLightbox(l=>l?{...l,index:(l.index-1+l.items.length)%l.items.length}:l)} className="p-2 rounded-full bg-white/[0.06] hover:bg-slate-700 text-white"><ChevronLeft className="w-5 h-5"/></button>}
            <div className="flex-1 min-h-0 flex items-center justify-center">
              {(() => { const it: any = lightbox.items[lightbox.index]; if (!it) return null; if (it.type === 'application/pdf' || /\.pdf$/i.test(it.name||'')) return <iframe src={it.url} title={it.name||'PDF'} className="w-full h-[80vh] rounded-lg bg-white" />; if (it.type === 'text/plain' || /\.txt$/i.test(it.name||'')) return <iframe src={it.url} title={it.name||'Text'} className="w-full max-w-4xl h-[80vh] rounded-lg bg-black/20 border border-white/10" />; return <img src={it.url} alt={it.name||''} className="max-w-full max-h-[80vh] object-contain rounded-lg" />; })()}
            </div>
            {lightbox.items.length > 1 && <button onClick={()=>setLightbox(l=>l?{...l,index:(l.index+1)%l.items.length}:l)} className="p-2 rounded-full bg-white/[0.06] hover:bg-slate-700 text-white"><ChevronRight className="w-5 h-5"/></button>}
          </div>
        </div>
      )}

      {selectedProfile && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={()=>{ setSelectedProfile(null); setAvatarPreview(null); setProfileMode('view'); }}>
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-[rgba(15,20,28,0.72)] border border-white/10 p-5 space-y-4" dir={lang==='ar'?'rtl':'ltr'} onClick={e=>e.stopPropagation()}>
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
                    <img src={avatarPreview || u.avatar} alt={u.displayName} className="w-20 h-20 rounded-full object-cover border border-white/10" />
                    {u.isOnline && <span className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-slate-900" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold text-[var(--one-text,#f4f3ee)] truncate">{u.displayName || '-'}</p>
                    <p className="text-xs text-cyan-200 truncate">@{u.username || '-'}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{u.isOnline ? L('在线','Online','متصل') : L('离线','Offline','غير متصل')} · {L('最近活跃','Last active','آخر نشاط')}: {fmtDate(u.lastActiveAt)}</p>
                    {isSelf && !editing && <button onClick={()=>{ setProfileDraft({ displayName: u.displayName || '', username: u.username || '', bio: u.bio || '' }); setProfileMode('edit'); setProfileSaveState('idle'); setProfileError(null); }} className="mt-2 px-3 py-1.5 rounded-lg bg-cyan-400/12 text-cyan-200 border border-cyan-400/30 text-xs font-semibold">{L('编辑资料','Edit profile','تعديل الملف')}</button>}
                  </div>
                  <button onClick={()=>{ setSelectedProfile(null); setAvatarPreview(null); setProfileMode('view'); }} className="p-1.5 rounded-lg border border-white/10 text-slate-300"><X className="w-4 h-4"/></button>
                </div>

                {isSelf && editing ? (
                  <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <p className="text-xs font-semibold text-slate-200">{L('编辑个人资料','Edit your profile','تعديل ملفك الشخصي')}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input ref={profileAvatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) void onPickAvatar(f); e.currentTarget.value=''; }} />
                      <button onClick={()=>profileAvatarInputRef.current?.click()} disabled={avatarUploading} className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-slate-200 text-xs disabled:opacity-40">{avatarUploading ? L('上传中…','Uploading…','جارٍ الرفع…') : L('上传头像','Upload avatar','رفع صورة')}</button>
                      <button onClick={()=>void resetAvatar()} disabled={avatarUploading} className="px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 text-xs disabled:opacity-40">{L('恢复默认头像','Reset avatar','استعادة الصورة الافتراضية')}</button>
                      <span className="text-[10px] text-slate-500">JPG/PNG/WebP · ≤2MB</span>
                    </div>
                    <label className="block space-y-1"><span className="text-[11px] text-slate-400">{L('昵称','Display name','الاسم المعروض')}</span><input value={profileDraft.displayName} onChange={e=>{ setProfileDraft(p=>({...p, displayName:e.target.value})); setProfileSaveState('idle'); }} className="w-full px-3 py-2 rounded-lg bg-[rgba(15,20,28,0.72)] border border-white/10 text-sm text-[var(--one-text,#f4f3ee)]" maxLength={40} /></label>
                    <label className="block space-y-1"><span className="text-[11px] text-slate-400">{L('用户名 (唯一)','Username (unique)','اسم المستخدم (فريد)')}</span><input value={profileDraft.username} onChange={e=>{ setProfileDraft(p=>({...p, username:e.target.value.toLowerCase()})); setProfileSaveState('idle'); }} className="w-full px-3 py-2 rounded-lg bg-[rgba(15,20,28,0.72)] border border-white/10 text-sm text-[var(--one-text,#f4f3ee)]" maxLength={30} placeholder="a-z 0-9 _ (3-30)" /><span className="text-[10px] text-slate-500">{L('3-30 位，小写字母/数字/下划线，修改后需全局唯一','3-30 chars: lowercase letters, numbers, underscore. Must be unique.','3-30 حرفًا: أحرف صغيرة/أرقام/شرطة سفلية، يجب أن يكون فريدًا.')}</span></label>
                    <label className="block space-y-1"><span className="text-[11px] text-slate-400">{L('个人简介','Bio','نبذة شخصية')}</span><textarea value={profileDraft.bio} onChange={e=>{ setProfileDraft(p=>({...p, bio:e.target.value})); setProfileSaveState('idle'); }} className="w-full px-3 py-2 rounded-lg bg-[rgba(15,20,28,0.72)] border border-white/10 text-sm text-[var(--one-text,#f4f3ee)] min-h-[72px]" maxLength={300} /></label>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] min-h-[16px]">
                        {profileSaveState==='saving' && <span className="text-cyan-200">{L('保存中…','Saving…','جارٍ الحفظ…')}</span>}
                        {profileSaveState==='saved' && <span className="text-emerald-300">{L('保存成功','Saved','تم الحفظ')}</span>}
                        {(profileSaveState==='error' || profileError) && <span className="text-rose-300">{profileError || L('保存失败','Save failed','فشل الحفظ')}</span>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={()=>{ setProfileMode('view'); setProfileError(null); setAvatarPreview(null); setProfileDraft({ displayName: u.displayName || '', username: u.username || '', bio: u.bio || '' }); }} className="px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 text-xs">{L('取消','Cancel','إلغاء')}</button>
                        <button onClick={()=>void saveMyProfile()} disabled={profileSaving} className="px-3 py-1.5 rounded-lg bg-cyan-400 text-slate-950 font-semibold text-xs disabled:opacity-40">{L('保存','Save','حفظ')}</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {u.bio && <div><p className="text-[11px] text-slate-400 mb-1">{L('个人简介','Bio','نبذة')}</p><p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{u.bio}</p></div>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5"><p className="text-slate-500">{L('唯一用户 ID','Unique User ID','معرّف المستخدم')}</p><p className="text-slate-200 break-all mt-0.5">{u.id}</p></div>
                      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5"><p className="text-slate-500">{L('注册时间','Joined','تاريخ التسجيل')}</p><p className="text-slate-200 mt-0.5">{fmtDate(u.joinedAt)}</p></div>
                      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5"><p className="text-slate-500">{L('最近活跃','Last active','آخر نشاط')}</p><p className="text-slate-200 mt-0.5">{fmtDate(u.lastActiveAt)}</p></div>
                      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5"><p className="text-slate-500">{L('在线状态','Status','الحالة')}</p><p className={`${u.isOnline?'text-emerald-300':'text-slate-300'} mt-0.5`}>{u.isOnline ? L('在线','Online','متصل') : L('离线','Offline','غير متصل')}</p></div>
                    </div>
                    {isSelf && (
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
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
                      <button onClick={()=>{ void openDirect(u.id); setSelectedProfile(null); }} className="px-3 py-2 rounded-lg bg-cyan-400/12 text-cyan-200 border border-cyan-400/30 text-xs">{L('发消息','Message','رسالة')}</button>
                      <button onClick={()=>{ void startCall('audio', { targetUserId: u.id }); setSelectedProfile(null); }} className="px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5"/>{L('语音通话','Voice call','مكالمة صوتية')}</button>
                      <button onClick={()=>{ void startCall('video', { targetUserId: u.id }); setSelectedProfile(null); }} className="px-3 py-2 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/40 text-xs inline-flex items-center gap-1"><Video className="w-3.5 h-3.5"/>{L('视频通话','Video call','مكالمة فيديو')}</button>
                      {!selectedProfile.isFriend && !selectedProfile.blocked && <button onClick={()=>{ void sendFriendRequest(u.id); }} className="px-3 py-2 rounded-lg bg-white/[0.06] text-slate-200 text-xs">{L('加好友','Add friend','إضافة صديق')}</button>}
                      {selectedProfile.isFriend && <button onClick={()=>{ void removeFriend(u.id); setSelectedProfile(null); }} className="px-3 py-2 rounded-lg bg-white/[0.06] text-rose-300 text-xs">{L('删除好友','Remove friend','إزالة صديق')}</button>}
                      {!selectedProfile.blocked ? <button onClick={()=>{ void blockUser(u.id); setSelectedProfile(null); }} className="px-3 py-2 rounded-lg bg-white/[0.06] text-slate-300 text-xs">{L('屏蔽','Block','حظر')}</button> : <span className="text-[11px] text-amber-300">{L('已屏蔽','Blocked','محظور')}</span>}
                    </>}
                    {isSelf && profileMode==='view' && <button onClick={()=>{ setProfileDraft({ displayName: u.displayName || '', username: u.username || '', bio: u.bio || '' }); setProfileMode('edit'); }} className="px-3 py-2 rounded-lg bg-cyan-400/12 text-cyan-200 border border-cyan-400/30 text-xs">{L('编辑资料','Edit profile','تعديل الملف')}</button>}
                    <button onClick={()=>{ setSelectedProfile(null); setAvatarPreview(null); setProfileMode('view'); }} className="px-3 py-2 rounded-lg border border-white/10 text-slate-300 text-xs">{L('关闭','Close','إغلاق')}</button>
                  </div>
                )}
                {selectedProfile.pendingRequest && <p className="text-[11px] text-amber-300">{L('存在待处理好友申请','Pending friend request','يوجد طلب صداقة قيد الانتظار')}</p>}
              </>);
            })()}
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={()=>setShowCreateGroup(false)}>
          <div className="w-full max-w-md rounded-2xl bg-[rgba(15,20,28,0.72)] border border-white/10 p-4 sm:p-5 space-y-4 max-h-[85vh] flex flex-col" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--one-text,#f4f3ee)]">创建群聊</h3>
              <button onClick={()=>setShowCreateGroup(false)} className="p-1.5 rounded-lg border border-white/10 text-slate-300"><X className="w-4 h-4"/></button>
            </div>
            <input value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} placeholder="输入群聊名称" className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-sm text-[var(--one-text,#f4f3ee)]" />
            <div className="text-xs text-slate-400">选择好友成员 ({newGroupMembers.length} 已选)</div>
            <div className="flex-1 overflow-y-auto space-y-1.5 min-h-[120px] max-h-60">
              {friends.map(f => {
                const checked = newGroupMembers.includes(f.id);
                return (
                  <label key={f.id} className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer ${checked ? 'border-cyan-400/35 bg-cyan-400/10' : 'border-white/10 bg-white/[0.03]'}`}>
                    <input type="checkbox" checked={checked} onChange={e=>setNewGroupMembers(prev => e.target.checked ? [...prev, f.id] : prev.filter(x => x !== f.id))} className="h-4 w-4 accent-cyan-500" />
                    <img src={f.avatar} className="w-8 h-8 rounded-full object-cover" />
                    <span className="text-sm text-slate-200 truncate flex-1">{f.displayName}</span>
                  </label>
                );
              })}
              {friends.length === 0 && <div className="text-xs text-slate-500 py-6 text-center">请先添加好友后再创建群聊</div>}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setShowCreateGroup(false)} className="min-h-[42px] px-4 rounded-xl border border-white/10 text-slate-300 text-xs">取消</button>
              <button onClick={()=>void createGroup()} className="min-h-[42px] px-4 rounded-xl bg-cyan-400 text-slate-950 font-semibold text-xs">创建群聊</button>
            </div>
          </div>
        </div>
      )}

      {/* Group Detail Modal */}
      {showGroupPanel && activeConv?.type === 'group' && (
        <div className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={()=>setShowGroupPanel(false)}>
          <div className="w-full max-w-md rounded-2xl bg-[rgba(15,20,28,0.72)] border border-white/10 p-4 sm:p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--one-text,#f4f3ee)] truncate">{groupDetail?.name || activeConv.name}</h3>
              <button onClick={()=>setShowGroupPanel(false)} className="p-1.5 rounded-lg border border-white/10 text-slate-300"><X className="w-4 h-4"/></button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={()=>void renameGroupAction()} className="px-3 py-2 rounded-lg bg-white/[0.06] text-slate-200 text-xs">修改群名</button>
              <button onClick={()=>void changeGroupAvatar()} className="px-3 py-2 rounded-lg bg-white/[0.06] text-slate-200 text-xs">更换头像</button>
              <button onClick={()=>void inviteMembers()} className="px-3 py-2 rounded-lg bg-cyan-400/12 border border-cyan-400/30 text-cyan-200 text-xs">邀请成员</button>
              <button onClick={()=>void clearConversationForMe()} className="px-3 py-2 rounded-lg bg-white/[0.06] text-slate-300 text-xs">清除本地记录</button>
              <button onClick={()=>void leaveGroupAction()} className="px-3 py-2 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs inline-flex items-center gap-1"><LogOut className="w-3.5 h-3.5"/>退出群聊</button>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-slate-400">群成员 ({(groupDetail?.members || activeConv.participantIds || []).length})</p>
              {(groupDetail?.members || []).map((m: any) => {
                const isOwner = groupDetail?.ownerId === m.id;
                const isAdmin = (groupDetail?.adminIds || []).includes(m.id);
                const iAmOwner = groupDetail?.ownerId === currentUser?.id;
                return (
                  <div key={m.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/10">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img src={m.avatar} className="w-8 h-8 rounded-full object-cover" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-200 truncate flex items-center gap-1">{m.displayName} {isOwner && <Crown className="w-3 h-3 text-amber-400"/>}</p>
                        <p className="text-[10px] text-slate-500">{isOwner ? '群主' : isAdmin ? '管理员' : '成员'}</p>
                      </div>
                    </div>
                    {iAmOwner && m.id !== currentUser?.id && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={()=>void toggleAdmin(m.id, !isAdmin)} className="px-2 py-1 rounded bg-white/[0.06] text-[10px] text-slate-300">{isAdmin ? '取消管理' : '设管理'}</button>
                        <button onClick={()=>void transferOwner(m.id)} className="px-2 py-1 rounded bg-white/[0.06] text-[10px] text-amber-300">转让</button>
                        <button onClick={()=>void removeMember(m.id)} className="p-1.5 rounded bg-white/[0.06] text-rose-300"><UserMinus className="w-3.5 h-3.5"/></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Floating Incoming Call Overlay (Visible from any tab/screen on mobile & desktop) */}
      {incomingCall && incomingCall.initiatorId !== currentUser?.id && ['ringing','connecting'].includes(incomingCall.status) && (() => {
        const callerUser =
          (Array.isArray(incomingCall.users) ? incomingCall.users.find((u: any) => u.id === incomingCall.initiatorId) : null) ||
          friends.find(f => f.id === incomingCall.initiatorId) ||
          conversations.find(c => c.otherUser?.id === incomingCall.initiatorId)?.otherUser;
        const callerName = callerUser?.displayName || incomingCall.initiatorName || '好友来电';
        const callerAvatar = callerUser?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120';
        return (
          <div className="fixed inset-x-3 top-14 sm:top-20 sm:left-auto sm:right-6 sm:w-96 z-[85] rounded-2xl border border-cyan-400/30 bg-[#071020]/95 p-4 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl space-y-3">
            <div className="flex items-center gap-3">
              <img src={callerAvatar} alt={callerName} className="w-12 h-12 rounded-full object-cover ring-2 ring-cyan-400/50 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{callerName}</p>
                <p className="text-xs text-cyan-200 flex items-center gap-1.5 mt-0.5">
                  {incomingCall.kind === 'video' ? <Video className="w-3.5 h-3.5"/> : <Phone className="w-3.5 h-3.5"/>}
                  <span>{incomingCall.kind === 'video' ? '邀请你视频通话…' : '邀请你语音通话…'}</span>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={()=>void rejectIncomingCall()} disabled={!!callAction} className="min-h-[46px] rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40"><PhoneOff className="w-4 h-4"/><span>拒绝</span></button>
              <button type="button" onClick={()=>void acceptIncomingCall()} disabled={!!callAction} className="min-h-[46px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-40"><Phone className="w-4 h-4"/><span>接听</span></button>
            </div>
          </div>
        );
      })()}

      {/* Active Voice / Video Call Full-Screen Mobile-First Stage + Minimized Pill */}
      {activeCall && (() => {
        const mediaPhase = mediaState.phase || 'idle';
        const mediaParticipants = Object.values(mediaState.participants || {});
        const remoteAudioParticipants = mediaParticipants.filter((p: any) => !p.isLocal && (p.audioTrack || p.audioEnabled));
        const remoteTiles = mediaParticipants.filter((p: any) => !p.isLocal);
        const localP: any = mediaParticipants.find((p: any) => p.isLocal) || null;
        const participantUsers: any[] = Array.isArray(activeCall.users) ? activeCall.users : [];
        const peerIds = (activeCall.participantIds || []).filter((id: string) => id !== currentUser?.id);
        const userInfoFor = (id: string) =>
          participantUsers.find((x: any) => x.id === id) ||
          friends.find(f => f.id === id) ||
          conversations.find(c => c.otherUser?.id === id)?.otherUser;
        const nameFor = (id: string) => {
          const fromState = mediaParticipants.find((p: any) => p.identity === id);
          if (fromState?.name) return fromState.name;
          const u = userInfoFor(id);
          if (u?.displayName) return u.displayName;
          if (id === currentUser?.id) return currentUser?.displayName || 'Me';
          return id?.slice(0, 8) || 'participant';
        };
        const displayTitle = activeCall.scope === 'group' ? (activeConv?.name || '群组通话') : (peerIds[0] ? nameFor(peerIds[0]) : '通话中');
        const primaryPeerAvatar = peerIds[0] ? (userInfoFor(peerIds[0])?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160') : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160';
        const mediaPhaseLabel = ({ idle: '准备中', acquiring: '打开设备中', connecting: '连接音视频…', connected: '已接通', reconnecting: '重连中…', disconnected: '已断开', failed: '连接异常', blocked: '仅信令' } as any)[mediaPhase] || mediaPhase;
        const isTerminal = ['ended','rejected','missed','busy','failed','canceled'].includes(activeCall.status);

        if (callMinimized) {
          return (
            <div className="fixed top-14 right-3 sm:top-20 sm:right-6 z-[85] rounded-2xl border border-cyan-400/30 bg-[#071020]/95 px-3.5 py-2.5 shadow-2xl backdrop-blur-xl flex items-center gap-3">
              {remoteAudioParticipants.map((p: any) => p.audioTrack ? <CallTrackView key={`aud_${p.identity}`} track={p.audioTrack} kind="audio" /> : null)}
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate max-w-[110px]">{displayTitle}</p>
                  <p className="text-[11px] text-cyan-200 tabular-nums">{callElapsedSec > 0 ? formatDuration(callElapsedSec) : callStatusLabel(activeCall.status)}</p>
                </div>
              </div>
              <button type="button" onClick={()=>setCallMinimized(false)} className="min-h-[36px] min-w-[36px] rounded-xl bg-white/[0.06] text-slate-200 inline-flex items-center justify-center" title="展开通话"><Maximize2 className="w-4 h-4"/></button>
              {!isTerminal && <button type="button" onClick={()=>void endOrCancelActiveCall()} disabled={!!callAction} className="min-h-[36px] min-w-[36px] rounded-xl bg-rose-500 text-white inline-flex items-center justify-center" title="挂断"><PhoneOff className="w-4 h-4"/></button>}
            </div>
          );
        }

        const tilesToRender = remoteTiles.length
          ? remoteTiles
          : peerIds.map((id: string) => ({
              identity: id,
              isLocal: false,
              audioEnabled: !!activeCall.participants?.[id]?.micEnabled,
              videoEnabled: !!activeCall.participants?.[id]?.cameraEnabled,
              screenShareEnabled: !!activeCall.participants?.[id]?.screenSharing,
              speaking: false,
              audioTrack: null,
              videoTrack: null,
              screenTrack: null,
            }));

        return (
          <div className="fixed inset-0 md:inset-6 z-[85] bg-[#060a14]/96 backdrop-blur-2xl flex flex-col justify-between md:rounded-3xl md:border md:border-white/15 md:shadow-2xl overflow-hidden">
            {/* Hidden audio renderers so remote voice always plays */}
            {tilesToRender.map((p: any) => p.audioTrack ? <CallTrackView key={`aud_${p.identity}`} track={p.audioTrack} kind="audio" /> : null)}

            {/* Top bar */}
            <div className="flex items-center justify-between gap-3 px-4 pt-[max(0.9rem,env(safe-area-inset-top))] pb-3 border-b border-white/10 bg-black/25 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {activeCall.kind === 'video' ? <Video className="w-4 h-4 text-cyan-300 shrink-0"/> : <Phone className="w-4 h-4 text-emerald-400 shrink-0"/>}
                  <span className="text-sm font-bold text-white truncate">{displayTitle}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-cyan-200 tabular-nums shrink-0">{callElapsedSec > 0 ? formatDuration(callElapsedSec) : callStatusLabel(activeCall.status)}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">{activeCall.kind === 'video' ? '视频通话' : '语音通话'} · {mediaPhaseLabel}</p>
              </div>
              <button type="button" onClick={()=>setCallMinimized(true)} className="min-h-[40px] min-w-[40px] rounded-xl border border-white/15 bg-white/5 text-slate-200 inline-flex items-center justify-center" title="最小化"><Minimize2 className="w-4 h-4"/></button>
            </div>

            {/* Stage */}
            <div className="relative flex-1 min-h-0 flex items-center justify-center p-3 sm:p-5 overflow-hidden">
              {activeCall.kind === 'video' ? (
                <div className={`w-full h-full grid gap-3 ${tilesToRender.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                  {tilesToRender.map((p: any) => (
                    <div key={p.identity} className="relative w-full h-full min-h-[220px] rounded-2xl bg-black/20 border border-white/10 overflow-hidden flex items-center justify-center">
                      {p.videoTrack ? (
                        <CallTrackView track={p.videoTrack} kind="video" className="w-full h-full object-cover" />
                      ) : p.screenTrack ? (
                        <CallTrackView track={p.screenTrack} kind="video" className="w-full h-full object-contain bg-black" />
                      ) : (
                        <div className="flex flex-col items-center gap-3 text-center px-4">
                          <img src={userInfoFor(p.identity)?.avatar || primaryPeerAvatar} alt={nameFor(p.identity)} className="w-24 h-24 rounded-full object-cover ring-2 ring-cyan-400/40" />
                          <div>
                            <p className="text-base font-semibold text-white">{nameFor(p.identity)}</p>
                            <p className="text-xs text-slate-400 mt-1">{activeCall.status === 'ringing' ? '正在等待对方接听…' : '对方未开启摄像头'}</p>
                          </div>
                        </div>
                      )}
                      <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/55 backdrop-blur-md text-xs text-white flex items-center gap-1.5">
                        <span>{nameFor(p.identity)}</span>
                        {!p.audioEnabled && <MicOff className="w-3.5 h-3.5 text-rose-400"/>}
                      </div>
                    </div>
                  ))}
                  {/* Local PiP preview */}
                  <div className="absolute top-5 right-5 w-28 h-40 sm:w-44 sm:h-32 rounded-2xl border border-white/20 bg-[rgba(15,20,28,0.72)]/90 shadow-2xl overflow-hidden flex items-center justify-center">
                    {localP?.videoTrack || localP?.screenTrack ? (
                      <CallTrackView track={localP.screenTrack || localP.videoTrack} kind="video" muted className="w-full h-full object-cover" mirror={!localP?.screenTrack} />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-slate-400"><VideoOff className="w-5 h-5"/><span className="text-[10px]">本地未开启</span></div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center space-y-5 max-w-sm">
                  <div className="relative">
                    <div className={`w-32 h-32 rounded-full p-1 ${activeCall.status === 'active' || mediaPhase === 'connected' ? 'ring-4 ring-emerald-400/35' : 'ring-4 ring-cyan-400/30 animate-pulse'}`}>
                      <img src={primaryPeerAvatar} alt={displayTitle} className="w-full h-full rounded-full object-cover" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-white">{displayTitle}</h3>
                    <p className="text-sm text-cyan-200 tabular-nums">{callElapsedSec > 0 ? formatDuration(callElapsedSec) : callStatusLabel(activeCall.status)}</p>
                    <p className="text-xs text-slate-400">{mediaPhaseLabel}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Notices + Bottom Controls */}
            <div className="px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] bg-black/35 border-t border-white/10 space-y-3 shrink-0">
              {!mediaState.canPlaybackAudio && ['connected','reconnecting','connecting'].includes(mediaPhase) && remoteAudioParticipants.length > 0 && (
                <button type="button" onClick={()=>void startCallMediaPlayback()} className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-200 text-xs font-medium inline-flex items-center justify-center gap-2"><Volume2 className="w-4 h-4"/>点击开启扬声器声音</button>
              )}
              {(callMediaNote || mediaState.error) && (
                <p className="text-center text-xs text-amber-200/90 px-2">{callMediaNote || mediaState.error}</p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
                {['ringing','connecting','active','reconnecting'].includes(activeCall.status) && (
                  <>
                    <button type="button" onClick={()=>void toggleCallDevice('micEnabled')} className={`min-h-[52px] min-w-[64px] px-3.5 py-2 rounded-2xl border flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${callDevices.micEnabled ? 'border-white/15 bg-white/10 text-white' : 'border-rose-500/50 bg-rose-500/20 text-rose-200'}`}>
                      {callDevices.micEnabled ? <Mic className="w-5 h-5"/> : <MicOff className="w-5 h-5"/>}
                      <span>{callDevices.micEnabled ? '麦克风' : '已静音'}</span>
                    </button>
                    {activeCall.kind === 'video' && (
                      <>
                        <button type="button" onClick={()=>void toggleCallDevice('cameraEnabled')} className={`min-h-[52px] min-w-[64px] px-3.5 py-2 rounded-2xl border flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${callDevices.cameraEnabled ? 'border-white/15 bg-white/10 text-white' : 'border-rose-500/50 bg-rose-500/20 text-rose-200'}`}>
                          {callDevices.cameraEnabled ? <Video className="w-5 h-5"/> : <VideoOff className="w-5 h-5"/>}
                          <span>{callDevices.cameraEnabled ? '摄像头' : '关画面'}</span>
                        </button>
                        <button type="button" onClick={()=>void switchCallCamera()} disabled={!callDevices.cameraEnabled || !mediaSessionRef.current} className="min-h-[52px] min-w-[64px] px-3.5 py-2 rounded-2xl border border-white/15 bg-white/10 text-white flex flex-col items-center justify-center gap-1 text-[11px] font-medium disabled:opacity-40">
                          <RefreshCw className="w-5 h-5"/>
                          <span>翻转</span>
                        </button>
                      </>
                    )}
                    <button type="button" onClick={()=>void toggleCallDevice('screenSharing')} className={`hidden sm:flex min-h-[52px] min-w-[64px] px-3.5 py-2 rounded-2xl border flex-col items-center justify-center gap-1 text-[11px] font-medium ${!callDevices.screenSharing ? 'border-white/15 bg-white/10 text-white' : 'border-cyan-400/35 bg-cyan-400/12 text-cyan-200'}`}>
                      {callDevices.screenSharing ? <MonitorOff className="w-5 h-5"/> : <Monitor className="w-5 h-5"/>}
                      <span>{callDevices.screenSharing ? '停止共享' : '共享屏幕'}</span>
                    </button>
                    <button type="button" onClick={()=>void requestCallMediaToken()} disabled={!!callAction} className="min-h-[52px] min-w-[64px] px-3.5 py-2 rounded-2xl border border-white/15 bg-white/10 text-slate-200 flex flex-col items-center justify-center gap-1 text-[11px] font-medium disabled:opacity-40">
                      <RefreshCw className="w-5 h-5"/>
                      <span>重连</span>
                    </button>
                  </>
                )}
                {activeCall.scope === 'group' && ['connecting','active','reconnecting'].includes(activeCall.status) && (
                  <button type="button" onClick={()=>void leaveActiveGroupCall()} disabled={!!callAction} className="min-h-[52px] px-4 rounded-2xl border border-white/15 bg-white/10 text-[var(--one-text,#f4f3ee)] text-xs font-semibold disabled:opacity-40">离开通话</button>
                )}
                {!isTerminal && (
                  <button type="button" onClick={()=>void endOrCancelActiveCall()} disabled={!!callAction} className="h-[54px] px-7 rounded-full bg-rose-500 hover:bg-rose-400 text-white text-sm font-bold inline-flex items-center justify-center gap-2 shadow-lg shadow-rose-500/30 disabled:opacity-40">
                    <PhoneOff className="w-5 h-5"/>
                    <span>{activeCall.status === 'ringing' && activeCall.initiatorId === currentUser?.id ? '取消' : '挂断'}</span>
                  </button>
                )}
                {isTerminal && (
                  <button type="button" onClick={()=>{ void cleanupCallMedia('dismiss'); setActiveCall(null); setCallMediaNote(null); setCallMinimized(false); }} className="h-[50px] px-7 rounded-full bg-white/[0.06] hover:bg-slate-700 text-white text-sm font-semibold">关闭</button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
