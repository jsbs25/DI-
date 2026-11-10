import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation, ChatMessage, User, Language, ChannelIntegration } from '../../types/index.ts';
import {
  Send, Languages, Sparkles, MessageCircle, Globe, Search, Plug, ShieldAlert,
  Users, UserPlus, Check, X, ImagePlus, Paperclip, Reply, Trash2, Undo2, MoreVertical,
  Wifi, WifiOff, RefreshCw, Info, Crown, Shield, LogOut, UserMinus, Settings2
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
  const [tab, setTab] = useState<'chats' | 'friends' | 'requests' | 'search'>('chats');
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState<FriendUser[]>([]);
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
  const typingSentRef = useRef(0);
  const lastSyncRef = useRef<string>(new Date().toISOString());

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
        if (before) {
          const ids = new Set(prev.map(m => m.id));
          return [...incoming.filter(m => !ids.has(m.id)), ...prev].sort((a,b)=> new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());
        }
        const map = new Map<string, ChatMessage>();
        for (const m of incoming) map.set(m.id, m);
        // keep optimistic sending ones
        for (const m of prev) if (m.status === 'sending' || pendingClientIds.current.has(m.id)) map.set(m.id, m);
        return Array.from(map.values()).sort((a,b)=> new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());
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
      const data = await api(`/api/messenger/sync?since=${encodeURIComponent(lastSyncRef.current)}`);
      if (Array.isArray(data.conversations)) await onRefreshConversations?.();
      if (Array.isArray(data.messages) && data.messages.length) {
        setMessages(prev => {
          const map = new Map(prev.map(m => [m.id, m]));
          for (const m of data.messages as ChatMessage[]) {
            if (m.conversationId === activeConv?.id) map.set(m.id, m);
          }
          return Array.from(map.values()).sort((a,b)=> new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());
        });
      }
      if (data.serverTime) lastSyncRef.current = data.serverTime;
    } catch {}
  };

  const loadFriends = async () => { try { const d = await api('/api/messenger/friends'); setFriends(d.friends || []); } catch {} };
  const loadRequests = async () => { try { const d = await api('/api/messenger/friend-requests'); setIncomingReqs(d.incoming||[]); setOutgoingReqs(d.outgoing||[]); } catch {} };
  const loadBlocked = async () => { try { const d = await api('/api/messenger/blocked'); setBlocked(d.blocked || []); } catch {} };
  const loadRecent = async () => { try { const d = await api('/api/messenger/recent'); setRecentConvs(d.conversations || []); } catch {} };

  useEffect(() => { if (authed) { void onRefreshConversations?.(); void loadFriends(); void loadRequests(); void loadBlocked(); void loadRecent(); } }, [authed, currentUser?.id]);

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
      ws.onopen = () => { const wasReconnecting = reconnectAttemptRef.current > 0; reconnectAttemptRef.current = 0; setWsStatus('open'); setConnError(null); if (wasReconnecting) setNotice('网络已恢复，实时连接已重建'); void syncSince(); void onRefreshConversations?.(); };
      ws.onmessage = (ev) => {
        let data: any; try { data = JSON.parse(String(ev.data)); } catch { return; }
        if (data.type === 'message' && data.message) {
          const m = data.message as ChatMessage;
          if (m.conversationId === activeConv?.id) {
            setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m].sort((a,b)=> new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()));
            api(`/api/conversations/${m.conversationId}/read`, { method: 'POST' }).catch(()=>{});
          }
          void onRefreshConversations?.();
        } else if (data.type === 'send_ack' && data.clientMsgId) {
          pendingClientIds.current.delete(data.clientMsgId);
          if (data.ok && data.message) {
            setMessages(prev => prev.map(m => m.id === data.clientMsgId ? data.message : (m.id === data.message.id ? data.message : m)));
          } else if (!data.ok) {
            setMessages(prev => prev.map(m => m.id === data.clientMsgId ? { ...m, status: 'failed' } : m));
            setConnError(data.error === 'blocked' ? '消息被阻止（屏蔽关系）。' : '消息发送失败，请重试。');
          }
        } else if (data.type === 'read' && data.conversationId === activeConv?.id) {
          setMessages(prev => prev.map(m => m.senderId === currentUser?.id ? { ...m, status: 'read', readBy: Array.from(new Set([...(m.readBy||[]), data.userId])) } : m));
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

  const uploadAndSend = async (file: File) => {
    if (!activeConv || !authed) return;
    if (file.size > 10 * 1024 * 1024) { setConnError('文件过大（最大 10MB）'); return; }
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => { const s = String(r.result||''); resolve(s.includes(',') ? s.split(',')[1] : s); }; r.onerror = () => reject(new Error('read failed')); r.readAsDataURL(file); });
      const up = await api('/api/messenger/upload', { method: 'POST', body: JSON.stringify({ name: file.name, mimeType: file.type || 'application/octet-stream', dataBase64, conversationId: activeConv.id }) });
      if (up.success && up.attachment) {
        const data = await api(`/api/conversations/${activeConv.id}/messages`, { method: 'POST', body: JSON.stringify({ content: '', attachments: [up.attachment] }) });
        if (data.success && data.message) { setMessages(prev => [...prev, data.message]); await onRefreshConversations?.(); }
      }
    } catch (err: any) {
      setConnError(err?.message || '上传失败');
    }
  };

  const doSearchUsers = async () => {
    if (!userSearch.trim()) { setSearchResults([]); return; }
    try { const d = await api(`/api/messenger/users/search?q=${encodeURIComponent(userSearch.trim())}`); setSearchResults(d.users || []); } catch (e:any) { setConnError(e?.message || '搜索失败'); }
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
        <div className="grid grid-cols-4 gap-1 mb-2 text-[11px]">
          {(['chats','friends','requests','search'] as const).map(k => (
            <button key={k} onClick={()=>setTab(k)} className={`px-2 py-1.5 rounded-lg border ${tab===k?'bg-cyan-500/15 border-cyan-500/40 text-cyan-200':'bg-slate-950 border-slate-800 text-slate-400'}`}>
              {k==='chats'?'会话':k==='friends'?'好友':k==='requests'?'申请':'查找'}
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
                    {msg.attachments && msg.attachments.length>0 && (
                      <div className="space-y-2">
                        {msg.attachments.map(a => a.type==='image' ? (
                          <a key={a.id} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name} className="max-h-56 rounded-lg border border-white/10"/></a>
                        ) : (
                          <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs underline"><Paperclip className="w-3.5 h-3.5"/>{a.name}</a>
                        ))}
                      </div>
                    )}
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
          <div className="flex items-end gap-2">
            <input ref={fileInputRef} type="file" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) void uploadAndSend(f); e.currentTarget.value=''; }} />
            <button type="button" onClick={()=>fileInputRef.current?.click()} className="p-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800"><ImagePlus className="w-4 h-4"/></button>
            <textarea
              value={inputText}
              onChange={e=>{ setInputText(e.target.value); sendTyping(true); }}
              onBlur={()=>sendTyping(false)}
              onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); void handleSendMessage(); } }}
              placeholder="输入消息… (Enter 发送)"
              rows={1}
              className="flex-1 min-h-[42px] max-h-32 resize-y px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-100"
            />
            <button type="submit" disabled={!inputText.trim() || isSending || !activeConv} className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-semibold text-xs flex items-center gap-1.5 h-[42px]"><Send className="w-3.5 h-3.5"/><span>{isSending?'...':'发送'}</span></button>
          </div>
        </form>
      </div>

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
