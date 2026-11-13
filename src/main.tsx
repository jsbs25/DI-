import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import { getApiBase } from './apiBase.ts';

registerSW({ immediate: true });

const apiBase = getApiBase();
const origFetch = window.fetch.bind(window);
const wrappedFetch: typeof window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    let nextInput: RequestInfo | URL = input;
    let isApi = false;
    if (typeof input === 'string') {
      if (input.startsWith('/api/')) {
        if (apiBase) input = apiBase + input;
        isApi = true;
      } else if (apiBase && input.startsWith(apiBase)) {
        isApi = true;
      }
      nextInput = input;
    } else if (input instanceof URL) {
      if (input.pathname.startsWith('/api/')) {
        if (apiBase) input = new URL(apiBase + input.pathname + input.search + input.hash);
        isApi = true;
      } else if (apiBase && input.origin + input.pathname.startsWith(apiBase)) {
        isApi = true;
      }
      nextInput = input;
    } else if (input instanceof Request) {
      const u = new URL(input.url);
      if (u.pathname.startsWith('/api/')) {
        const target = apiBase ? apiBase + u.pathname + u.search + u.hash : input.url;
        isApi = true;
        nextInput = new Request(target, input);
      } else if (apiBase && u.origin + u.pathname.startsWith(apiBase)) {
        isApi = true;
        nextInput = input;
      } else {
        nextInput = input;
      }
    }
    if (isApi) {
      const nextInit: RequestInit = { ...(init || {}) };
      if (!nextInit.credentials) nextInit.credentials = 'include';
      try {
        const storedToken = window.localStorage.getItem('earth_one_token');
        if (storedToken) {
          const headers = new Headers(nextInit.headers || (input instanceof Request ? input.headers : undefined));
          if (!headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${storedToken}`);
          }
          nextInit.headers = headers;
        }
      } catch {}
      return origFetch(nextInput as any, nextInit);
    }
  } catch {}
  return origFetch(input as any, init);
};

try {
  Object.defineProperty(window, 'fetch', {
    value: wrappedFetch,
    writable: true,
    configurable: true,
  });
} catch {
  // Some browsers or sandboxed iframes mark window.fetch as non-configurable
}

createRoot(document.getElementById('root')!).render(<App />);
