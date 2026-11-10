import React, { useEffect, useState } from 'react';
import { Activity, GitBranch, Server, Wifi, WifiOff, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

export const DevStatusPanel: React.FC<{ wsStatus?: string }> = ({ wsStatus = 'off' }) => {
  const [open, setOpen] = useState(true);
  const [data, setData] = useState<any>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/dev/status');
      if (r.status === 404) { setEnabled(false); setData(null); return; }
      const d = await r.json().catch(() => null);
      if (d?.success) { setEnabled(true); setData(d); } else { setEnabled(false); }
    } catch { setEnabled(false); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  if (enabled === false) return null;

  const pill = (ok: boolean | null | undefined, t?: string) => (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ok ? 'text-emerald-300 border-emerald-700/50 bg-emerald-500/10' : ok === false ? 'text-amber-300 border-amber-700/50 bg-amber-500/10' : 'text-slate-400 border-slate-700'}`}>{t ?? (ok ? 'OK' : ok === false ? 'NO' : 'N/A')}</span>
  );

  return (
    <div className="fixed bottom-3 right-3 z-[70] w-[360px] max-w-[calc(100vw-1.5rem)] rounded-xl border border-cyan-800/50 bg-slate-950/95 backdrop-blur shadow-2xl text-slate-200 overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900/70">
        <span className="flex items-center gap-2 text-xs font-semibold"><Activity className="w-4 h-4 text-cyan-400"/>开发状态面板 / Dev Status</span>
        <span className="flex items-center gap-2 text-slate-400">{loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : null}{open ? <ChevronDown className="w-4 h-4"/> : <ChevronUp className="w-4 h-4"/>}</span>
      </button>
      {open && (
        <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto text-[11px]">
          <div className="flex items-center justify-between"><span className="text-slate-400">环境</span><span>{data?.services?.server?.nodeEnv || 'dev'} · PID {data?.services?.server?.pid || '-'}</span></div>
          <div className="space-y-1">
            <p className="text-slate-400 flex items-center gap-1"><GitBranch className="w-3.5 h-3.5"/>Git（真实）</p>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2 space-y-1">
              <div className="flex justify-between gap-2"><span className="text-slate-500">Branch</span><span className="text-slate-200 font-mono">{data?.git?.branch || '-'}</span></div>
              <div className="flex justify-between gap-2"><span className="text-slate-500">HEAD</span><span className="text-slate-200 font-mono truncate max-w-[200px]" title={data?.git?.head || ''}>{(data?.git?.head || '-').slice(0, 12)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-slate-500">origin/main</span><span className="text-slate-200 font-mono">{(data?.git?.originMain || '-').slice(0, 12)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-slate-500">同步</span>{pill(data?.git?.inSync, data?.git?.inSync ? 'HEAD==origin/main' : data?.git?.inSync === false ? '不同步' : 'N/A')}</div>
              <div className="text-slate-400 break-all whitespace-pre-wrap">{data?.git?.short || '-'}</div>
              {data?.git?.worktree && <div className="text-[10px] text-slate-500 break-all whitespace-pre-wrap">{String(data.git.worktree).split('\n')[0]}</div>}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-slate-400 flex items-center gap-1"><Server className="w-3.5 h-3.5"/>服务与配置（真实）</p>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2 space-y-1.5">
              <div className="flex justify-between"><span>Server</span>{pill(true, '运行中')}</div>
              <div className="flex justify-between"><span>WebSocket</span><span className={`text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${wsStatus==='open'?'text-emerald-300 border-emerald-700/50 bg-emerald-500/10':'text-amber-300 border-amber-700/50 bg-amber-500/10'}`}>{wsStatus==='open'?<Wifi className="w-3 h-3"/>:<WifiOff className="w-3 h-3"/>}{wsStatus}</span></div>
              <div className="flex justify-between"><span>WeChat OAuth</span>{pill(data?.oauth?.wechat?.configured, data?.oauth?.wechat?.configured ? '已配置' : '未配置')}</div>
              <div className="flex justify-between"><span>Google OAuth</span>{pill(data?.oauth?.google?.configured, data?.oauth?.google?.configured ? '已配置' : '未配置')}</div>
              <div className="flex justify-between"><span>APP_URL</span>{pill(!data?.oauth?.wechat?.appUrlIsPlaceholder, data?.oauth?.wechat?.appUrlIsPlaceholder ? '占位值' : '已设置')}</div>
              <div className="flex justify-between"><span>SMS</span>{pill(data?.services?.sms?.configured, data?.services?.sms?.configured ? '已配置' : '未配置')}</div>
              <div className="flex justify-between"><span>Mail</span>{pill(data?.services?.mail?.configured, data?.services?.mail?.configured ? '已配置' : '未配置')}</div>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-slate-400">模块状态（来自服务端开发状态）</p>
            <div className="space-y-1">
              <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-2"><p className="text-emerald-300 mb-1">已完成</p><ul className="list-disc pl-4 space-y-0.5 text-slate-300">{(data?.modules?.completed||[]).map((m:string,i:number)=><li key={i}>{m}</li>)}</ul></div>
              <div className="rounded-lg border border-cyan-900/40 bg-cyan-950/20 p-2"><p className="text-cyan-300 mb-1">进行中</p><ul className="list-disc pl-4 space-y-0.5 text-slate-300">{(data?.modules?.inProgress||[]).map((m:string,i:number)=><li key={i}>{m}</li>)}</ul></div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-2"><p className="text-slate-300 mb-1">待完成</p><ul className="list-disc pl-4 space-y-0.5 text-slate-400">{(data?.modules?.pending||[]).map((m:string,i:number)=><li key={i}>{m}</li>)}</ul></div>
            </div>
          </div>
          <div className="flex justify-end"><button onClick={()=>void load()} className="text-[10px] px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1"><RefreshCw className="w-3 h-3"/>刷新</button></div>
          <p className="text-[10px] text-slate-500">仅开发环境可见；不显示密钥/Token/Session/个人数据。</p>
        </div>
      )}
    </div>
  );
};
