import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { getApiBase } from './apiBase.ts';

const apiBase = getApiBase();
if (apiBase) {
  const origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      if (typeof input === 'string') {
        if (input.startsWith('/api/')) input = apiBase + input;
      } else if (input instanceof URL) {
        if (input.pathname.startsWith('/api/')) input = new URL(apiBase + input.pathname + input.search + input.hash);
      } else if (input instanceof Request) {
        const u = new URL(input.url);
        if (u.origin === window.location.origin && u.pathname.startsWith('/api/')) {
          input = new Request(apiBase + u.pathname + u.search + u.hash, input);
        }
      }
    } catch {}
    return origFetch(input as any, init);
  };
}

createRoot(document.getElementById('root')!).render(<App />);
