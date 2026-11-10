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
import { Loader2 } from "lucide-react";

import appCss from "../styles.css?url";
import { Toaster } from "../components/ui/sonner";
import { TvRemoteNavigation } from "../components/TvRemoteNavigation";
import { DeviceSelectionModal } from "../components/DeviceSelectionModal";
import { AccountProvider } from "../hooks/use-account";
import { AuthProvider } from "../hooks/use-auth";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { useSettings } from "../hooks/use-settings";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function reportClientError(type: string, err: unknown, route?: string) {
  try {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack || "" : "";
    void fetch("/api/public/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, message, stack, url: window.location.href, route: route || window.location.pathname }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    reportClientError("react_error_boundary", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
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
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "FLOW TV — Seu universo IPTV em qualquer tela" },
      {
        name: "description",
        content:
          "FLOW TV: reproduza canais ao vivo, filmes e séries IPTV com player inteligente, reconexão automática e qualidade adaptativa.",
      },
      { name: "author", content: "FLOW TV" },
      { name: "theme-color", content: "#0c1116" },
      
      // PWA Meta Tags (iPhone / Android Add to Home Screen)
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "FLOW TV" },

      { property: "og:title", content: "FLOW TV — Seu universo IPTV em qualquer tela" },
      {
        property: "og:description",
        content: "Canais ao vivo, filmes e séries com player inteligente e reprodução estável.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "FLOW TV — Seu universo IPTV em qualquer tela" },
      { name: "description", content: "Flow TV Player is an IPTV player for streaming live TV, movies, and series across multiple platforms." },
      { property: "og:description", content: "Flow TV Player is an IPTV player for streaming live TV, movies, and series across multiple platforms." },
      { name: "twitter:description", content: "Flow TV Player is an IPTV player for streaming live TV, movies, and series across multiple platforms." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/dd8e835a-f172-4243-8f3d-b7d062cfb677/id-preview-8f4dd3fb--85bec182-1d0e-4878-bfe3-b7f2842551c4.lovable.app-1781042074854.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/dd8e835a-f172-4243-8f3d-b7d062cfb677/id-preview-8f4dd3fb--85bec182-1d0e-4878-bfe3-b7f2842551c4.lovable.app-1781042074854.png" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Inter:wght400;500;600;700&display=swap",
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "shortcut icon", href: "/favicon.ico" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
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

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <AppInitializer />
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AppInitializer() {
  const { isLoading, settings } = useSettings();

  useEffect(() => {
    const onWindowError = (e: ErrorEvent) => {
      reportClientError("window.onerror", e.error || e.message);
    };
    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      reportClientError("unhandledrejection", e.reason);
    };
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-background">
        {/* Background if available */}
        {settings.background && (
          <div className="pointer-events-none absolute inset-0 z-0">
            <img src={settings.background} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-background/85" />
          </div>
        )}
        
        <div className="relative z-10 flex flex-col items-center gap-4">
          {settings.logo ? (
            <img
              src={settings.logo}
              alt="FLOW TV"
              className="h-16 w-auto max-w-[200px] object-contain"
            />
          ) : (
            <h1 className="font-display text-3xl font-extrabold tracking-tight">
              FLOW<span className="text-gradient">TV</span>
            </h1>
          )}
          
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm">Carregando configurações…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <TvRemoteNavigation />
      <DeviceSelectionModal />
      <Toaster position="top-center" theme="dark" richColors />
    </>
  );
}
