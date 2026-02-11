console.log('[DEBUG] main.tsx entry point hit');
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

window.onerror = function (msg, _url, lineNo, columnNo, error) {
  console.error('[CRITICAL ERROR]', msg, 'at', lineNo + ':' + columnNo, error);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = '<div style="padding: 20px; color: red; font-family: sans-serif;"><h1>Startup Error</h1><p>' + msg + '</p></div>';
  }
};

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (e) {
  console.error('[MOUNT ERROR]', e);
}
