import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { getApiBase } from './apiBase.ts';

const apiBase = getApiBase();
const origFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
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
      return origFetch(nextInput as any, nextInit);
    }
  } catch {}
  return origFetch(input as any, init);
};

createRoot(document.getElementById('root')!).render(<App />);
