import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export const PreviewNotice: React.FC = () => {
  const [open, setOpen] = useState(true);
  const isPreview = import.meta.env.VITE_PREVIEW_MODE === 'true';
  if (!isPreview || !open) return null;
  return (
    <div role="status" aria-live="polite" className="fixed top-0 inset-x-0 z-[200] border-b border-amber-400/30 bg-amber-950/90 backdrop-blur text-amber-50">
      <div className="mx-auto max-w-7xl px-3 py-2 flex items-start gap-2 text-[11px] sm:text-xs leading-relaxed">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
        <p className="flex-1 min-w-0">
          <strong>ONE 预览站（静态前端）</strong>：此为新版真实前端构建，不含后端服务。登录/注册、消息收发、音乐/Library/搜索/爬虫等依赖 API、数据库、存储或 WebSocket 的功能暂不可用，页面可能显示加载失败或空状态；<strong>未接入真实数据，未伪造演示数据</strong>。正式站与生产数据未受影响。
        </p>
        <button type="button" aria-label="关闭提示" onClick={() => setOpen(false)} className="shrink-0 rounded p-1 hover:bg-white/10">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
