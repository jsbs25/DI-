import React, { useMemo, useState } from 'react';
import { ChevronRight, ShieldAlert, Trash2, X } from 'lucide-react';

type Category = EarthOneBrowserPrivacyCategory;
type Selection = EarthOneBrowserPrivacySelection;
type TimeRange = EarthOneBrowserPrivacyTimeRange;

interface BrowserPrivacyPanelProps {
  counts: {
    history: number;
    bookmarks: number;
    downloadRecords: number;
    activeDownloads: number;
    sessionRestoreEnabled: boolean;
    sessionRestoreTabs: number;
    permissions: number;
    pendingPermissions: number;
  };
  disabledReasons?: Partial<Record<Category, string>>;
  onClear: (selection: Selection, timeRange: TimeRange) => Promise<EarthOneBrowserPrivacyResult>;
  onClose: () => void;
}

const EMPTY_SELECTION: Selection = {
  history: false,
  bookmarks: false,
  downloadRecords: false,
  sessionRestore: false,
  permissions: false,
  siteData: false
};

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  all: '全部时间',
  hour: '最近一小时',
  day: '最近 24 小时',
  week: '最近 7 天',
  fourWeeks: '最近 4 周'
};

export const BrowserPrivacyPanel: React.FC<BrowserPrivacyPanelProps> = ({ counts, disabledReasons = {}, onClear, onClose }) => {
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<EarthOneBrowserPrivacyResult | null>(null);
  const selectedCategories = useMemo(() => (Object.keys(selection) as Category[]).filter(key => selection[key]), [selection]);

  const categories: Array<{ key: Category; label: string; detail: string; count: string }> = [
    { key: 'history', label: '浏览历史', detail: '按时间范围移除此设备上 Browser 保存的访问记录。', count: `${counts.history} 条` },
    { key: 'bookmarks', label: '书签', detail: '删除本机 Browser 书签；时间范围不适用。', count: `${counts.bookmarks} 条` },
    { key: 'downloadRecords', label: '下载历史记录', detail: `仅删除记录，不删除已下载文件或用户创建的 PDF；进行中的下载保留${counts.activeDownloads ? `（${counts.activeDownloads} 项）` : ''}。`, count: `${counts.downloadRecords} 条可清除` },
    { key: 'sessionRestore', label: '启动恢复快照', detail: counts.sessionRestoreEnabled ? `关闭启动恢复并删除已保存的标签网址快照（${counts.sessionRestoreTabs} 个标签）。` : '删除本机保存的启动恢复网址快照（若有）；不关闭当前标签。', count: counts.sessionRestoreEnabled ? '已开启' : '未开启' },
    { key: 'permissions', label: '会话站点权限', detail: '撤销本次运行期间允许的通知/定位授权，并拒绝待处理的权限提示。', count: `${counts.permissions} 项授权${counts.pendingPermissions ? ` · ${counts.pendingPermissions} 项待处理` : ''}` },
    { key: 'siteData', label: '网站数据、Cookie 和缓存', detail: '清除此 Browser 临时 Chromium 会话中所有网站的 Cookie、站点存储与缓存，然后安全恢复当前标签。', count: '当前 Browser 会话内所有网站' }
  ];

  const formatCategoryResult = (key: Category): string => {
    const categoryResult = result?.results[key];
    if (!categoryResult) return `${categories.find(item => item.key === key)?.label}：未返回清除结果。`;
    if (!categoryResult.success && !(key === 'siteData' && categoryResult.cleared === true)) {
      return `${categories.find(item => item.key === key)?.label}：未能清除${categoryResult.error ? `（${categoryResult.error}）` : ''}`;
    }
    if (key === 'siteData') {
      const reloadText = categoryResult.reloadFailedTabs?.length
        ? `；${categoryResult.reloadFailedTabs.length} 个标签未能恢复，请手动重试`
        : `；已恢复 ${categoryResult.reloadedTabs || 0} 个标签`;
      return `网站数据与 Cookie/缓存${categoryResult.success ? '已清除' : `已清除，但后续步骤未完成（${categoryResult.error || '未知错误'}）`}${reloadText}。`;
    }
    const cleared = typeof categoryResult.cleared === 'number'
      ? categoryResult.cleared
      : typeof categoryResult.cleared === 'object'
        ? categoryResult.cleared[key === 'history' ? 'history' : 'bookmarks'] || 0
        : 0;
    const extra = key === 'permissions' && categoryResult.deniedPending
      ? `，另拒绝 ${categoryResult.deniedPending} 项待处理请求`
      : key === 'downloadRecords' && categoryResult.retainedActive
        ? `，保留 ${categoryResult.retainedActive} 项进行中的下载`
        : '';
    return `${categories.find(item => item.key === key)?.label}：已清除 ${cleared} 项${extra}。`;
  };

  const handleClear = async () => {
    if (pending || selectedCategories.length === 0) return;
    setPending(true);
    try {
      const nextResult = await onClear(selection, timeRange);
      setResult(nextResult);
      const allSucceeded = selectedCategories.every(key => nextResult.results[key]?.success === true);
      if (allSucceeded) {
        setSelection(EMPTY_SELECTION);
        setConfirming(false);
      }
    } catch (error) {
      setResult({ success: false, changed: true, error: error instanceof Error ? error.message : '清除操作未能完成。', results: {} });
    } finally {
      setPending(false);
    }
  };

  const resultCategories = (Object.keys(result?.results || {}) as Array<Category | 'localData'>)
    .filter((key): key is Category => key !== 'localData' && Object.prototype.hasOwnProperty.call(result?.results, key));

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="隐私与清除浏览数据" data-browser-privacy-panel>
      <button type="button" aria-label="关闭隐私面板背景" onClick={onClose} disabled={pending} className="absolute inset-0 cursor-default disabled:cursor-wait" />
      <section className="relative z-[1] flex h-full w-full max-w-2xl flex-col border-l border-white/10 bg-[#08111a] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-7">
          <div>
            <div className="flex items-center gap-2 text-cyan-200">
              <ShieldAlert className="h-5 w-5" />
              <h2 className="text-lg font-semibold text-white">隐私与清除浏览数据</h2>
            </div>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-slate-400">选择要清除的 Browser 本机数据。所有操作仅限当前设备，不会把已清除的数据发送到服务器。</p>
          </div>
          <button type="button" onClick={onClose} disabled={pending} aria-label="关闭隐私面板" className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
          {result && (
            <section role={result.success ? 'status' : 'alert'} aria-live="polite" data-browser-privacy-result className={`rounded-xl border p-4 text-xs leading-relaxed ${result.success ? 'border-emerald-300/20 bg-emerald-300/[0.05] text-emerald-100' : 'border-amber-300/20 bg-amber-300/[0.05] text-amber-100'}`}>
              <p className="font-semibold">{result.skipped ? '没有选择数据，未执行清除。' : result.success ? '清除完成' : '部分数据未能清除'}</p>
              {result.error && <p className="mt-1">{result.error}</p>}
              <ul className="mt-2 space-y-1">
                {resultCategories.map(key => <li key={key}>{formatCategoryResult(key)}</li>)}
              </ul>
            </section>
          )}

          {!confirming ? (
            <>
              <section aria-labelledby="browser-privacy-items-heading">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 id="browser-privacy-items-heading" className="text-sm font-semibold text-slate-100">选择要清除的项目</h3>
                  <button type="button" onClick={() => setSelection({ ...EMPTY_SELECTION })} disabled={pending || selectedCategories.length === 0} data-privacy-clear-selection className="rounded-md px-2 py-1 text-xs text-cyan-200 hover:bg-white/[0.05] disabled:opacity-40">清除选择</button>
                </div>
                <div className="space-y-2">
                  {categories.map(category => {
                    const disabledReason = disabledReasons[category.key];
                    return (
                      <label key={category.key} data-privacy-category-row={category.key} className={`flex gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5 ${disabledReason ? 'opacity-55' : 'hover:border-cyan-200/20'}`}>
                        <input
                          type="checkbox"
                          checked={selection[category.key]}
                          disabled={pending || Boolean(disabledReason)}
                          onChange={event => setSelection(current => ({ ...current, [category.key]: event.target.checked }))}
                          data-privacy-category={category.key}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-300"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <span className="text-sm font-medium text-slate-100">{category.label}</span>
                            <span className="text-[11px] text-slate-400">{category.count}</span>
                          </span>
                          <span className="mt-1 block text-[11px] leading-relaxed text-slate-400">{category.detail}</span>
                          {disabledReason && <span className="mt-1 block text-[11px] text-amber-200">{disabledReason}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>

              <section aria-labelledby="browser-privacy-time-heading" className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
                <label id="browser-privacy-time-heading" htmlFor="browser-privacy-time" className="block text-sm font-semibold text-slate-100">时间范围</label>
                <select id="browser-privacy-time" value={timeRange} onChange={event => setTimeRange(event.target.value as TimeRange)} disabled={pending} data-privacy-time-range className="mt-3 min-h-10 w-full rounded-lg border border-white/10 bg-[#101b25] px-3 text-sm text-slate-100 focus:border-cyan-300/40 focus:outline-none">
                  {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map(key => <option key={key} value={key}>{TIME_RANGE_LABELS[key]}</option>)}
                </select>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">时间范围只适用于浏览历史和下载历史记录。书签、启动恢复快照、站点权限与网站数据没有可安全使用的统一时间记录；选择后将清除该类别的全部内容。网站数据范围为当前 Browser 临时会话内所有网站，不支持按单站筛选。</p>
              </section>

              <section className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.035] p-4 text-[11px] leading-relaxed text-emerald-50/80">
                <h3 className="mb-1 text-xs font-semibold text-emerald-100">明确保留，不会删除</h3>
                <p>下载文件、用户创建的 PDF、Library 与已归档文章、EARTH ONE 账号和应用数据、服务器数据，以及所有未勾选项目。网站数据清除只作用于独立的 Browser Chromium 会话，不影响 EARTH ONE 登录或应用站点存储。</p>
                <p className="mt-2">清除网站数据时，当前 Browser 标签会暂时卸载，清理后再恢复原网址；网页重新加载后可能再次创建新的 Cookie 或站点数据。历史记录也可能因这些恢复导航产生新的访问条目。</p>
              </section>
            </>
          ) : (
            <section role="alertdialog" aria-modal="true" aria-label="确认清除浏览数据" data-browser-privacy-confirmation className="rounded-2xl border border-rose-300/20 bg-rose-950/20 p-5">
              <h3 className="text-base font-semibold text-white">确认清除所选数据？</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">将清除以下项目。{TIME_RANGE_LABELS[timeRange]}仅应用于浏览历史和下载历史记录；其他选中类别按其完整范围清除。</p>
              <ul className="mt-3 space-y-2">
                {selectedCategories.map(key => {
                  const category = categories.find(item => item.key === key)!;
                  return <li key={key} className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2 text-xs text-slate-100"><span className="font-medium">{category.label}</span><span className="mt-1 block text-[11px] text-slate-400">{category.detail}</span></li>;
                })}
              </ul>
              <p className="mt-4 text-[11px] leading-relaxed text-emerald-100/80">下载文件和 PDF、Library、已归档文章、账号/应用数据及未选择项目均会保留。已清除的数据不会上传或同步到服务器。</p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setConfirming(false)} disabled={pending} data-privacy-cancel className="min-h-10 rounded-lg border border-white/10 px-4 text-sm text-slate-200 hover:bg-white/[0.06] disabled:opacity-40">取消</button>
                <button type="button" onClick={() => void handleClear()} disabled={pending || selectedCategories.length === 0} data-privacy-confirm className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-300/25 bg-rose-400/10 px-4 text-sm font-medium text-rose-100 hover:bg-rose-400/[0.18] disabled:cursor-wait disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />{pending ? '正在清除…' : '确认并清除'}
                </button>
              </div>
            </section>
          )}
        </div>

        {!confirming && (
          <footer className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4 sm:px-7">
            <span className="text-[11px] text-slate-500">已选择 {selectedCategories.length} 项</span>
            <button type="button" onClick={() => { setResult(null); setConfirming(true); }} disabled={pending || selectedCategories.length === 0} data-privacy-review className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-300/20 bg-rose-300/[0.07] px-4 text-sm font-medium text-rose-100 transition hover:bg-rose-300/[0.13] disabled:cursor-not-allowed disabled:opacity-40">
              查看并确认清除<ChevronRight className="h-4 w-4" />
            </button>
          </footer>
        )}
      </section>
    </div>
  );
};
