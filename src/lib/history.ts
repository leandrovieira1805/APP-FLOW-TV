import { supabase, useSupabase } from "./supabase";

function getActiveUserId(): string {
  if (typeof window === "undefined") return "default_user";
  try {
    const raw = localStorage.getItem("flowtv.account");
    if (raw) {
      const acc = JSON.parse(raw);
      if (acc?.username) return String(acc.username).trim().toLowerCase();
    }
  } catch {}
  return "default_user";
}

export interface WatchHistory {
  id: string;
  userId: string;
  contentType: "live" | "movie" | "series";
  contentId: number;
  episodeId: string | null;
  title: string;
  poster: string | null;
  position: number;
  duration: number;
  createdAt: string;
  updatedAt: string;
}

export async function getWatchHistory(limit = 40): Promise<WatchHistory[]> {
  if (useSupabase) {
    try {
      const userId = getActiveUserId();
      const { data, error } = await supabase
        .from("watch_history")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (!error && Array.isArray(data)) {
        return data.map((d: any) => ({
          id: `${d.content_type}:${d.content_id}`,
          userId: d.user_id,
          contentType: d.content_type,
          contentId: Number(d.content_id),
          episodeId: d.episode_id ? String(d.episode_id) : null,
          title: d.title,
          poster: d.poster,
          position: Number(d.position) || 0,
          duration: Number(d.duration) || 0,
          createdAt: d.updated_at,
          updatedAt: d.updated_at,
        }));
      }
    } catch (e) {
      console.warn("Supabase getWatchHistory error:", e);
    }
  }
  return [];
}

export async function saveWatchProgress(
  contentType: "movie" | "series",
  contentId: number,
  title: string,
  poster: string,
  position: number,
  duration: number,
  episodeId?: string
): Promise<WatchHistory | null> {
  const userId = getActiveUserId();
  const numContentId = Number(contentId);
  const finalPos = Math.floor(Math.max(0, position || 0));
  const finalDur = Math.floor(Math.max(0, duration || 0));

  if (useSupabase) {
    try {
      if (contentType === "movie" && finalDur > 0 && finalPos / finalDur > 0.95) {
        await supabase
          .from("watch_history")
          .delete()
          .eq("user_id", userId)
          .eq("content_type", contentType)
          .eq("content_id", numContentId);
        return null;
      }

      const { data, error } = await supabase
        .from("watch_history")
        .upsert(
          {
            user_id: userId,
            content_type: contentType,
            content_id: numContentId,
            episode_id: episodeId ? String(episodeId) : null,
            title,
            poster,
            position: finalPos,
            duration: finalDur,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,content_type,content_id" }
        )
        .select()
        .single();

      if (!error && data) {
        return {
          id: `${data.content_type}:${data.content_id}`,
          userId: data.user_id,
          contentType: data.content_type,
          contentId: Number(data.content_id),
          episodeId: data.episode_id,
          title: data.title,
          poster: data.poster,
          position: Number(data.position) || 0,
          duration: Number(data.duration) || 0,
          createdAt: data.updated_at,
          updatedAt: data.updated_at,
        };
      }
    } catch (e) {
      console.warn("Supabase saveWatchProgress error:", e);
    }
  }
  return null;
}

export async function removeWatchProgress(
  contentType: "movie" | "series",
  contentId: number
): Promise<void> {
  const userId = getActiveUserId();
  if (useSupabase) {
    try {
      await supabase
        .from("watch_history")
        .delete()
        .eq("user_id", userId)
        .eq("content_type", contentType)
        .eq("content_id", Number(contentId));
    } catch (e) {
      console.warn("Supabase removeWatchProgress error:", e);
    }
  }
}
