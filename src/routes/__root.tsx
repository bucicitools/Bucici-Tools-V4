import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { registerPWA } from "../lib/pwa";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="neu max-w-md p-10 text-center">
        <h1 className="text-6xl font-bold text-primary">404</h1>
        <p className="mt-4 text-muted-foreground">Halaman tidak ditemukan.</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="neu max-w-md p-10 text-center">
        <h1 className="text-xl font-semibold">Ada gangguan sesaat</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Coba lagi
          </button>
          <a href="/" className="rounded-lg border px-4 py-2 text-sm">
            Beranda
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no",
      },
      { title: "BUCICI · Sobat Dagang" },
      {
        name: "description",
        content:
          "BUCICI — POS multi-tenant, manajemen stok, studio pemasaran AI, dan hitung modal cerdas untuk UMKM.",
      },
      { name: "author", content: "BUCICI" },
      { name: "theme-color", content: "#1874D2" },
      // PWA fullscreen on Android/iOS home-screen launch
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "BUCICI" },
      { name: "application-name", content: "BUCICI" },
      { property: "og:title", content: "BUCICI · Sobat Dagang" },
      {
        property: "og:description",
        content:
          "BUCICI — POS multi-tenant, manajemen stok, studio pemasaran AI, dan hitung modal cerdas untuk UMKM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "BUCICI · Sobat Dagang" },
      {
        name: "twitter:description",
        content:
          "BUCICI — POS multi-tenant, manajemen stok, studio pemasaran AI, dan hitung modal cerdas untuk UMKM.",
      },
      {
        property: "og:image",
        content: "https://hercules-cdn.com/file_Uw5ine2fPJXmSHuofuu4QS0c",
      },
      {
        name: "twitter:image",
        content: "https://hercules-cdn.com/file_Uw5ine2fPJXmSHuofuu4QS0c",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "https://hercules-cdn.com/file_XLZTx2Sp97CGAkNXkVNXQqZk" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "https://hercules-cdn.com/file_XLZTx2Sp97CGAkNXkVNXQqZk" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    registerPWA();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  );
}
