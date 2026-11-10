import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { loadSettings, saveSettings, type AppSettings, SETTINGS_EVENT } from "../lib/storage";
import { getConfig } from "../lib/config.functions";

/**
 * Global app appearance settings (logo, background, banner, DNS list).
 * Stored server-side so every user sees the same branding configured by the
 * admin. localStorage is used only as an instant-render cache.
 */
export function useSettings(): { settings: AppSettings; isLoading: boolean } {
  const queryClient = useQueryClient();

  const { data } = useQuery<AppSettings>({
    queryKey: ["app-config"],
    staleTime: 30 * 60 * 1000, // 30 minutos
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async () => {
      try {
        const cfg = await getConfig();
        const next: AppSettings = {
          logo: cfg.logo ?? undefined,
          background: cfg.background ?? undefined,
          banner: cfg.banner ?? undefined,
          bannerLink: cfg.bannerLink ?? undefined,
          banners: Array.isArray(cfg.banners) ? cfg.banners : undefined,
          dnsList: cfg.dnsList || [],
          paymentInfo: cfg.paymentInfo,
          paymentStatus: cfg.paymentStatus,
        };
        saveSettings(next);
        return next;
      } catch {
        return loadSettings();
      }
    },
  });

  // Listen for settings updates from the admin page
  useEffect(() => {
    const handleSettingsUpdate = () => {
      const newLocalSettings = loadSettings();
      queryClient.setQueryData(["app-config"], newLocalSettings);
    };

    if (typeof window !== "undefined") {
      window.addEventListener(SETTINGS_EVENT, handleSettingsUpdate);
      return () => window.removeEventListener(SETTINGS_EVENT, handleSettingsUpdate);
    }
  }, [queryClient]);

  const currentSettings = data || loadSettings();

  return {
    settings: currentSettings,
    isLoading: false,
  };
}
