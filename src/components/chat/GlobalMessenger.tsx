import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Conversation, ChatMessage, User, Language, ChannelIntegration } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import {
  Send, Languages, Sparkles, MessageCircle, Globe, Search, Link2, Plug, Info, Check, CheckCheck, ExternalLink, ShieldAlert
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

export const GlobalMessenger: React.FC<GlobalMessengerProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  currentUser,
  lang,
  integrations = [],
  onRefreshConversations
}) => {
  const t = translations[lang];
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [targetTranslateLang, setTargetTranslateLang] = useState('English');
  const [isSending, setIsSending] = useState(false);
  const [showOriginalMap, setShowOriginalMap] = useState<Record<string, boolean>>({});
  const [convQuery, setConvQuery] = useState('');
  const [showIntegrations, setShowIntegrations] = useState(true);
  const [connError, setConnError] = useState<string | null>(null);
  const [lastFailed, setLastFailed] = useState(false);
  const inFlightRef = useRef(false);
  const pendingSendRef = useRef<string | null>(null);

  const sorted = useMemo(() => {
    const q = convQuery.trim().toLowerCase();
    return [...conversations]
      .filter(c => !q || c.name.toLowerCase().includes(q) || (c.lastMessage || '').toLowerCase().includes(q))
      .sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());
  }, [conversations, convQuery]);

  const activeConv = sorted.find(c => c.id === activeConversationId) || conversations.find(c => c.id === activeConversationId) || sorted[0] || conversations[0];

  const fetchMessages = async (quiet = false) => {
    if (!activeConv || inFlightRef.current) return;
    inFlightRef.current = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const token = localStorage.getItem('earth_one_token');
      if (!token) {
        setMessages([]);
        setConnError('请先登录后查看和发送消息。');
        setLastFailed(false);
        return;
      }
      const res = await fetch(`/api/conversations/${activeConv.id}/messages`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConnError(res.status === 401 ? '登录状态已失效，请重新登录。' : (data.error || '消息加载失败，请稍后重试。'));
        setLastFailed(true);
        return;
      }
      if (data.success) {
        setMessages(data.messages || []);
        setConnError(null);
        setLastFailed(false);
      } else {
        setConnError(data.error || '消息加载失败。');
        setLastFailed(true);
      }
    } catch (err: any) {
      setConnError(err?.name === 'AbortError' ? '网络请求超时，请检查连接。' : '网络异常，正在等待恢复…');
      setLastFailed(true);
      if (!quiet) console.warn('Failed to fetch messages:', err);
    } finally {
      clearTimeout(timeout);
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    const run = async () => {
      if (cancelled) return;
      await fetchMessages(true);
    };
    run();
    interval = setInterval(run, 3000);
    const onOnline = () => { if (!cancelled) void fetchMessages(true); };
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [activeConv?.id, currentUser?.id]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, activeConv?.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending || !activeConv) return;
    const storedToken = localStorage.getItem('earth_one_token');
    if (!storedToken) { setConnError('请先登录后发送消息。'); return; }
    const text = inputText.trim();
    // prevent duplicate sends of identical content while request in-flight
    if (pendingSendRef.current === text) return;
    pendingSendRef.current = text;
    setIsSending(true);
    setInputText('');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${storedToken}` };
      const res = await fetch(`/api/conversations/${activeConv.id}/messages`, {
        method: 'POST', headers,
        body: JSON.stringify({ content: text, targetLanguage: targetTranslateLang, autoTranslate }),
        signal: controller.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setConnError(res.status === 401 ? '登录状态已失效，请重新登录。' : (data.error || '发送失败，请检查网络后重试（消息未发送）。'));
        setInputText(text);
      } else if (data.message) {
        setMessages(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]);
        setConnError(null);
        await onRefreshConversations?.();
      } else {
        setInputText(text);
      }
    } catch (err: any) {
      setConnError(err?.name === 'AbortError' ? '发送超时，请检查网络后重试（消息未发送）。' : '网络异常，消息未发送，请重试。');
      setInputText(text);
    } finally {
      clearTimeout(timeout);
      pendingSendRef.current = null;
      setIsSending(false);
    }
  };

  const toggleShowOriginal = (msgId: string) => setShowOriginalMap(prev => ({ ...prev, [msgId]: !prev[msgId] }));

  const connectGoogle = () => { window.location.href = '/api/auth/google/start'; };

  return (
    <div className="w-full max-w-7xl mx-auto h-[calc(100vh-8rem)] min-h-[580px] p-3 sm:p-4 flex flex-col lg:flex-row gap-4">
      {/* Left: conversations + integrations */}
      <div className="w-full lg:w-80 xl:w-96 rounded-2xl bg-slate-900/80 border border-slate-800 p-3.5 flex flex-col shrink-0 shadow-xl backdrop-blur-md min-h-0">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-2">
          <div className="flex items-center space-x-2">
            <MessageCircle className="w-4 h-4 text-cyan-400" />
            <h2 className="font-bold text-sm text-slate-100">{t.chatTab || 'Messenger'}</h2>
          </div>
          <button onClick={() => setShowIntegrations(v => !v)} className={`text-[10px] px-2 py-1 rounded-full border font-mono ${showIntegrations ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40' : 'bg-slate-950 text-slate-400 border-slate-700'}`}>
            <span className="inline-flex items-center gap-1"><Plug className="w-3 h-3" />连接</span>
          </button>
        </div>

        {showIntegrations && (
          <div className="mb-3 rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-slate-200 flex items-center gap-1"><Link2 className="w-3.5 h-3.5 text-cyan-400" />账号与渠道（官方接口）</p>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">支持官方 OAuth/Business API 接入。<b className="text-amber-300/90">无法</b>登录或同步个人微信/WhatsApp 聊天记录（无官方支持，且不做非官方自动化）。</p>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {integrations.length === 0 ? (
                <div className="text-[10px] text-slate-500">正在加载集成状态…</div>
              ) : integrations.map(it => (
                <div key={it.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-slate-200 truncate">{it.name}</p>
                      <p className="text-[10px] text-slate-500 truncate">{it.linked ? `已连接: ${it.linkedLabel || '已绑定'}` : (it.status === 'available' ? '可用' : '需配置')}</p>
                    </div>
                    {it.id === 'google' ? (
                      <button onClick={connectGoogle} className="shrink-0 px-2 py-1 rounded-md bg-white text-slate-900 text-[10px] font-semibold hover:bg-slate-100">
                        {it.linked ? '重新绑定' : 'Google 登录'}
                      </button>
                    ) : (
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] border ${it.status === 'available' ? 'text-emerald-300 border-emerald-700/60' : 'text-amber-300 border-amber-700/60'}`}>
                        {it.status === 'available' ? '已配置' : '待配置'}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400 leading-relaxed">{it.capabilities[0]}</p>
                  {it.limitations?.[0] && <p className="mt-0.5 text-[10px] text-amber-300/80 leading-relaxed flex gap-1"><ShieldAlert className="w-3 h-3 shrink-0 mt-0.5" />{it.limitations[0]}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
          <input value={convQuery} onChange={e => setConvQuery(e.target.value)} placeholder="搜索会话/消息…" className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60" />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0">
          {sorted.map(conv => {
            const isSelected = conv.id === activeConv?.id;
            return (
              <button key={conv.id} onClick={() => onSelectConversation(conv.id)}
                className={`w-full flex items-center space-x-3 p-2.5 rounded-xl text-left cursor-pointer transition-all ${isSelected ? 'bg-cyan-500/15 border border-cyan-500/40 text-slate-100 shadow-sm' : 'bg-slate-950/40 hover:bg-slate-800/60 border border-slate-800/60 text-slate-300'}`}>
                {conv.type === 'global_channel' ? (
                  <div className="w-10 h-10 rounded-full bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0"><Globe className="w-5 h-5" /></div>
                ) : (
                  <div className="relative shrink-0">
                    <img src={conv.otherUser?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'} alt={conv.name} className="w-10 h-10 rounded-full object-cover border border-slate-700" />
                    {conv.isOnline && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs truncate text-slate-200">{conv.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono shrink-0">{conv.lastMessageTime}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{conv.lastMessage || 'No messages yet'}</p>
                </div>
              </button>
            );
          })}
          {sorted.length === 0 && <div className="text-xs text-slate-500 text-center py-8">暂无会话。可从用户资料发起私聊。</div>}
        </div>
      </div>

      {/* Right: messages */}
      <div className="flex-1 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col shadow-xl backdrop-blur-md overflow-hidden min-h-0">
        <div className="p-3.5 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-3 bg-slate-950/40">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2 truncate">
                <span className="truncate">{activeConv?.name || 'Chat'}</span>
                {activeConv?.countryCode && <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-slate-800 text-cyan-300">{activeConv.countryCode}</span>}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono truncate">Earth One Messenger · 官方渠道可在左侧配置连接</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700/70 text-xs">
            <Languages className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-300 font-medium hidden sm:inline">AI 翻译</span>
            <select value={targetTranslateLang} onChange={e => setTargetTranslateLang(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-0.5 text-slate-200 text-xs focus:outline-none">
              <option value="Chinese">中文</option><option value="English">English</option><option value="Arabic">العربية</option>
              <option value="Spanish">Español</option><option value="French">Français</option><option value="Russian">Русский</option>
            </select>
            <button onClick={() => setAutoTranslate(!autoTranslate)} className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer transition-colors ${autoTranslate ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50' : 'bg-slate-800 text-slate-400'}`}>
              {autoTranslate ? 'AUTO' : 'OFF'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {connError && (
            <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200 flex items-center justify-between gap-2">
              <span>{connError}</span>
              <button type="button" onClick={() => void fetchMessages(false)} className="shrink-0 px-2 py-1 rounded-lg bg-amber-800/50 hover:bg-amber-700/60 text-amber-100">重试</button>
            </div>
          )}
          {messages.map(msg => {
            const isMe = !!currentUser && msg.senderId === currentUser.id;
            const isShowingOriginal = showOriginalMap[msg.id];
            return (
              <div key={msg.id} className={`flex items-start gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                <img src={msg.senderAvatar} alt={msg.senderName} className="w-8 h-8 rounded-full object-cover border border-slate-700 shrink-0 mt-1" />
                <div className={`max-w-[min(42rem,85%)] space-y-1 ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-center gap-1.5 text-[11px] text-slate-400 ${isMe ? 'justify-end' : ''}`}>
                    <span className="font-semibold text-slate-300">{msg.senderName}</span>
                    <span className="font-mono text-[10px] px-1 bg-slate-800 rounded">{msg.senderCountry}</span>
                    <span>·</span>
                    <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className={`p-3.5 rounded-2xl text-xs leading-relaxed space-y-1.5 shadow-md ${isMe ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-tr-none' : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-tl-none'}`}>
                    {msg.translatedContent && !isShowingOriginal ? (
                      <div>
                        <p className="text-sm font-medium whitespace-pre-wrap break-words">{msg.translatedContent}</p>
                        <div className="mt-1 flex items-center justify-between text-[10px] opacity-80 border-t border-white/20 pt-1 gap-2">
                          <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /><span>AI → {msg.translatedTo || targetTranslateLang}</span></span>
                          <button onClick={() => toggleShowOriginal(msg.id)} className="underline">{t.showOriginal || '原文'}</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        {msg.translatedContent && (
                          <div className="mt-1 flex items-center justify-end text-[10px] opacity-80 border-t border-white/20 pt-1">
                            <button onClick={() => toggleShowOriginal(msg.id)} className="underline">{t.showTranslation || '译文'}</button>
                          </div>
                        )}
                      </div>
                    )}
                    {isMe && (
                      <div className="flex items-center justify-end gap-1 text-[10px] opacity-70 pt-0.5">
                        <CheckCheck className="w-3 h-3" /><span>{msg.status || 'sent'}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {messages.length === 0 && (
            <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center text-slate-400 gap-2">
              <MessageCircle className="w-10 h-10 text-slate-600" />
              <p className="text-sm">开始对话，消息会自动翻译（可切换）</p>
              <p className="text-[11px] text-slate-500">可在左侧查看官方渠道连接说明（Google 登录、微信/WhatsApp/Telegram）</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-3 bg-slate-950/60 border-t border-slate-800 flex items-end gap-2">
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSendMessage(e as any); } }}
            placeholder={t.typeMessage || '输入消息… (Enter 发送，Shift+Enter 换行)'}
            rows={1}
            className="flex-1 min-h-[42px] max-h-32 resize-y px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          <button type="submit" disabled={!inputText.trim() || isSending || !activeConv}
            className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-all h-[42px]">
            <Send className="w-3.5 h-3.5" /><span>{isSending ? '...' : (t.send || '发送')}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
