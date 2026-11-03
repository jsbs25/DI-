import React, { useState, useEffect, useRef } from 'react';
import { Conversation, ChatMessage, User, Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import {
  Send,
  Languages,
  Sparkles,
  Users,
  MessageCircle,
  Globe,
  Radio,
  CheckCheck,
  RotateCcw,
  Info
} from 'lucide-react';

interface GlobalMessengerProps {
  conversations: Conversation[];
  activeConversationId: string;
  onSelectConversation: (id: string) => void;
  currentUser: User | null;
  lang: Language;
}

export const GlobalMessenger: React.FC<GlobalMessengerProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  currentUser,
  lang
}) => {
  const t = translations[lang];
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [targetTranslateLang, setTargetTranslateLang] = useState('English');
  const [isSending, setIsSending] = useState(false);
  const [showOriginalMap, setShowOriginalMap] = useState<Record<string, boolean>>({});

  const activeConv = conversations.find(c => c.id === activeConversationId) || conversations[0];

  // Fetch messages for active conversation
  const fetchMessages = async () => {
    if (!activeConv) return;
    try {
      const res = await fetch(`/api/conversations/${activeConv.id}/messages`);
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.warn('Failed to fetch messages:', err);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3500);
    return () => clearInterval(interval);
  }, [activeConv?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending || !activeConv) return;

    setIsSending(true);
    try {
      const storedToken = localStorage.getItem('earth_one_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (storedToken) headers['Authorization'] = `Bearer ${storedToken}`;

      const res = await fetch(`/api/conversations/${activeConv.id}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: inputText.trim(),
          targetLanguage: targetTranslateLang,
          autoTranslate
        })
      });
      const data = await res.json();
      if (data.success && data.message) {
        setMessages(prev => [...prev, data.message]);
        setInputText('');
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const toggleShowOriginal = (msgId: string) => {
    setShowOriginalMap(prev => ({
      ...prev,
      [msgId]: !prev[msgId]
    }));
  };

  return (
    <div className="w-full max-w-6xl mx-auto h-[calc(100vh-8rem)] min-h-[580px] p-4 flex flex-col md:flex-row gap-4">
      {/* 1. Conversations List Sidebar */}
      <div className="w-full md:w-80 rounded-2xl bg-slate-900/80 border border-slate-800 p-3.5 flex flex-col shrink-0 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-2">
          <div className="flex items-center space-x-2">
            <MessageCircle className="w-4 h-4 text-cyan-400" />
            <h2 className="font-bold text-sm text-slate-100">{t.chatTab}</h2>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
            LIVE
          </span>
        </div>

        {/* Conversation Items */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {conversations.map(conv => {
            const isSelected = conv.id === activeConv?.id;
            return (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full flex items-center space-x-3 p-2.5 rounded-xl text-left cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-cyan-500/15 border border-cyan-500/40 text-slate-100 shadow-sm'
                    : 'bg-slate-950/40 hover:bg-slate-800/60 border border-slate-800/60 text-slate-300'
                }`}
              >
                {conv.type === 'global_channel' ? (
                  <div className="w-10 h-10 rounded-full bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0">
                    <Globe className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="relative shrink-0">
                    <img
                      src={conv.otherUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                      alt={conv.name}
                      className="w-10 h-10 rounded-full object-cover border border-slate-700"
                    />
                    {conv.isOnline && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
                    )}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs truncate text-slate-200">
                      {conv.name}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{conv.lastMessageTime}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {conv.lastMessage}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Active Chat Stream & AI Translation Bar */}
      <div className="flex-1 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col shadow-xl backdrop-blur-md overflow-hidden">
        {/* Chat Room Header */}
        <div className="p-3.5 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-3 bg-slate-950/40">
          <div className="flex items-center space-x-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <div>
              <h3 className="font-bold text-sm text-slate-100 flex items-center space-x-2">
                <span>{activeConv?.name}</span>
                {activeConv?.countryCode && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-slate-800 text-cyan-300">
                    {activeConv.countryCode}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Encrypted · AI Multi-Language Gateway Active
              </p>
            </div>
          </div>

          {/* AI Auto-Translation Controls */}
          <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700/70 text-xs">
            <Languages className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-300 font-medium">AI Translation:</span>
            <select
              value={targetTranslateLang}
              onChange={e => setTargetTranslateLang(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-0.5 text-slate-200 text-xs focus:outline-none"
            >
              <option value="Chinese">中文 (Chinese)</option>
              <option value="English">English</option>
              <option value="Arabic">العربية (Arabic)</option>
              <option value="Spanish">Español</option>
              <option value="French">Français</option>
              <option value="Russian">Русский</option>
            </select>
            <button
              onClick={() => setAutoTranslate(!autoTranslate)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer transition-colors ${
                autoTranslate
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {autoTranslate ? 'AUTO ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map(msg => {
            const isMe = msg.senderId === currentUser?.id;
            const isShowingOriginal = showOriginalMap[msg.id];

            return (
              <div
                key={msg.id}
                className={`flex items-start space-x-3 ${isMe ? 'flex-row-reverse space-x-reverse' : ''}`}
              >
                <img
                  src={msg.senderAvatar}
                  alt={msg.senderName}
                  className="w-8 h-8 rounded-full object-cover border border-slate-700 shrink-0 mt-1"
                />

                <div className={`max-w-md space-y-1 ${isMe ? 'items-end' : 'items-start'}`}>
                  {/* Sender metadata */}
                  <div className={`flex items-center space-x-1.5 text-[11px] text-slate-400 ${isMe ? 'justify-end' : ''}`}>
                    <span className="font-semibold text-slate-300">{msg.senderName}</span>
                    <span className="font-mono text-[10px] px-1 bg-slate-800 rounded">{msg.senderCountry}</span>
                    <span>·</span>
                    <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  {/* Bubble */}
                  <div
                    className={`p-3.5 rounded-2xl text-xs leading-relaxed space-y-1.5 shadow-md ${
                      isMe
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-tr-none'
                        : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-tl-none'
                    }`}
                  >
                    {/* Display translated or original content */}
                    {msg.translatedContent && !isShowingOriginal ? (
                      <div>
                        <p className="text-sm font-medium">{msg.translatedContent}</p>
                        <div className="mt-1 flex items-center justify-between text-[10px] opacity-75 border-t border-white/20 pt-1">
                          <span className="flex items-center space-x-1">
                            <Sparkles className="w-3 h-3 text-cyan-200" />
                            <span>AI Translated to {msg.translatedTo || targetTranslateLang}</span>
                          </span>
                          <button
                            onClick={() => toggleShowOriginal(msg.id)}
                            className="underline cursor-pointer hover:opacity-100"
                          >
                            {t.showOriginal}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm">{msg.content}</p>
                        {msg.translatedContent && (
                          <div className="mt-1 flex items-center justify-end text-[10px] opacity-75 border-t border-white/20 pt-1">
                            <button
                              onClick={() => toggleShowOriginal(msg.id)}
                              className="underline cursor-pointer hover:opacity-100"
                            >
                              {t.showTranslation}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input Box */}
        <form onSubmit={handleSendMessage} className="p-3 bg-slate-950/60 border-t border-slate-800 flex items-center space-x-2">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder={t.typeMessage}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-semibold text-xs flex items-center space-x-1.5 shadow-md cursor-pointer transition-all"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{t.send}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
