import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Phone, Users, X, ArrowUpRight } from 'lucide-react';
import type { Conversation, Language, User } from '../../types/index.ts';

interface FloatingCommWidgetProps {
  lang: Language;
  currentUser: User | null;
  conversations: Conversation[];
  hidden?: boolean;
  onOpenDrawerChat: (conversationId?: string) => void;
  onOpenFullCenter: () => void;
  onStartVoiceCall: (target: { targetUserId?: string; conversationId?: string }) => void;
}

interface ContactEntry {
  id: string;
  name: string;
  avatar?: string;
  online: boolean;
  conversationId?: string;
  targetUserId?: string;
  subtitle?: string;
  unread: number;
}

export const FloatingCommWidget: React.FC<FloatingCommWidgetProps> = ({
  lang,
  currentUser,
  conversations,
  hidden = false,
  onOpenDrawerChat,
  onOpenFullCenter,
  onStartVoiceCall,
}) => {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Array<{
    id: string;
    displayName: string;
    username: string;
    avatar?: string;
    isOnline?: boolean;
  }>>([]);
  const isZh = lang === 'zh';

  // Fetch real friend presence when opened
  useEffect(() => {
    if (!open || !currentUser) return;
    let cancelled = false;
    fetch('/api/friends')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && Array.isArray(d?.friends)) {
          setFriends(d.friends);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, currentUser?.id]);

  const contacts = useMemo<ContactEntry[]>(() => {
    const map = new Map<string, ContactEntry>();

    for (const c of conversations) {
      const peer = c.otherUser;
      const key = peer?.id || c.id;
      const name = peer?.displayName || c.name || '会话';
      const rawLast = (c as unknown as { lastMessage?: string | { content?: string } }).lastMessage;
      const lastText = typeof rawLast === 'string' ? rawLast : rawLast?.content || '';
      map.set(key, {
        id: key,
        name,
        avatar: peer?.avatar || c.avatar,
        online: Boolean(peer?.isOnline),
        conversationId: c.id,
        targetUserId: peer?.id,
        subtitle: lastText ? lastText.slice(0, 26) : peer?.isOnline ? (isZh ? '在线' : 'Online') : undefined,
        unread: Number((c as unknown as { unreadCount?: number }).unreadCount || 0),
      });
    }

    for (const f of friends) {
      if (f.id === currentUser?.id) continue;
      if (map.has(f.id)) {
        const cur = map.get(f.id)!;
        cur.online = Boolean(f.isOnline);
        if (!cur.avatar && f.avatar) cur.avatar = f.avatar;
      } else {
        map.set(f.id, {
          id: f.id,
          name: f.displayName || f.username,
          avatar: f.avatar,
          online: Boolean(f.isOnline),
          targetUserId: f.id,
          subtitle: f.isOnline ? (isZh ? '在线' : 'Online') : (isZh ? '好友' : 'Contact'),
          unread: 0,
        });
      }
    }

    return Array.from(map.values())
      .sort((a, b) => Number(b.online) - Number(a.online) || b.unread - a.unread)
      .slice(0, 10);
  }, [conversations, friends, currentUser?.id, isZh]);

  const totalUnread = useMemo(
    () => contacts.reduce((sum, c) => sum + (c.unread || 0), 0),
    [contacts]
  );

  const onlineCount = useMemo(
    () => contacts.filter((c) => c.online).length,
    [contacts]
  );

  if (hidden || !currentUser) return null;

  return (
    <div className="fixed bottom-16 right-4 z-[82] flex flex-col items-end sm:bottom-6 sm:right-5 pointer-events-none">
      {/* Compact Non-Blocking Contacts & In-Place Voice Call Popover */}
      {open && (
        <div
          role="dialog"
          aria-label={isZh ? '悬浮通信' : 'Quick Communication'}
          className="pointer-events-auto mb-2.5 w-[min(88vw,308px)] overflow-hidden rounded-2xl border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)]/95 text-[var(--color-one-text)] shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-[var(--color-one-border)] px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />
              <span className="text-xs font-semibold">
                {isZh ? '悬浮通信' : 'Quick Comm'}
              </span>
              {onlineCount > 0 && (
                <span className="text-[10px] text-[var(--color-one-accent)]">
                  · {onlineCount} {isZh ? '在线' : 'online'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenFullCenter();
                }}
                className="inline-flex cursor-pointer items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] text-[var(--color-one-text-muted)] transition hover:text-[var(--color-one-text)]"
                title={isZh ? '打开通信中心' : 'Open Communication Center'}
              >
                <span>{isZh ? '通信中心' : 'Full'}</span>
                <ArrowUpRight className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[var(--color-one-text-muted)] hover:bg-[var(--color-one-surface-soft)]"
                aria-label={isZh ? '关闭悬浮通信' : 'Close'}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-2 space-y-1">
            {contacts.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-[var(--color-one-text-muted)]">
                <p>{isZh ? '暂无最近联系人' : 'No contacts yet'}</p>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpenFullCenter();
                  }}
                  className="mt-2.5 cursor-pointer rounded-xl bg-[var(--color-one-accent)] px-3 py-1.5 text-[11px] font-medium text-white"
                >
                  {isZh ? '去通信中心添加好友' : 'Open Messages'}
                </button>
              </div>
            ) : (
              contacts.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 transition hover:bg-[var(--color-one-surface-soft)]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpenDrawerChat(c.conversationId);
                    }}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                  >
                    <div className="relative h-8 w-8 shrink-0">
                      {c.avatar ? (
                        <img
                          src={c.avatar}
                          alt={c.name}
                          className="h-8 w-8 rounded-full object-cover border border-[var(--color-one-border)]"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-one-surface-soft)] text-xs font-semibold text-[var(--color-one-accent)]">
                          {c.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-one-surface)] ${
                          c.online ? 'bg-emerald-500' : 'bg-slate-400/60'
                        }`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium text-[var(--color-one-text)]">{c.name}</span>
                        {c.unread > 0 && (
                          <span className="rounded-full bg-[var(--color-one-accent)] px-1.5 py-0.2 text-[10px] font-semibold text-white">
                            {c.unread}
                          </span>
                        )}
                      </div>
                      {c.subtitle && (
                        <div className="truncate text-[10px] text-[var(--color-one-text-muted)]">{c.subtitle}</div>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onStartVoiceCall({
                        targetUserId: c.targetUserId,
                        conversationId: c.conversationId,
                      });
                    }}
                    className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-bg)] text-[var(--color-one-accent)] transition hover:bg-[var(--color-one-accent)] hover:text-white"
                    title={isZh ? '不退出当前页发起语音通话' : 'Voice call in-place'}
                  >
                    <Phone className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-[var(--color-one-border)] px-3.5 py-2 text-[10px] text-[var(--color-one-text-dim)]">
            {isZh ? '通话与消息均在当前页面悬浮进行，不打断阅读与浏览。' : 'Voice calls & messages stay floating without leaving your page.'}
          </div>
        </div>
      )}

      {/* Subtle Compact Floating Entry Pill */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={isZh ? '悬浮通信入口' : 'Quick Communication'}
        aria-expanded={open}
        className="pointer-events-auto relative inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)]/92 text-[var(--color-one-text)] shadow-lg backdrop-blur-xl transition hover:scale-[1.03] hover:border-[var(--color-one-accent)] active:scale-95"
        title={isZh ? '悬浮通信（联系人 / 语音通话）' : 'Floating Communication'}
      >
        {open ? (
          <X className="h-4 w-4 text-[var(--color-one-text-muted)]" />
        ) : (
          <MessageCircle className="h-4.5 w-4.5 text-[var(--color-one-accent)]" />
        )}
        {!open && (totalUnread > 0 || onlineCount > 0) && (
          <span
            className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white ${
              totalUnread > 0 ? 'bg-rose-500' : 'bg-emerald-500'
            }`}
          >
            {totalUnread > 0 ? (totalUnread > 9 ? '9+' : totalUnread) : ''}
          </span>
        )}
      </button>
    </div>
  );
};
