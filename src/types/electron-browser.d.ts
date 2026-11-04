export {};

declare global {
  interface EarthOneBrowserState {
    tabId: string;
    url: string;
    title: string;
    loading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
  }

  interface EarthOneBrowserBounds {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  interface EarthOneBrowserApi {
    setActive(active: boolean): Promise<void>;
    setBounds(bounds: EarthOneBrowserBounds | null): Promise<void>;
    selectTab(tabId: string, url: string): Promise<{ success: boolean; error?: string }>;
    closeTab(tabId: string): Promise<void>;
    navigate(tabId: string, url: string): Promise<{ success: boolean; url?: string; error?: string }>;
    goBack(tabId: string): Promise<void>;
    goForward(tabId: string): Promise<void>;
    reload(tabId: string): Promise<void>;
    onState(listener: (state: EarthOneBrowserState) => void): () => void;
  }

  interface Window {
    earthOneBrowser?: EarthOneBrowserApi;
  }
}
