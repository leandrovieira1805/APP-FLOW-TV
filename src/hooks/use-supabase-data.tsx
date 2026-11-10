import { useSupabase } from "../lib/supabase";
import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { getCurrentUser } from "../lib/auth";
import { getAuthTokens } from "../lib/api";
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  type Favorite,
} from "../lib/favorites";
import {
  getWatchHistory,
  saveWatchProgress,
  removeWatchProgress,
  type WatchHistory,
} from "../lib/history";
import { getAppSettings, saveAppSettings, type AppSetting } from "../lib/settings";

const FAV_STORAGE_KEY = "flowtv_favorites";
const HISTORY_STORAGE_KEY = "flowtv_watch_history";

function loadLocalFavorites(): Favorite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FAV_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveLocalFavorites(favs: Favorite[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(favs.slice(0, 200))); } catch {}
}

function loadLocalHistory(): WatchHistory[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveLocalHistory(list: WatchHistory[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list.slice(0, 40))); } catch {}
}

export function useFavorites() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const currentTokens = getAuthTokens();
  const currentUser = user || getCurrentUser();
  const useBackend = useSupabase || !!(currentUser || currentTokens?.accessToken);

  const { data: favorites = [], isLoading } = useQuery<Favorite[]>({
    queryKey: ["favorites", currentUser?.id ?? "local"],
    queryFn: async () => {
      if (useBackend) {
        try {
          const remoteFavs = await getFavorites();
          // Auto-migrate any local favorites to remote backend
          const local = loadLocalFavorites();
          if (local.length > 0) {
            const missing = local.filter(
              (l) => !remoteFavs.some((r) => r.contentType === l.contentType && Number(r.contentId) === Number(l.contentId))
            );
            if (missing.length > 0) {
              for (const item of missing) {
                await addFavorite(item.contentType, Number(item.contentId), item.title, item.poster || "").catch(() => {});
              }
              saveLocalFavorites([]);
              return await getFavorites();
            } else {
              saveLocalFavorites([]);
            }
          }
          return remoteFavs;
        } catch {
          return loadLocalFavorites();
        }
      }
      return loadLocalFavorites();
    },
    enabled: true,
    staleTime: 10_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });

  const addFavoriteMutation = useMutation({
    mutationFn: async ({
      contentType, contentId, title, poster,
    }: {
      contentType: "live" | "movie" | "series";
      contentId: number;
      title: string;
      poster: string;
    }) => {
      const activeTokens = getAuthTokens();
      if (useBackend || activeTokens?.accessToken) {
        return addFavorite(contentType, Number(contentId), title, poster);
      }
      const list = loadLocalFavorites();
      const newFav: Favorite = {
        id: `${contentType}:${contentId}`,
        userId: "local",
        contentType,
        contentId: Number(contentId),
        title,
        poster,
        createdAt: new Date().toISOString(),
      };
      list.unshift(newFav);
      saveLocalFavorites(list);
      return newFav;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  const removeFavoriteMutation = useMutation({
    mutationFn: async ({
      contentType, contentId,
    }: {
      contentType: "live" | "movie" | "series";
      contentId: number;
    }) => {
      const activeTokens = getAuthTokens();
      if (useBackend || activeTokens?.accessToken) {
        return removeFavorite(contentType, Number(contentId));
      }
      const list = loadLocalFavorites().filter(
        (f) => !(f.contentType === contentType && Number(f.contentId) === Number(contentId))
      );
      saveLocalFavorites(list);
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  return {
    favorites,
    isLoading,
    addFavorite: addFavoriteMutation.mutate,
    removeFavorite: removeFavoriteMutation.mutate,
  };
}

export function useWatchHistory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const currentTokens = getAuthTokens();
  const currentUser = user || getCurrentUser();
  const useBackend = !!(currentUser || currentTokens?.accessToken);

  const { data: history = [], isLoading } = useQuery<WatchHistory[]>({
    queryKey: ["watchHistory", currentUser?.id ?? "local"],
    queryFn: async () => {
      if (useBackend) {
        try {
          const remoteHistory = await getWatchHistory();
          // Auto-migrate any local history saved before login or while offline
          const local = loadLocalHistory();
          if (local.length > 0) {
            const missing = local.filter(
              (l) => !remoteHistory.some((r) => r.contentType === l.contentType && Number(r.contentId) === Number(l.contentId))
            );
            if (missing.length > 0) {
              for (const item of missing) {
                await saveWatchProgress(
                  item.contentType,
                  Number(item.contentId),
                  item.title,
                  item.poster || "",
                  item.position,
                  item.duration,
                  item.episodeId || undefined
                ).catch(() => {});
              }
              saveLocalHistory([]);
              return await getWatchHistory();
            } else {
              saveLocalHistory([]);
            }
          }
          return remoteHistory;
        } catch (e) {
          console.warn("Failed to fetch remote history, falling back to local:", e);
          return loadLocalHistory();
        }
      }
      return loadLocalHistory();
    },
    enabled: true,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchInterval: 15_000,
  });

  const saveProgress = useCallback((data: {
    contentType: "movie" | "series";
    contentId: number;
    title: string;
    poster: string;
    position: number;
    duration: number;
    episodeId?: string;
    _invalidate?: boolean;
  }) => {
    const numContentId = Number(data.contentId);
    // Preserva a duração original caso a duração atual venha 0 ou menor
    const existingItem = history.find(
      (h) => h.contentType === data.contentType && Number(h.contentId) === numContentId
    );
    const finalDuration = (data.duration && data.duration > 0) ? data.duration : (existingItem?.duration || 0);

    const activeTokens = getAuthTokens();
    const canUseBackend = useBackend || !!activeTokens?.accessToken;

    if (canUseBackend) {
      saveWatchProgress(
        data.contentType, numContentId, data.title, data.poster,
        data.position, finalDuration, data.episodeId
      ).then(() => {
        if (data._invalidate) {
          queryClient.invalidateQueries({ queryKey: ["watchHistory"] });
        }
      }).catch((err) => {
        console.warn("saveWatchProgress remote failed, saving locally:", err);
        const list = loadLocalHistory().filter(
          (h) => !(h.contentType === data.contentType && Number(h.contentId) === numContentId)
        );
        const entry: WatchHistory = {
          id: `${data.contentType}:${numContentId}`,
          userId: "local",
          contentType: data.contentType,
          contentId: numContentId,
          episodeId: data.episodeId ?? null,
          title: data.title,
          poster: data.poster,
          position: Math.floor(data.position),
          duration: Math.floor(finalDuration),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        list.unshift(entry);
        saveLocalHistory(list);
      });
    } else {
      const list = loadLocalHistory().filter(
        (h) => !(h.contentType === data.contentType && Number(h.contentId) === numContentId)
      );
      const entry: WatchHistory = {
        id: `${data.contentType}:${numContentId}`,
        userId: "local",
        contentType: data.contentType,
        contentId: numContentId,
        episodeId: data.episodeId ?? null,
        title: data.title,
        poster: data.poster,
        position: Math.floor(data.position),
        duration: Math.floor(finalDuration),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      list.unshift(entry);
      saveLocalHistory(list);
      if (data._invalidate) {
        queryClient.invalidateQueries({ queryKey: ["watchHistory"] });
      }
    }
  }, [useBackend, queryClient, history]);

  const removeProgressMutation = useMutation({
    mutationFn: async ({
      contentType, contentId,
    }: {
      contentType: "movie" | "series";
      contentId: number;
    }) => {
      const activeTokens = getAuthTokens();
      if (useBackend || activeTokens?.accessToken) {
        return removeWatchProgress(contentType, Number(contentId));
      }
      const list = loadLocalHistory().filter(
        (h) => !(h.contentType === contentType && Number(h.contentId) === Number(contentId))
      );
      saveLocalHistory(list);
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchHistory"] });
    },
  });

  return {
    history,
    isLoading,
    saveProgress,
    removeProgress: removeProgressMutation.mutate,
  };
}

export function useAppSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const currentUser = user || getCurrentUser();

  const { data: settings = null, isLoading } = useQuery<AppSetting | null>({
    queryKey: ["appSettings", currentUser?.id],
    queryFn: () => (currentUser ? getAppSettings() : null),
    enabled: !!currentUser,
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (newSettings: any) => {
      if (!currentUser) return null;
      return saveAppSettings(newSettings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appSettings"] });
    },
  });

  return {
    settings,
    isLoading,
    saveSettings: saveSettingsMutation.mutate,
  };
}
