import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation, ChatMessage, User, Language, ChannelIntegration } from '../../types/index.ts';
import {
  Send, Languages, Sparkles, MessageCircle, Globe, Search, Plug, ShieldAlert,
  Users, UserPlus, Check, X, ImagePlus, Paperclip, Reply, Trash2, Undo2, MoreVertical,
  Wifi, WifiOff, RefreshCw, Info, Crown, Shield, LogOut, UserMinus, Settings2,
  Download, ChevronLeft, ChevronRight, FileText, AlertTriangle, Loader2, Eye,
  Bell, CheckCheck, User as UserIcon, Settings, Volume2
} from 'lucide-react';

interface GlobalMessengerProps {
  conversations: Conversation[];
  activeConversationId: string;
  onSelectConversation: (id: string) => void;
  currentUser: User | null;
  lang: Language;
  integrations?: ChannelIntegration[];
  onRefreshConversations?: () => Promise<void> | void;
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
  onRefreshConversations
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
  const [tab, setTab] = useState<'chats' | 'friends' | 'requests' | 'search' | 'msgsearch' | 'notifs'>('chats');
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
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
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
      const u = new URL(url, window.location.origin);
      const t = token();
      if (t) u.searchParams.set('token', t);
      return u.toString();
    } catch { return url; }
  };
  const downloadAttachment = async (a: any) => {
    if (!a?.url) return;
    setDlState(s => ({ ...s, [a.id]: 'downloading' }));
    try {
      const res = await fetch(authFileUrl(`${a.url}?download=1`), { headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
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

  const token = () => localStorage.getItem('earth_one_token') || '';
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

  useEffect(() => { if (authed) { void onRefreshConversations?.(); void loadFriends(); void loadRequests(); void loadBlocked(); void loadRecent(); void loadNotifications(); void loadNotifPrefs(); } }, [authed, currentUser?.id]);

  // WebSocket realtime
  useEffect(() => {
    if (!authed) { setWsStatus('off'); return; }
    let stopped = false;
    const connect = () => {
      if (stopped) return;
      const tkn = token(); if (!tkn) return;
      setWsStatus('connecting');
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${encodeURIComponent(tkn)}`);
      wsRef.current = ws;
      ws.onopen = () => { const wasReconnecting = reconnectAttemptRef.current > 0; reconnectAttemptRef.current = 0; setWsStatus('open'); setConnError(null); if (wasReconnecting) setNotice('网络已恢复，实时连接已重建'); void syncSince(); void onRefreshConversations?.(); void loadNotifications(); void loadNotifPrefs(); };
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
        } else if (data.type === 'presence' || data.type === 'friend_request' || data.type === 'friend_request_updated' || data.type === 'conversation_created' || data.type === 'conversation_updated' || data.type === 'message_recalled') {
          if (data.type === 'friend_request') setNotice('收到新的好友申请 / New friend request');
          if (data.type === 'friend_request_updated') setNotice('好友申请状态已更新');
          void onRefreshConversations?.();
          void loadFriends(); void loadRequests(); void loadRecent();
          if (data.type === 'message_recalled' && data.message?.conversationId === activeConv?.id) {
            setMessages(prev => prev.map(m => m.id === data.message.id ? data.message : m));
          }
          if (data.type === 'conversation_updated' && data.conversation?.id === activeConv?.id && showGroupPanel) void loadGroupDetail(activeConv.id);
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
  const openProfile = async (uid: string) => { try { const d = await api(`/api/messenger/profile/${uid}`); setSelectedProfile(d); } catch (e:any) { setConnError(e?.message || '无法加载资料'); } };

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
            <button onClick={()=>{ setShowCreateGroup(true); void loadFriends(); }} title="创建群聊" className="p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"><Users className="w-3.5 h-3.5"/></button>
            <button onClick={() => setShowIntegrations(v=>!v)} className="p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"><Plug className="w-3.5 h-3.5"/></button>
          </div>
        </div>

        {notice && <div className="mb-2 rounded-lg border border-cyan-700/40 bg-cyan-950/40 px-2.5 py-1.5 text-[11px] text-cyan-200 flex items-center justify-between gap-2"><span>{notice}</span><button onClick={()=>setNotice(null)} className="text-cyan-300">×</button></div>}
        <div className="grid grid-cols-6 gap-1 mb-2 text-[11px]">
          {(['chats','friends','requests','search','msgsearch','notifs'] as const).map(k => (
            <button key={k} onClick={()=>{ setTab(k); if (k==='notifs') void loadNotifications(); }} className={`relative px-1 py-1.5 rounded-lg border ${tab===k?'bg-cyan-500/15 border-cyan-500/40 text-cyan-200':'bg-slate-950 border-slate-800 text-slate-400'}`}>
              {k==='chats'?'会话':k==='friends'?'好友':k==='requests'?'申请':k==='search'?'找人':k==='msgsearch'?'搜消息':'通知'}
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
            {activeConv?.type === 'group' && <button onClick={()=>{ setShowGroupPanel(v=>!v); if (!showGroupPanel) void loadGroupDetail(activeConv.id); }} className="p-1.5 rounded border border-slate-700 text-slate-300" title="群信息"><Info className="w-3.5 h-3.5"/></button>}
            <Languages className="w-4 h-4 text-cyan-400" />
            <select value={targetTranslateLang} onChange={e=>setTargetTranslateLang(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs"><option value="Chinese">中文</option><option value="English">English</option><option value="Arabic">العربية</option><option value="Spanish">Español</option><option value="French">Français</option><option value="Russian">Русский</option></select>
            <button onClick={()=>setAutoTranslate(v=>!v)} className={`px-2 py-1 rounded text-[11px] border ${autoTranslate?'bg-cyan-500/20 text-cyan-300 border-cyan-500/50':'bg-slate-800 text-slate-400 border-slate-700'}`}>{autoTranslate?'AUTO':'OFF'}</button>
            <button onClick={()=>void fetchMessages(false)} className="p-1.5 rounded border border-slate-700 text-slate-300"><RefreshCw className="w-3.5 h-3.5"/></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
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
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={()=>setSelectedProfile(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center gap-3"><img src={selectedProfile.user?.avatar} className="w-14 h-14 rounded-full object-cover"/><div className="min-w-0"><p className="font-semibold text-slate-100 truncate">{selectedProfile.user?.displayName}</p><p className="text-xs text-slate-400 truncate">@{selectedProfile.user?.username}</p><p className="text-[11px] text-slate-500">{selectedProfile.user?.isOnline?'在线':(selectedProfile.user?.lastActiveAt?`最近活跃 ${new Date(selectedProfile.user.lastActiveAt).toLocaleString()}`:'离线')}</p></div></div>
            {selectedProfile.user?.bio && <p className="text-xs text-slate-300">{selectedProfile.user.bio}</p>}
            <div className="text-[11px] text-slate-400">{selectedProfile.user?.location?.cityName}, {selectedProfile.user?.location?.countryName}</div>
            <div className="flex flex-wrap gap-2 pt-1">
              {selectedProfile.user?.id && selectedProfile.user.id !== currentUser?.id && <>
                <button onClick={()=>{ void openDirect(selectedProfile.user.id); setSelectedProfile(null); }} className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs">发消息</button>
                {!selectedProfile.isFriend && !selectedProfile.blocked && <button onClick={()=>{ void sendFriendRequest(selectedProfile.user.id); }} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs">加好友</button>}
                {selectedProfile.isFriend && <button onClick={()=>{ void removeFriend(selectedProfile.user.id); setSelectedProfile(null); }} className="px-3 py-1.5 rounded-lg bg-slate-800 text-rose-300 text-xs">删除好友</button>}
                {!selectedProfile.blocked ? <button onClick={()=>{ void blockUser(selectedProfile.user.id); setSelectedProfile(null); }} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs">屏蔽</button> : <span className="text-[11px] text-amber-300">已屏蔽</span>}
              </>}
              <button onClick={()=>setSelectedProfile(null)} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs">关闭</button>
            </div>
            {selectedProfile.pendingRequest && <p className="text-[11px] text-amber-300">存在待处理好友申请</p>}
          </div>
        </div>
      )}
    </div>
  );
};
