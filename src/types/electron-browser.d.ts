export {};

declare global {
  type EarthOneBrowserConnectionStatus = 'unknown' | 'unencrypted' | 'encrypted' | 'certificate-error';

  interface EarthOneBrowserState {
    tabId: string;
    active: boolean;
    url: string;
    title: string;
    loading: boolean;
    navigated: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    zoomPercent: number;
    connectionStatus: EarthOneBrowserConnectionStatus;
    certificateErrorCode: string | null;
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

  type EarthOneBrowserPrivacyCategory = 'history' | 'bookmarks' | 'downloadRecords' | 'sessionRestore' | 'permissions' | 'siteData';
  type EarthOneBrowserPrivacyTimeRange = 'all' | 'hour' | 'day' | 'week' | 'fourWeeks';

  interface EarthOneBrowserPrivacySelection {
    history: boolean;
    bookmarks: boolean;
    downloadRecords: boolean;
    sessionRestore: boolean;
    permissions: boolean;
    siteData: boolean;
  }

  interface EarthOneBrowserPrivacyCategoryResult {
    success: boolean;
    error?: string;
    cleared?: boolean | number | { history?: number; bookmarks?: number };
    data?: EarthOneLocalBrowserData;
    retainedActive?: number;
    deniedPending?: number;
    reloadedTabs?: number;
    reloadFailedTabs?: string[];
    enabled?: boolean;
  }

  interface EarthOneBrowserPrivacyResult {
    success: boolean;
    changed: boolean;
    skipped?: boolean;
    since?: number;
    timeRange?: EarthOneBrowserPrivacyTimeRange;
    error?: string;
    results: Partial<Record<EarthOneBrowserPrivacyCategory | 'localData', EarthOneBrowserPrivacyCategoryResult>>;
  }

  interface EarthOneBrowserSessionTab {
    id: string;
    url: string;
    title: string;
  }

  interface EarthOneBrowserNewTab {
    tabId: string;
    url: string;
    title: string;
  }

  interface EarthOneBrowserTabClosed {
    tabId: string;
    activeTabId: string | null;
    activeTab: EarthOneBrowserState | null;
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

  type EarthOneBrowserPermission = 'notifications' | 'geolocation';

  interface EarthOneBrowserPermissionPrompt {
    requestId: string;
    origin: string;
    permission: EarthOneBrowserPermission;
  }

  interface EarthOneBrowserPermissionGrant {
    origin: string;
    permissions: EarthOneBrowserPermission[];
  }

  interface EarthOneBrowserPermissionState {
    pending: EarthOneBrowserPermissionPrompt[];
    grants: EarthOneBrowserPermissionGrant[];
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

  interface EarthOneBrowserPrintResult {
    success: boolean;
    cancelled?: boolean;
    error?: string;
  }

  type EarthOneBrowserFindDirection = 'new' | 'next' | 'previous';
  type EarthOneBrowserZoomAction = 'in' | 'out' | 'reset';

  interface EarthOneBrowserFindResult {
    tabId: string;
    requestId: number | null;
    activeMatchOrdinal: number;
    matches: number;
    finalUpdate: boolean;
    cleared?: boolean;
  }

  interface EarthOneBrowserApi {
    getLocalData(): Promise<EarthOneLocalBrowserData>;
    saveLocalData(data: { bookmarks: EarthOneLocalBookmark[]; history: EarthOneLocalHistoryItem[] }): Promise<{ success: boolean; error?: string }>;
    clearBrowsingData(selection: EarthOneBrowserPrivacySelection, timeRange: EarthOneBrowserPrivacyTimeRange): Promise<EarthOneBrowserPrivacyResult>;
    getSessionState(): Promise<EarthOneBrowserSessionState>;
    setSessionEnabled(enabled: boolean): Promise<{ success: boolean; enabled: boolean; error?: string }>;
    restoreSession(): Promise<EarthOneBrowserSessionRestoreResult>;
    getPermissionState(): Promise<EarthOneBrowserPermissionState>;
    resolvePermissionRequest(requestId: string, decision: 'allow' | 'deny'): Promise<{ success: boolean; granted?: boolean; error?: string }>;
    revokePermission(origin: string, permission: EarthOneBrowserPermission): Promise<{ success: boolean }>;
    revokeAllPermissions(): Promise<{ success: boolean; revoked?: boolean }>;
    getDownloads(): Promise<EarthOneBrowserDownload[]>;
    cancelDownload(id: string): Promise<{ success: boolean }>;
    removeDownload(id: string): Promise<{ success: boolean; error?: string }>;
    clearDownloadRecords(): Promise<{ success: boolean; cleared: number; error?: string }>;
    getDownloadStorageStatus(): Promise<EarthOneDownloadStorageStatus>;
    showDownloadInFolder(id: string): Promise<{ success: boolean; error?: string }>;
    printToPdf(): Promise<EarthOneBrowserPrintResult>;
    setActive(active: boolean): Promise<void>;
    setBounds(bounds: EarthOneBrowserBounds | null): Promise<void>;
    getCanRestoreClosedTab(): Promise<boolean>;
    restoreLastClosedTab(): Promise<{ success: boolean; restored?: boolean; tabId?: string; url?: string; error?: string }>;
    reorderTabs(tabIds: string[]): Promise<{ success: boolean; tabIds?: string[]; error?: string }>;
    selectTab(tabId: string, url: string): Promise<{ success: boolean; error?: string }>;
    closeTab(tabId: string): Promise<{ success: boolean; closed: boolean; replaced?: boolean; activeTabId?: string | null }>;
    onNewTab(listener: (tab: EarthOneBrowserNewTab) => void): () => void;
    onTabClosed(listener: (tab: EarthOneBrowserTabClosed) => void): () => void;
    onRestoreAvailability(listener: (available: boolean) => void): () => void;
    navigate(tabId: string, url: string): Promise<{ success: boolean; url?: string; error?: string }>;
    goBack(tabId: string): Promise<void>;
    goForward(tabId: string): Promise<void>;
    reload(tabId: string): Promise<void>;
    changeZoom(action: EarthOneBrowserZoomAction): Promise<{ success: boolean; zoomPercent?: number; error?: string }>;
    findInPage(query: string, direction: EarthOneBrowserFindDirection): Promise<{ success: boolean; error?: string }>;
    stopFindInPage(returnFocus?: boolean): Promise<{ success: boolean; error?: string }>;
    onState(listener: (state: EarthOneBrowserState) => void): () => void;
    onDownloads(listener: (downloads: EarthOneBrowserDownload[], status: EarthOneDownloadStorageStatus) => void): () => void;
    onPermissions(listener: (state: EarthOneBrowserPermissionState) => void): () => void;
    onFocusAddressBar(listener: (tabId: string) => void): () => void;
    onFocusFind(listener: (tabId: string) => void): () => void;
    onFindResult(listener: (result: EarthOneBrowserFindResult) => void): () => void;
  }

  interface EarthOneDesktopNotificationPayload {
    id?: string;
    title?: string;
    body?: string;
    conversationId?: string | null;
    type?: string;
  }

  interface EarthOneDesktopNotificationClick {
    id?: string | null;
    conversationId?: string | null;
    type?: string | null;
  }

  interface EarthOneDesktopApi {
    getNotificationPermission?: () => Promise<{ supported: boolean; permission: string; error?: string }>;
    showNotification?: (payload: EarthOneDesktopNotificationPayload) => Promise<{ ok: boolean; error?: string }>;
    onNotificationClick?: (listener: (data: EarthOneDesktopNotificationClick) => void) => () => void;
  }

  interface Window {
    earthOneBrowser?: EarthOneBrowserApi;
    earthOneDesktop?: EarthOneDesktopApi;
  }
}
