// Guarded PWA service-worker registration. Skips Lovable preview / iframes / dev.
export function registerPWA() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  try {
    const inIframe = window.self !== window.top;
    const host = window.location.hostname;
    const isPreview =
      host.startsWith("id-preview--") ||
      host.startsWith("preview--") ||
      host.endsWith(".lovableproject.com") ||
      host.endsWith(".lovableproject-dev.com") ||
      host.endsWith(".beta.lovable.dev") ||
      host === "localhost" ||
      host === "127.0.0.1";
    const disabled = new URLSearchParams(window.location.search).get("sw") === "off";
    if (inIframe || isPreview || disabled || !import.meta.env.PROD) {
      navigator.serviceWorker.getRegistrations?.().then((rs) =>
        rs.forEach((r) => {
          if (r.active?.scriptURL.endsWith("/sw.js")) r.unregister();
        }),
      );
      return;
    }
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  } catch {
    /* noop */
  }
}
