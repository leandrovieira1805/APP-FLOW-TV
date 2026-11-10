import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'

console.log("[FLOW TV] Client entry loaded! URL:", window.location.href, "Path:", window.location.pathname);

// If URL ends with /index.html, rewrite history so TanStack Router matches '/'
if (window.location.pathname.endsWith('/index.html')) {
  try {
    const newPath = window.location.pathname.replace(/\/index\.html$/, '/') || '/';
    window.history.replaceState(null, '', newPath + window.location.search + window.location.hash);
    console.log("[FLOW TV] Normalized path from /index.html to:", newPath);
  } catch (e) {
    console.warn("[FLOW TV] Could not replaceState:", e);
  }
}

try {
  startTransition(() => {
    console.log("[FLOW TV] Calling hydrateRoot...");
    const root = hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
      {
        onRecoverableError(error, errorInfo) {
          console.warn("[FLOW TV] onRecoverableError:", error?.message || error, errorInfo);
        },
      }
    );
    console.log("[FLOW TV] hydrateRoot returned root object successfully");
  });
} catch (err) {
  console.error("[FLOW TV] Top-level error in client entry:", err);
}
