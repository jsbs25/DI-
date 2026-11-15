import React, { useState } from 'react';
import { Shield, Wifi, Activity, CheckCircle, AlertTriangle, X, Server } from 'lucide-react';

interface BrowserProxyModalProps {
  browserEngine?: EarthOneBrowserApi;
  proxyStatus: EarthOneBrowserProxyStatus | null;
  onStatusChange: (status: EarthOneBrowserProxyStatus) => void;
  onClose: () => void;
}

export const BrowserProxyModal: React.FC<BrowserProxyModalProps> = ({
  browserEngine,
  proxyStatus,
  onStatusChange,
  onClose,
}) => {
  const supportsDesktopProxy = !!(browserEngine?.setProxy && browserEngine?.clearProxy);
  const [mode, setMode] = useState<EarthOneBrowserProxyMode>(proxyStatus?.active ? proxyStatus.mode : 'socks5');
  const [host, setHost] = useState(proxyStatus?.host || '');
  const [port, setPort] = useState(proxyStatus?.port ? String(proxyStatus.port) : '1080');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [label, setLabel] = useState(proxyStatus?.label || '');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!browserEngine?.setProxy || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await browserEngine.setProxy({
        mode,
        host: host.trim(),
        port: port.trim(),
        ...(username.trim() ? { username: username.trim() } : {}),
        ...(password ? { password } : {}),
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      if (res?.status) onStatusChange(res.status);
      if (res?.success) {
        setUsername('');
        setPassword('');
        setFeedback({
          ok: true,
          text:
            mode === 'direct'
              ? '已切换为直连模式（仅影响内置浏览器会话 persist:one-browser）。'
              : `已启用 ${mode.toUpperCase()} 浏览器代理（仅作用于内置浏览器标签页）。`,
        });
      } else {
        setFeedback({ ok: false, text: res?.error || '应用代理配置失败。' });
      }
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message || '应用代理配置失败。' });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!browserEngine?.clearProxy || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await browserEngine.clearProxy();
      if (res?.status) onStatusChange(res.status);
      setMode('direct');
      setFeedback({ ok: true, text: '已恢复内置浏览器直连模式。' });
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message || '重置失败。' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!browserEngine?.testProxy || testing) return;
    setTesting(true);
    setFeedback(null);
    try {
      const r = await browserEngine.testProxy();
      setFeedback({
        ok: !!r.ok,
        text: r.ok
          ? `探测成功 (HTTP ${r.status || 200} · ${r.latencyMs}ms · ${r.proxied ? '经由代理节点' : '直连'})`
          : `探测失败 (${r.latencyMs}ms): ${r.error || '无法建立连接'}`,
      });
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message || '代理连通性测试失败。' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-slate-950 text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center shrink-0">
              <Server className="w-4 h-4 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate">ONE 内置浏览器代理 · Mode A</h3>
              <p className="text-[11px] text-slate-400 truncate">会话分区：{proxyStatus?.partition || 'persist:one-browser'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭浏览器代理设置"
            className="min-h-[36px] min-w-[36px] rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/[0.06] inline-flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/[0.08] p-3 text-xs text-cyan-100/90 flex items-start gap-2.5 leading-relaxed">
            <Shield className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-cyan-200">作用域严格隔离声明</p>
              <p className="mt-0.5 text-[11px] text-cyan-100/80">
                Mode A 仅控制 ONE 内置浏览器标签页（<code className="text-cyan-200">persist:one-browser</code>），不会改变本机系统全局路由，也不会干扰 ONE 聊天、语音通话或视频通话通道。如需全设备系统级隧道，请使用 ONE Network（Mode B · WireGuard VPN）。
              </p>
            </div>
          </div>

          {!supportsDesktopProxy ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100 space-y-2 leading-relaxed">
              <p className="font-semibold flex items-center gap-1.5 text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>当前运行在标准 Web 浏览器环境中</span>
              </p>
              <p className="text-amber-100/85">
                受限于浏览器安全沙盒，网页环境无法通过 <code className="text-amber-200">session.setProxy()</code> 绑定自定义 SOCKS5/HTTP 代理或拦截远端 DNS。
              </p>
              <p className="text-amber-100/85">
                请使用 <strong>ONE Desktop（Electron 桌面端）</strong> 启用内置浏览器隔离代理，或前往 <strong>ONE 网络中心</strong> 配置系统级 WireGuard VPN（Mode B）。
              </p>
            </div>
          ) : (
            <form onSubmit={handleApply} className="space-y-3">
              <div className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10">
                <span className="text-slate-400">当前浏览器状态</span>
                <span className={`font-semibold inline-flex items-center gap-1.5 ${proxyStatus?.active ? 'text-emerald-300' : 'text-slate-300'}`}>
                  <Wifi className="w-3.5 h-3.5" />
                  {proxyStatus?.active
                    ? `${proxyStatus.mode.toUpperCase()} · ${proxyStatus.host}:${proxyStatus.port}${proxyStatus.remoteDns ? ' (远程DNS)' : ''}`
                    : '直连模式 (Direct)'}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-xs">
                {(['direct', 'socks5', 'https', 'http'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`min-h-[36px] rounded-xl border font-medium transition ${mode === m ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100' : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-white'}`}
                  >
                    {m === 'direct' ? '直连' : m.toUpperCase()}
                  </button>
                ))}
              </div>

              {mode !== 'direct' && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-[11px] text-slate-400 mb-1">节点主机 / IP</label>
                      <input
                        type="text"
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        placeholder="127.0.0.1 或 proxy.example.com"
                        className="w-full min-h-[38px] rounded-xl border border-white/15 bg-black/40 px-3 text-xs text-white focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">端口</label>
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        placeholder="1080"
                        className="w-full min-h-[38px] rounded-xl border border-white/15 bg-black/40 px-3 text-xs text-white tabular-nums focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">认证用户名（可选）</label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder={proxyStatus?.hasCredentials ? '已配置（留空不改）' : '可选'}
                        className="w-full min-h-[36px] rounded-xl border border-white/15 bg-black/40 px-3 text-xs text-white focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">认证密码（仅存主进程）</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="不会回显到界面"
                        className="w-full min-h-[36px] rounded-xl border border-white/15 bg-black/40 px-3 text-xs text-white focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">节点备注名（可选）</label>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="例如：Tokyo-Relay-01"
                      className="w-full min-h-[36px] rounded-xl border border-white/15 bg-black/40 px-3 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </>
              )}

              {feedback && (
                <div className={`rounded-xl border px-3 py-2 text-xs flex items-center gap-2 ${feedback.ok ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/35 bg-rose-500/10 text-rose-200'}`}>
                  {feedback.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                  <span>{feedback.text}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  {browserEngine?.testProxy && (
                    <button
                      type="button"
                      onClick={() => void handleTest()}
                      disabled={testing}
                      className="min-h-[38px] px-3 rounded-xl border border-white/15 bg-white/[0.05] text-xs font-medium text-slate-200 hover:bg-white/[0.1] inline-flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <Activity className={`w-3.5 h-3.5 ${testing ? 'animate-pulse text-cyan-300' : ''}`} />
                      <span>测试连通</span>
                    </button>
                  )}
                  {proxyStatus?.active && (
                    <button
                      type="button"
                      onClick={() => void handleClear()}
                      disabled={saving}
                      className="min-h-[38px] px-3 rounded-xl border border-rose-500/35 bg-rose-500/10 text-xs font-medium text-rose-200 hover:bg-rose-500/20 disabled:opacity-40"
                    >
                      切回直连
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[38px] px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold disabled:opacity-40"
                >
                  {saving ? '应用中…' : '应用到内置浏览器'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
