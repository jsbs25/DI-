export {};

declare global {
  interface EarthOneBrowserState {
    tabId: string;
    url: string;
    title: string;
    loading: boolean;
    navigated: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
  }

  interface EarthOneBrowserBounds {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  interface EarthOneLocalBookmark {
    id: string;
    title: string;
    url: string;
    category: string;
  }

  interface EarthOneLocalHistoryItem {
    id: string;
    tabId: string;
    title: string;
    url: string;
    visitedAt: string;
  }

  interface EarthOneLocalBrowserData {
    initialized: boolean;
    readOnly: boolean;
    bookmarks: EarthOneLocalBookmark[];
    history: EarthOneLocalHistoryItem[];
    warning?: string;
  }

  interface EarthOneBrowserSessionTab {
    id: string;
    url: string;
    title: string;
  }

  interface EarthOneBrowserSessionState {
    enabled: boolean;
    activeTabId: string | null;
    tabs: EarthOneBrowserSessionTab[];
    readOnly: boolean;
    warning?: string | null;
  }

  interface EarthOneBrowserSessionRestoreResult {
    success: boolean;
    activeTabId?: string | null;
    tabs: Array<{ tabId: string; success: boolean; error?: string }>;
    error?: string;
  }

  interface EarthOneBrowserDownload {
    id: string;
    filename: string;
    source: string;
    state: 'awaiting-save' | 'progressing' | 'cancelling' | 'completed' | 'cancelled' | 'interrupted';
    receivedBytes: number;
    totalBytes: number;
    progress: number | null;
    savePath: string | null;
    fileAvailable: boolean;
    startedAt: string;
  }

  interface EarthOneDownloadStorageStatus {
    readOnly: boolean;
    warning: string | null;
  }

  interface EarthOneBrowserApi {
    getLocalData(): Promise<EarthOneLocalBrowserData>;
    saveLocalData(data: { bookmarks: EarthOneLocalBookmark[]; history: EarthOneLocalHistoryItem[] }): Promise<{ success: boolean; error?: string }>;
    getSessionState(): Promise<EarthOneBrowserSessionState>;
    setSessionEnabled(enabled: boolean): Promise<{ success: boolean; enabled: boolean; error?: string }>;
    restoreSession(): Promise<EarthOneBrowserSessionRestoreResult>;
    getDownloads(): Promise<EarthOneBrowserDownload[]>;
    cancelDownload(id: string): Promise<{ success: boolean }>;
    removeDownload(id: string): Promise<{ success: boolean; error?: string }>;
    clearDownloadRecords(): Promise<{ success: boolean; cleared: number; error?: string }>;
    getDownloadStorageStatus(): Promise<EarthOneDownloadStorageStatus>;
    showDownloadInFolder(id: string): Promise<{ success: boolean; error?: string }>;
    setActive(active: boolean): Promise<void>;
    setBounds(bounds: EarthOneBrowserBounds | null): Promise<void>;
    selectTab(tabId: string, url: string): Promise<{ success: boolean; error?: string }>;
    closeTab(tabId: string): Promise<void>;
    navigate(tabId: string, url: string): Promise<{ success: boolean; url?: string; error?: string }>;
    goBack(tabId: string): Promise<void>;
    goForward(tabId: string): Promise<void>;
    reload(tabId: string): Promise<void>;
    onState(listener: (state: EarthOneBrowserState) => void): () => void;
    onDownloads(listener: (downloads: EarthOneBrowserDownload[], status: EarthOneDownloadStorageStatus) => void): () => void;
    onFocusAddressBar(listener: (tabId: string) => void): () => void;
  }

  interface Window {
    earthOneBrowser?: EarthOneBrowserApi;
  }
}
