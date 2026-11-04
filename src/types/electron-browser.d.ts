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

  interface EarthOneBrowserDownload {
    id: string;
    filename: string;
    source: string;
    state: 'awaiting-save' | 'progressing' | 'cancelling' | 'completed' | 'cancelled' | 'interrupted';
    receivedBytes: number;
    totalBytes: number;
    progress: number | null;
    savePath: string | null;
    startedAt: string;
  }

  interface EarthOneBrowserApi {
    getLocalData(): Promise<EarthOneLocalBrowserData>;
    saveLocalData(data: { bookmarks: EarthOneLocalBookmark[]; history: EarthOneLocalHistoryItem[] }): Promise<{ success: boolean; error?: string }>;
    getDownloads(): Promise<EarthOneBrowserDownload[]>;
    cancelDownload(id: string): Promise<{ success: boolean }>;
    removeDownload(id: string): Promise<{ success: boolean }>;
    setActive(active: boolean): Promise<void>;
    setBounds(bounds: EarthOneBrowserBounds | null): Promise<void>;
    selectTab(tabId: string, url: string): Promise<{ success: boolean; error?: string }>;
    closeTab(tabId: string): Promise<void>;
    navigate(tabId: string, url: string): Promise<{ success: boolean; url?: string; error?: string }>;
    goBack(tabId: string): Promise<void>;
    goForward(tabId: string): Promise<void>;
    reload(tabId: string): Promise<void>;
    onState(listener: (state: EarthOneBrowserState) => void): () => void;
    onDownloads(listener: (downloads: EarthOneBrowserDownload[]) => void): () => void;
    onFocusAddressBar(listener: (tabId: string) => void): () => void;
  }

  interface Window {
    earthOneBrowser?: EarthOneBrowserApi;
  }
}
