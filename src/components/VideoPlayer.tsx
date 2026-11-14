import { useCallback, useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef, type ReactNode } from "react";
import { useIsMobile } from "../hooks/use-mobile";
import type Hls from "hls.js";

function buildFallbackHlsUrl(targetUrl: string): string {
  let hlsUrl = targetUrl;
  try {
    const parsed = new URL(targetUrl, window.location.origin);
    const rawUrl = parsed.searchParams.get("url");
    if (rawUrl) {
      const hlsTarget = rawUrl.replace(/\.(mkv|mp4|avi|ts|flv|webm)($|\?)/i, ".m3u8$2");
      hlsUrl = `/api/public/stream?url=${encodeURIComponent(hlsTarget)}&ext=.m3u8`;
    } else if (!targetUrl.includes("ext=.m3u8")) {
      hlsUrl = targetUrl + (targetUrl.includes("?") ? "&ext=.m3u8" : "?ext=.m3u8");
    }
  } catch {
    if (!targetUrl.includes("ext=.m3u8")) {
      hlsUrl = targetUrl + (targetUrl.includes("?") ? "&ext=.m3u8" : "?ext=.m3u8");
    }
  }
  return hlsUrl;
}

function buildTranscodeUrl(targetUrl: string): string {
  try {
    const parsed = new URL(targetUrl, window.location.origin);
    const rawUrl = parsed.searchParams.get("url");
    if (rawUrl) return `/api/public/transcode.m3u8?url=${encodeURIComponent(rawUrl)}`;
  } catch {
    /* ignore */
  }
  return `/api/public/transcode.m3u8?url=${encodeURIComponent(targetUrl)}`;
}

function reportClientError(type: string, message: string) {
  try {
    fetch("/api/public/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, message, url: window.location.href }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  SkipForward,
  SkipBack,
  Loader2,
  RotateCcw,
  ArrowLeft,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

export interface PlayerSource {
  url: string;
  isLive?: boolean;
}

interface VideoPlayerProps {
  knownDuration?: number;
  source: PlayerSource;
  title?: string;
  subtitle?: string;
  poster?: string;
  startPosition?: number;
  autoPlay?: boolean;
  /** On web, automatically enter browser fullscreen as soon as the player opens. */
  autoFullscreen?: boolean;
  onProgress?: (position: number, duration: number) => void;
  onPause?: (position: number, duration: number) => void;
  onEnded?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  onPrev?: () => void;
  prevLabel?: string;
  /** Native playlist (channels/episodes) — enables in-player prev/next switching. */
  playlist?: Array<{ url: string; title?: string; smallTitle?: string }>;
  /** Fired on native playlist item change with the new index. */
  onPlaylistIndex?: (index: number) => void;
  /** When true the native playlist loops around (channels). */
  loopPlaylist?: boolean;
  /** Index of the current item within `playlist` (native start item). */
  playlistStartIndex?: number;
  /** Increment to force the native player to (re)initialize on a new selection. */
  forceReinit?: number;
  /** When true, playback auto-enters fullscreen + landscape on mobile/devices. */
  lockLandscape?: boolean;
  onExitFullscreen?: () => void;
}

export interface VideoPlayerHandle {
  requestFullscreen: () => void;
}

interface TrackOption {
  id: number;
  label: string;
  height?: number;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const QUALITY_PREF_KEY = "flowtv:quality";

// Map a stream height to a friendly streaming-style label.
function qualityLabel(height?: number, bitrate?: number): string {
  const h = height || 0;
  if (h >= 2160) return "4K";
  if (h >= 1440) return "2K";
  if (h >= 1080) return "Full HD 1080p";
  if (h >= 720) return "HD 720p";
  if (h > 0) return "SD 480p";
  const kbps = Math.round((bitrate || 0) / 1000);
  return kbps ? `${kbps}kbps` : "Auto";
}

// Short badge label (e.g. "1080p", "4K") for the on-screen indicator.
function shortQuality(height?: number): string {
  const h = height || 0;
  if (h >= 2160) return "4K";
  if (h >= 1440) return "2K";
  if (h >= 1080) return "1080p";
  if (h >= 720) return "720p";
  if (h > 0) return "480p";
  return "";
}


function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? h + ":" : ""}${mm}:${String(sec).padStart(2, "0")}`;
}


const isIOS = typeof navigator !== "undefined" && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
);

function safeRequestFullscreen(el: HTMLElement | null, v: HTMLVideoElement | null) {
  try {
    if (!el && !v) return;
    // No iPhone / iOS Safari, acionar diretamente o player nativo AVPlayer da Apple
    if (v && typeof (v as any).webkitEnterFullscreen === "function" && isIOS) {
      try {
        (v as any).webkitEnterFullscreen();
        return;
      } catch (e) {}
    }
    if (el && typeof el.requestFullscreen === "function") {
      el.requestFullscreen().catch(() => {
        if (v && typeof (v as any).webkitEnterFullscreen === "function") {
          try { (v as any).webkitEnterFullscreen(); } catch (e) {}
        }
      });
    } else if (v && typeof (v as any).webkitEnterFullscreen === "function") {
      (v as any).webkitEnterFullscreen();
    } else if (el && typeof (el as any).webkitRequestFullscreen === "function") {
      (el as any).webkitRequestFullscreen();
    } else if (el && typeof (el as any).mozRequestFullScreen === "function") {
      (el as any).mozRequestFullScreen();
    } else if (el && typeof (el as any).msRequestFullscreen === "function") {
      (el as any).msRequestFullscreen();
    }
  } catch (_) {}
}

function safeExitFullscreen() {
  try {
    if (typeof document !== "undefined" && document.fullscreenElement) {
      if (typeof document.exitFullscreen === "function") {
        document.exitFullscreen().catch(() => {});
      } else if (typeof (document as any).webkitExitFullscreen === "function") {
        (document as any).webkitExitFullscreen();
      } else if (typeof (document as any).mozCancelFullScreen === "function") {
        (document as any).mozCancelFullScreen();
      }
    }
  } catch (_) {}
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer({
  source,
  title,
  subtitle,
  poster,
  startPosition = 0,
  autoPlay = true,
  onProgress,
  onPause,
  onEnded,
  onNext,
  nextLabel,
  onPrev,
  prevLabel,
  autoFullscreen,
  playlist,
  onPlaylistIndex,
  loopPlaylist,
  playlistStartIndex,
  knownDuration,
  forceReinit,
  lockLandscape,
  onExitFullscreen,
}, ref) {
  const isMobile = useIsMobile();

  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onPauseRef = useRef(onPause);
  onPauseRef.current = onPause;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;
  const onPrevRef = useRef(onPrev);
  onPrevRef.current = onPrev;
  const onExitFullscreenRef = useRef(onExitFullscreen);
  onExitFullscreenRef.current = onExitFullscreen;
  const onPlaylistIndexRef = useRef(onPlaylistIndex);
  onPlaylistIndexRef.current = onPlaylistIndex;
  const lastNativeTimeRef = useRef(0);
  const lastNativeDurRef = useRef(0);

  // Native re-init key: the playlist list (channels/episodes), or the source URL
  // when there is no playlist. Changing `selected`/`current` in the route does NOT
  // change this key, so the native player keeps playing while switching internally.
  const playlistKey = useMemo(
    () => (playlist && playlist.length > 1 ? playlist.map((i) => i.url).join("\u0001") : source.url),
    [playlist, source.url],
  );
  useImperativeHandle(ref, () => ({
    requestFullscreen: () => {
      setFullscreen(true);
      if (Capacitor.isNativePlatform()) {
        forceLandscape();
      } else {
        const el = containerRef.current;
        if (!document.fullscreenElement) { safeRequestFullscreen(el, videoRef.current); }
      }
    },
  }));

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  // Ref to hold current finalUrl for event handlers (like onError)
  const currentUrlRef = useRef<string>("");
  // Flag to suppress the native <video> onError when hls.js already handled it
  const hlsHandledError = useRef(false);
  // Retry counter for native (non-HLS) playback errors
  const nativeRetryCount = useRef(0);
  const nativeRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcodeTriedRef = useRef(false);
  // Ref to re-launch the native ExoPlayer from outside the setup effect (retry/replay)
  const startNativePlayRef = useRef<(() => void) | null>(null);

  const [playing, setPlaying] = useState(false);
  // Keep playingRef in sync
  // (assigned below after menu state to avoid use-before-define — see syncRefs effect)
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [probedDuration, setProbedDuration] = useState(0);
  
  // Auto-probe real media duration if knownDuration is 0 / missing
  useEffect(() => {
    if (source.isLive || (knownDuration && knownDuration > 0)) return;
    const targetUrl = source.url;
    if (!targetUrl) return;

    let probeUrl = targetUrl;
    try {
      const parsed = new URL(targetUrl, window.location.origin);
      const raw = parsed.searchParams.get("url");
      if (raw) probeUrl = raw;
    } catch {}

    if (!probeUrl.startsWith("http")) return;

    fetch(`/api/public/duration?url=${encodeURIComponent(probeUrl)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data.duration === "number" && data.duration > 0) {
          setProbedDuration(data.duration);
        }
      })
      .catch(() => {});
  }, [source.url, source.isLive, knownDuration]);

  const effectiveDurationRef = useRef(0);
  const effectiveDuration = useMemo(() => {
    const res = (knownDuration && Number.isFinite(knownDuration) && knownDuration > 0)
      ? knownDuration
      : (probedDuration && Number.isFinite(probedDuration) && probedDuration > 0)
        ? probedDuration
        : (Number.isFinite(duration) && duration > 0)
          ? duration
          : 0;
    effectiveDurationRef.current = res;
    return res;
  }, [duration, knownDuration, probedDuration]);

  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(!Capacitor.isNativePlatform() || !!source.isLive);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [offline, setOffline] = useState(false);

  const [menu, setMenu] = useState<null | "main" | "quality" | "audio" | "subs" | "speed">(null);

  // Refs to avoid stale closures without adding state to useCallback deps
  const playingRef = useRef(false);
  const menuRef = useRef<null | "main" | "quality" | "audio" | "subs" | "speed">(null);
  const [levels, setLevels] = useState<TrackOption[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1); // -1 = auto
  const [activeHeight, setActiveHeight] = useState(0); // resolution actually playing
  const [audioTracks, setAudioTracks] = useState<TrackOption[]>([]);
  const [currentAudio, setCurrentAudio] = useState(-1);
  const [subTracks, setSubTracks] = useState<TrackOption[]>([]);
  const [currentSub, setCurrentSub] = useState(-1); // -1 = off
  const [speed, setSpeed] = useState(1);
  const [fitMode, setFitMode] = useState<"contain" | "fill">(
    () => (typeof localStorage !== "undefined" && (localStorage.getItem("flowtv:fit") as any)) || "contain"
  );

  const isNativePlatform = Capacitor.isNativePlatform();
  const [useNativePlayer, setUseNativePlayer] = useState(isNativePlatform);

  const startProgressRef = useRef(startPosition);
  startProgressRef.current = startPosition;

  const nativePlayerPluginRef = useRef<any>(null);
  const isNativeActiveRef = useRef(false);
  const activeNativeUrlRef = useRef('');

  // ---- setup playback ----
  useEffect(() => {
    let cancelled = false;
    let finalUrl = source.url;
    if (window.location.protocol === "http:" && finalUrl.startsWith("https://")) {
      finalUrl = finalUrl.replace(/^https:\/\//i, "http://");
    }
    currentUrlRef.current = finalUrl;

    // NATIVE APK EXO-PLAYER INTERCEPT
    // For VOD (Movies & Series), launch native ExoPlayer in fullscreen.
    // For Live TV, run in WebView so it plays in the mini-player (small screen) and expands to fullscreen on request.
    if (Capacitor.isNativePlatform() && !source.isLive) {
      let nativePlayerPlugin: any = null;
      let nativeListenerPlay: any = null;
      let nativeListenerPause: any = null;
      let nativeListenerEnded: any = null;
      let nativeListenerExit: any = null;
      let nativeListenerIndex: any = null;
      let pollTimer: any = null;

      const playNative = async () => {
        try {
          if (!finalUrl?.trim()) return;
          if (isNativeActiveRef.current && activeNativeUrlRef.current === finalUrl) {
            console.log("Native ExoPlayer is already active for this URL, skipping re-init");
            return;
          }
          setLoading(true);
          setError(null);
          const { CapacitorVideoPlayer } = await import("capacitor-video-player");
          nativePlayerPlugin = CapacitorVideoPlayer;
          nativePlayerPluginRef.current = CapacitorVideoPlayer;

          if (!finalUrl?.trim()) {
            setLoading(false);
            setError("URL do vídeo não encontrada para o player nativo.");
            return;
          }

          // No APK nativo (ExoPlayer), conectar DIRETO ao servidor de streaming upstream.
          // O ExoPlayer nativo não tem restrição de CORS e aproveita aceleração gráfica de hardware da TV/celular.
          const appOrigin = (() => {
            try {
              return new URL(window.location.href).origin;
            } catch {
              return window.location.origin;
            }
          })();

          function getDirectNativeUrl(targetUrl: string): string {
            if (!targetUrl) return "";
            try {
              const parsed = new URL(targetUrl, window.location.origin);
              // No APK nativo, desempacota para a URL direta do provedor de IPTV (sem delay de VPS)
              const raw = parsed.searchParams.get("url");
              if (raw && /^https?:\/\//i.test(raw)) {
                return raw;
              }
              if (/^https?:\/\//i.test(targetUrl) && !targetUrl.includes("/api/public/")) {
                return targetUrl;
              }
              return new URL(targetUrl, appOrigin).toString();
            } catch {
              return targetUrl;
            }
          }

          const absoluteNativeUrl = getDirectNativeUrl(finalUrl);

          // Headers padrão de IPTV amplamente compatíveis com todos os servidores Xtream/XUI
          const nativeHeaders: Record<string, string> = {
            "User-Agent": "IPTVSmartersPlayer/1.0.0 (Linux; Android 10)",
            "Accept": "*/*",
            "Connection": "keep-alive",
          };

          let lastKnownTime = 0;
          let lastKnownDuration = 0;

          nativeListenerPlay = await (CapacitorVideoPlayer as any).addListener(
            "jeepCapVideoPlayerPlay",
            (data: any) => {
              setLoading(false);
              setPlaying(true);
              const pos = data?.currentTime ?? data?.value ?? 0;
              const dur = data?.duration ?? 0;
              if (pos > 0) lastKnownTime = pos;
              if (dur > 0) lastKnownDuration = dur;
              if (pos > 0 && onProgressRef.current) {
                onProgressRef.current(pos, dur);
              }
            }
          );

          nativeListenerPause = await (CapacitorVideoPlayer as any).addListener(
            "jeepCapVideoPlayerPause",
            (data: any) => {
              // Ignore transient micro-buffering pauses in ExoPlayer to prevent re-render loops
              const pos = data?.currentTime ?? data?.value ?? lastKnownTime;
              const dur = data?.duration ?? lastKnownDuration;
              if (pos > 0 && onProgressRef.current) {
                onProgressRef.current(pos, dur);
              }
            }
          );

          nativeListenerEnded = await (CapacitorVideoPlayer as any).addListener(
            "jeepCapVideoPlayerEnded",
            () => {
              setPlaying(false);
              setLoading(false);
              onEndedRef.current?.();
            }
          );

          nativeListenerExit = await (CapacitorVideoPlayer as any).addListener(
            "jeepCapVideoPlayerExit",
            (data: any) => {
              setPlaying(false);
              const pos = data?.currentTime ?? data?.value ?? lastKnownTime;
              const dur = data?.duration ?? lastKnownDuration;
              if (onPauseRef.current) {
                onPauseRef.current(pos, dur);
              }
              restoreOrientation();
              setFullscreen(false);
              if (onExitFullscreenRef.current) {
                onExitFullscreenRef.current();
              }
              // Sem onExitFullscreen (canais ao vivo): volta apenas ao estado
              // normal da página — sem player web, sem navegação automática.
            }
          );

          let _initIndexReceived = false;

          nativeListenerIndex = await (CapacitorVideoPlayer as any).addListener(
            "jeepCapVideoPlayerPlaylistIndex",
            (data: any) => {
              const idx = Number(data?.index ?? -1);
              if (idx < 0) return;
              if (!_initIndexReceived) {
                _initIndexReceived = true;
                const expectedInitIdx = (typeof playlistStartIndex === "number" && playlistStartIndex >= 0) ? playlistStartIndex : 0;
                if (idx === expectedInitIdx) return;
              }
              if (onPlaylistIndexRef.current) {
                onPlaylistIndexRef.current(idx);
              }
            }
          );

          const nativePlaylist =
            playlist && playlist.length > 1
              ? playlist.map((it) => ({
                  url: getDirectNativeUrl(it.url),
                  title: it.title || title || "FLOW TV",
                  smallTitle: it.smallTitle || subtitle || "",
                }))
              : undefined;

          const sIdx = (typeof playlistStartIndex === "number" && playlistStartIndex >= 0) ? playlistStartIndex : 0;
          const currentItem = nativePlaylist && nativePlaylist[sIdx] ? nativePlaylist[sIdx] : null;

          const result = await CapacitorVideoPlayer.initPlayer({
            mode: "fullscreen",
            url: currentItem?.url || absoluteNativeUrl,
            playerId: "fullscreen",
            componentTag: "div",
            title: currentItem?.title || title || "FLOW TV",
            smallTitle: currentItem?.smallTitle || subtitle || "",
            headers: nativeHeaders,
            showControls: true,
            exitOnEnd: false,
            loopOnEnd: false,
            pipEnabled: false,
            chromecast: false,
            bkpNavigation: true,
            playlist: nativePlaylist,
            loopPlaylist: !!loopPlaylist,
            startTime: startProgressRef.current > 0 ? Math.floor(startProgressRef.current) : 0,
            startIndex: sIdx,
            isLive: !!source.isLive,
          });

          if (result && result.result) {
            setLoading(false);
            setPlaying(true);
            isNativeActiveRef.current = true;
            activeNativeUrlRef.current = finalUrl;
            // Native playback does not emit continuous progress; poll the plugin
            // periodically so progress/resume is saved while watching.
            if (pollTimer) clearInterval(pollTimer);
            // Only poll position for VOD (Movies/Series) where progress saving is needed.
            // Skipping bridge polling on Live streams eliminates CPU spikes and bridge lockups on TVs/Mobile.
            if (!source.isLive) {
              pollTimer = setInterval(async () => {
                const p = nativePlayerPluginRef.current;
                if (!p) return;
                try {
                  const t = await p.getCurrentTime({ playerId: "fullscreen" });
                  const d = await p.getDuration({ playerId: "fullscreen" });
                  const pos = Number(t?.value ?? t?.currentTime ?? 0);
                  const dur = Number(d?.value ?? d?.currentTime ?? 0);
                  if (pos > 0) {
                    lastKnownTime = pos;
                    lastKnownDuration = dur;
                    lastNativeTimeRef.current = pos;
                    lastNativeDurRef.current = dur;
                    if (onProgressRef.current) {
                      onProgressRef.current(pos, dur);
                    }
                  }
                } catch {
                  /* ignore */
                }
              }, 2000);
            }
          } else {
            // Diagnostics: captures the plugin's exact failure reason (e.g.
            // "FrameLayout for ExoPlayer already exists") to the client log.
            setLoading(false);
            const reason = (result && (result.message || result.error)) || JSON.stringify(result) || "unknown";
            console.error("Native initPlayer returned false:", result);
            try {
              void fetch("/api/public/client-error", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "native_init_failed",
                  message: `initPlayer false: ${reason}`,
                  stack: (finalUrl || "").slice(0, 200),
                  url: window.location.href,
                  route: window.location.pathname,
                }),
              }).catch(() => {});
            } catch {}
          }
        } catch (e: any) {
          console.error("Native ExoPlayer error:", e);
          setLoading(false);
          const msg = (e && (e.message || (e).error)) || String(e) || "Erro desconhecido";
          setError(`NÃ£o foi possÃ­vel reproduzir no player nativo. ${msg}`);
        }
      };

      playNative();
      startNativePlayRef.current = playNative;

      return () => {
        cancelled = true;
        startNativePlayRef.current = null;
        if (pollTimer) clearInterval(pollTimer);
        try {
          nativeListenerPlay?.remove?.();
          nativeListenerPause?.remove?.();
          nativeListenerEnded?.remove?.();
          nativeListenerExit?.remove?.();
          nativeListenerIndex?.remove?.();
          nativePlayerPlugin?.stopAllPlayers?.().catch(() => {});
        } catch {}
      };
    }

    // Web player path — requires the <video> element (only rendered outside the APK).
    const video = videoRef.current;
    if (!video) return;

    setError(null);
    setLoading(true);
    hlsHandledError.current = false;
    nativeRetryCount.current = 0;
    transcodeTriedRef.current = false;
    if (nativeRetryTimer.current) clearTimeout(nativeRetryTimer.current);

    const isHls = /\.m3u8($|\?)/i.test(finalUrl) || !!source.isLive || finalUrl.includes("/api/public/transcode");

    const seekToStart = () => {
      if (startProgressRef.current > 0 && !source.isLive) {
        try {
          video.currentTime = startProgressRef.current;
        } catch {
          /* ignore */
        }
      }
    };

    async function setup() {
      if (isHls) {
        const HlsMod = (await import("hls.js")).default;
        if (cancelled) return;
        if (HlsMod.isSupported()) {
          // Create a custom loader to reliably rewrite all playlist and chunk URLs 
          // from https:// to http:// if we are running the app on HTTP.
          class CustomLoader extends HlsMod.DefaultConfig.loader {
            constructor(config: any) {
              super(config);
              const load = this.load.bind(this);
              this.load = (context: any, config: any, callbacks: any) => {
                if (window.location.protocol === "http:" && context.url.startsWith("https://")) {
                  context.url = context.url.replace(/^https:\/\//i, "http://");
                }
                load(context, config, callbacks);
              };
            }
          }

          const live = !!source.isLive;
          const hls = new HlsMod({
            pLoader: CustomLoader as any,
            fLoader: CustomLoader as any,
            enableWorker: true,
            startFragPrefetch: true,
            // IPTV streams often have high jitter and slow segment delivery.
            // We increase buffer lengths to ride out network instability.
            maxBufferLength: live ? 30 : 60,
            maxMaxBufferLength: live ? 60 : 120,
            backBufferLength: live ? 20 : 30,
            liveSyncDurationCount: 4,
            liveMaxLatencyDurationCount: 8,
            maxBufferSize: 60 * 1000 * 1000,
            
            // Be more tolerant to missing segments (common in IPTV)
            maxBufferHole: 3.5,
            highBufferWatchdogPeriod: 2,
            
            // Adaptive bitrate based on measured bandwidth.
            abrEwmaDefaultEstimate: 2_500_000,
            startLevel: -1,
            
            lowLatencyMode: false,
            
            // Robust recovery with longer timeouts for slow servers
            fragLoadingMaxRetry: 10,
            manifestLoadingMaxRetry: 10,
            levelLoadingMaxRetry: 10,
            fragLoadingRetryDelay: 1000,
            fragLoadingTimeOut: 30000,
            manifestLoadingTimeOut: 30000,
          });

          hlsRef.current = hls;
          hls.loadSource(finalUrl);
          hls.attachMedia(video!);

          hls.on(HlsMod.Events.MANIFEST_PARSED, () => {
            setLevels(
              hls.levels.map((l, i) => ({
                id: i,
                label: qualityLabel(l.height, l.bitrate),
                height: l.height,
              })),
            );
            // Apply saved quality preference (match by resolution height).
            try {
              const pref = localStorage.getItem(QUALITY_PREF_KEY);
              if (pref && pref !== "auto") {
                const idx = hls.levels.findIndex((l) => l.height === Number(pref));
                if (idx >= 0) {
                  hls.currentLevel = idx;
                  setCurrentLevel(idx);
                }
              }
            } catch {
              /* ignore */
            }
            setLoading(false);
            seekToStart();
            if (autoPlay) video!.play().catch(() => setPlaying(false));
          });
          hls.on(HlsMod.Events.LEVEL_SWITCHED, (_e, d) => {
            setCurrentLevel(hls.autoLevelEnabled ? -1 : d.level);
            setActiveHeight(hls.levels[d.level]?.height || 0);
          });
          hls.on(HlsMod.Events.AUDIO_TRACKS_UPDATED, () => {
            setAudioTracks(hls.audioTracks.map((t, i) => ({ id: i, label: t.name || t.lang || `Áudio ${i + 1}` })));
          });
          hls.on(HlsMod.Events.AUDIO_TRACK_SWITCHED, (_e, d) => setCurrentAudio(d.id));
          hls.on(HlsMod.Events.SUBTITLE_TRACKS_UPDATED, () => {
            setSubTracks(hls.subtitleTracks.map((t, i) => ({ id: i, label: t.name || t.lang || `Legenda ${i + 1}` })));
          });
          hls.on(HlsMod.Events.ERROR, (_e, data) => {
            if (!data.fatal) return;
            switch (data.type) {
              case HlsMod.ErrorTypes.NETWORK_ERROR:
                if (data.response?.code === 502 || data.response?.code === 404) {
                  hlsHandledError.current = true;
                  setLoading(false);
                  setReconnecting(false);
                  setError("Este título está temporariamente indisponível no servidor de origem (Provedor offline).");
                  hls.destroy();
                  break;
                }
                setReconnecting(true);
                reconnectAttempts.current += 1;
                if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
                if (reconnectAttempts.current > 10) {
                  setLoading(false);
                  setReconnecting(false);
                  setError("Este canal/filme não respondeu. Tente outro conteúdo.");
                  hls.destroy();
                  break;
                }
                reconnectTimer.current = setTimeout(() => {
                  try {
                    if (reconnectAttempts.current <= 4) {
                      hls.startLoad();
                    } else {
                      // Hard reload of the stream from scratch.
                      hls.stopLoad();
                      hls.loadSource(source.url);
                      hls.startLoad();
                    }
                  } catch {
                    /* ignore */
                  }
                }, Math.min(1200 * reconnectAttempts.current, 5000));
                break;
              case HlsMod.ErrorTypes.MEDIA_ERROR:
                hlsHandledError.current = true;
                try {
                  hls.recoverMediaError();
                } catch {
                  setError("Erro de mídia. Tente recarregar.");
                }
                break;
              default:
                hlsHandledError.current = true;
                setError("Não foi possível reproduzir este conteúdo.");
                hls.destroy();
            }
          });
          hls.on(HlsMod.Events.FRAG_LOADED, () => {
            reconnectAttempts.current = 0;
            setReconnecting(false);
          });
        } else if (video!.canPlayType("application/vnd.apple.mpegurl") || video!.canPlayType("application/x-mpegurl")) {
          // Native HLS (Safari/iOS) — force native AVPlayer on iOS
          video!.src = finalUrl;

          // iOS Safari: force native AVPlayer fullscreen as soon as video is ready
          const enterIOSNative = () => {
            if (isIOS && typeof (video as any).webkitEnterFullscreen === "function") {
              try {
                (video as any).webkitEnterFullscreen();
              } catch (e) {
                console.warn("iOS webkitEnterFullscreen failed:", e);
              }
            }
          };

          const onNativeMeta = () => {
            setLoading(false);
            seekToStart();
            if (autoPlay) {
              const playPromise = video!.play();
              if (playPromise && playPromise.then) {
                playPromise.then(() => {
                  // iOS only allows webkitEnterFullscreen after play() resolves
                  enterIOSNative();
                }).catch((err) => {
                  console.warn("iOS Autoplay blocked:", err);
                  setPlaying(false);
                });
              } else {
                enterIOSNative();
              }
            }
          };

          if (video!.readyState >= 1) {
            onNativeMeta();
          } else {
            video!.addEventListener("loadedmetadata", onNativeMeta, { once: true });
            video!.addEventListener("loadeddata", onNativeMeta, { once: true });
            video!.addEventListener("canplay", onNativeMeta, { once: true });
            try { video!.load(); } catch (e) {}
          }
        } else {
          setError("Seu navegador não suporta este formato de transmissão.");
        }
      } else {
        // Native playback (MP4, MKV, etc)
        video!.src = finalUrl;
        const enterIOSNative = () => {
          if (isIOS && typeof (video as any).webkitEnterFullscreen === "function") {
            try {
              (video as any).webkitEnterFullscreen();
            } catch (e) {
              console.warn("iOS webkitEnterFullscreen failed:", e);
            }
          }
        };

        const onNativeMeta = () => {
          setLoading(false);
          seekToStart();
          if (autoPlay) {
            const playPromise = video!.play();
            if (playPromise && playPromise.then) {
              playPromise.then(() => {
                enterIOSNative();
              }).catch((err) => {
                console.warn("Autoplay blocked:", err);
                setPlaying(false);
              });
            } else {
              enterIOSNative();
            }
          }
        };

        if (video!.readyState >= 1) {
          onNativeMeta();
        } else {
          video!.addEventListener("loadedmetadata", onNativeMeta, { once: true });
          video!.addEventListener("loadeddata", onNativeMeta, { once: true });
          video!.addEventListener("canplay", onNativeMeta, { once: true });
          try { video!.load(); } catch (e) {}
        }
      }
    }

    setup();

    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (nativeRetryTimer.current) clearTimeout(nativeRetryTimer.current);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute("src");
      video.load();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNativePlatform && !source.isLive ? `${playlistKey}\u0001${forceReinit ?? 0}` : source.url]);

  // Auto-detect black screen (playing audio with 0 videoWidth/videoHeight on Web)
  useEffect(() => {
    if (Capacitor.isNativePlatform() && !source.isLive) return;
    if (!playing) return;

    const timer = setTimeout(() => {
      const v = videoRef.current;
      if (!v) return;
      if (!v.paused && v.currentTime > 0.3 && (v.videoWidth === 0 || v.videoHeight === 0)) {
        console.warn("Black screen detected (videoWidth=0). HEVC/4K unsupported directly in browser. Switching to server transcode...");
        const targetUrl = currentUrlRef.current || source.url;
        if (!targetUrl.includes("/api/public/transcode") && !transcodeTriedRef.current) {
          transcodeTriedRef.current = true;
          setLoading(true);
          const tcUrl = buildTranscodeUrl(targetUrl);
          import("hls.js").then((HlsMod) => {
            if (!HlsMod.default.isSupported()) return;
            v.removeAttribute("src");
            v.load();
            const hls = new HlsMod.default({
              enableWorker: true,
              lowLatencyMode: false,
              fragLoadingMaxRetry: 5,
              manifestLoadingMaxRetry: 5,
            });
            hls.loadSource(tcUrl);
            hls.attachMedia(v);
            hlsRef.current = hls;
            hls.on(HlsMod.default.Events.MANIFEST_PARSED, () => {
              setLoading(false);
              setError(null);
              v.play().catch(() => setPlaying(false));
            });
          }).catch(() => {});
        }
      }
    }, 1800);

    return () => clearTimeout(timer);
  }, [playing, source.url]);

  // ---- network online/offline ----
  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      if (hlsRef.current) {
        try {
          hlsRef.current.startLoad();
        } catch {
          /* ignore */
        }
      } else {
        videoRef.current?.play().catch(() => {});
      }
    };
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // ---- video element events ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handlePlay = () => setPlaying(true);
    const handlePause = () => {
      setPlaying(false);
      if (onPauseRef.current && video.duration) onPauseRef.current(video.currentTime, video.duration);
    };
    const handleWaiting = () => setLoading(true);
    const handleCanPlay = () => setLoading(false);
    const handlePlaying = () => {
      setLoading(false);
      setReconnecting(false);
    };
    const handleTimeUpdate = () => {
      if (video.currentTime > 0) setLoading(false);
      setCurrent(video.currentTime);
      const totalDur = effectiveDurationRef.current || (knownDuration && Number.isFinite(knownDuration) && knownDuration > 0 ? knownDuration : (video.duration || 0));
      if (onProgressRef.current && totalDur > 0) onProgressRef.current(video.currentTime, totalDur);
    };
    const handleDurationChange = () => {
      if (!effectiveDurationRef.current || effectiveDurationRef.current <= 0) {
        setDuration(video.duration || 0);
      }
    };
    const handleEnded = () => {
      const dur = effectiveDurationRef.current || (knownDuration && Number.isFinite(knownDuration) && knownDuration > 0 ? knownDuration : (video.duration || 0));
      if (!source.isLive && dur > 30 && video.currentTime < dur - 10) {
        console.warn(`Stream reached temporary buffer end at ${video.currentTime}s of ${dur}s. Buffering next segments...`);
        setLoading(true);
        return;
      }
      onEndedRef.current?.();
    };
    const handleVolumeChange = () => {
      setMuted(video.muted);
      setVolume(video.volume);
    };
    const handleVideoError = (e: Event) => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("check-auth"));
      }
      // If hls.js already handled this error, suppress the native fallback
      // to avoid double error messages and conflicting recovery attempts.
      if (hlsHandledError.current) {
        hlsHandledError.current = false;
        return;
      }

      const mediaErr = (e.target as HTMLVideoElement)?.error;
      const code = mediaErr?.code ?? -1;
      const MSG_MAP: Record<number, string> = {
        1: "MEDIA_ERR_ABORTED — carregamento abortado pelo usuário.",
        2: "MEDIA_ERR_NETWORK — erro de rede ao baixar a mídia.",
        3: "MEDIA_ERR_DECODE — erro ao decodificar o vídeo (codec incompatível?).",
        4: "MEDIA_ERR_SRC_NOT_SUPPORTED — formato ou URL não suportado.",
      };
      const detail = MSG_MAP[code] ?? `Código desconhecido (${code})`;
      console.error(
        `Native Video Element Error [code=${code}]: ${detail}`,
        mediaErr?.message ?? "",
        e
      );

      // For network or decode errors, attempt automatic retry (up to 3x)
      // before surfacing the error to the user. This handles transient
      // glitches in MP4 / native-HLS streams (Safari/iOS).
      if (code === 2 && nativeRetryCount.current < 3) {
        nativeRetryCount.current += 1;
        setReconnecting(true);
        const delay = 1500 * nativeRetryCount.current;
        console.warn(`Native player: retry ${nativeRetryCount.current}/3 in ${delay}ms…`);
        nativeRetryTimer.current = setTimeout(() => {
          const v = videoRef.current;
          if (!v) return;
          try {
            const currentSrc = v.currentSrc || v.src;
            v.src = currentSrc;
            v.load();
            v.play().catch(() => setPlaying(false));
          } catch {
            /* ignore */
          } finally {
            setReconnecting(false);
          }
        }, delay);
        return;
      }

      // MEDIA_ERR_SRC_NOT_SUPPORTED or too many retries
      setLoading(false);
      setReconnecting(false);

      // If native player failed with format error (code 4), try HLS fallbacks:
      // 1) .m3u8 conversion trick (upstream-provided HLS)
      // 2) server-side ffmpeg transcoding (/api/public/transcode)
      if ((code === 3 || code === 4) && !hlsRef.current) {
        console.warn(`Native format/decode error (code ${code}). Attempting fallback HLS stream with transcode...`);
        setLoading(true);

        const targetUrl = currentUrlRef.current || "";
        const hlsUrl = buildFallbackHlsUrl(targetUrl);
        reportClientError(`stream-code${code}`, `raw=${buildTranscodeUrl(targetUrl)}`);

        import("hls.js").then((HlsMod) => {
          if (!HlsMod.default.isSupported()) return;
          v.removeAttribute("src");
          v.load();

          const createHls = (url: string) => {
            const hls = new HlsMod.default({
              enableWorker: true,
              lowLatencyMode: false,
              fragLoadingMaxRetry: 5,
              manifestLoadingMaxRetry: 5,
            });
            hls.loadSource(url);
            hls.attachMedia(v);
            return hls;
          };
          const onReady = (hls: any) => {
            hls.on(HlsMod.default.Events.MANIFEST_PARSED, () => {
              setLoading(false);
              setError(null);
              v.play().catch(() => setPlaying(false));
            });
          };
          const onFatal = (hls: any) => {
            hls.on(HlsMod.default.Events.ERROR, (_e, data) => {
              if (!data.fatal) return;
              if (!transcodeTriedRef.current) {
                transcodeTriedRef.current = true;
                try {
                  hls.destroy();
                } catch {
                  /* ignore */
                }
                console.warn("HLS conversion failed. Trying server-side transcoding...");
                const tcUrl = buildTranscodeUrl(targetUrl);
                reportClientError("stream-fallback-hls-failed", `tc=${tcUrl}`);
                const hls2 = createHls(tcUrl);
                hlsRef.current = hls2;
                onReady(hls2);
                onFatal(hls2);
                return;
              }
              try {
                hls.destroy();
              } catch {
                /* ignore */
              }
              hlsRef.current = null;
              setLoading(false);
              reportClientError("stream-transcode-failed", `tc=${buildTranscodeUrl(targetUrl)}`);
              setError("Formato de vídeo não suportado pelo navegador e servidor sem suporte a conversão.");
            });
          };

          const initialUrl = buildTranscodeUrl(targetUrl);
          if (initialUrl.includes('/transcode')) {
            transcodeTriedRef.current = true;
          }
          const hls = createHls(initialUrl);
          hlsRef.current = hls;
          onReady(hls);
          onFatal(hls);
        }).catch(() => {});
        return;
      }

      if (code === 4) {
        setError("Formato de vídeo não suportado neste dispositivo. Tente outro canal.");
      } else if (code === 2) {
        setError("Erro de rede ao carregar a transmissão. Verifique sua conexão.");
      } else {
        setError("Erro ao carregar a transmissão no seu dispositivo.");
      }
    };
    video.addEventListener("error", handleVideoError);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("volumechange", handleVolumeChange);
    return () => {
      video.removeEventListener("error", handleVideoError);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("volumechange", handleVolumeChange);
    };
  }, []);

  // ---- fullscreen and rotation ----
  
  // Effective lockLandscape: true on mobile by default (declare first!)
  const effectiveLockLandscape = lockLandscape ?? isMobile;

  const forceLandscape = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { ScreenOrientation } = await import('@capacitor/screen-orientation');
        await ScreenOrientation.lock({ orientation: 'landscape' });
      } catch (e) {
        console.warn("Screen orientation lock failed", e);
      }
    }
  }, []);

  const restoreOrientation = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { ScreenOrientation } = await import('@capacitor/screen-orientation');
        await ScreenOrientation.unlock();
      } catch (e) {
        console.warn("Screen orientation unlock failed", e);
      }
    }
  }, []);

  // Lock orientation when mounted on mobile/native platform, restore on unmount
  useEffect(() => {
    if (source.isLive) {
      if (fullscreen) {
        forceLandscape();
      } else {
        restoreOrientation();
      }
      return;
    }
    if (effectiveLockLandscape || isMobile) {
      forceLandscape();
    }
    return () => {
      restoreOrientation();
      const video = videoRef.current;
      if (video && video.currentTime > 0 && video.duration) {
        onPauseRef.current?.(video.currentTime, video.duration);
      }
    };
  }, [effectiveLockLandscape, isMobile, source.isLive, fullscreen, forceLandscape, restoreOrientation]);

  // Sync full-screen styling class to body
  useEffect(() => {
    document.body.classList.toggle("video-fullscreen-active", fullscreen);
    return () => {
      document.body.classList.remove("video-fullscreen-active");
    };
  }, [fullscreen]);

  // Desktop browser HTML5 fullscreen change handler
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;

    const onFs = () => {
      const isFs = !!document.fullscreenElement;
      setFullscreen(isFs);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);

  // Hardware Back button on Android (Capacitor)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let backListener: any;
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (controlsVisible) {
        setControlsVisible(false);
        if (hideTimer.current) clearTimeout(hideTimer.current);
        if (menu) setMenu(null);
        return;
      }
      if (onExitFullscreen) {
        // Save the last known native position before leaving (the native exit
        // event may not fire when back goes through Capacitor's JS listener).
        if (lastNativeTimeRef.current > 0 && onPauseRef.current) {
          onPauseRef.current(lastNativeTimeRef.current, lastNativeDurRef.current);
        }
        restoreOrientation();
        onExitFullscreen();
      } else if (fullscreen) {
        restoreOrientation();
        setFullscreen(false);
      } else if (source.isLive) {
        restoreOrientation();
        setFullscreen(false);
      } else if (canGoBack) {
        restoreOrientation();
        window.history.back();
      } else {
        restoreOrientation();
        CapacitorApp.exitApp();
      }
    }).then(l => {
      backListener = l;
    });

    return () => {
      if (backListener) backListener.remove();
    };
  }, [controlsVisible, menu, onExitFullscreen, fullscreen, source.isLive, restoreOrientation]);

  // Auto-fullscreen on mount only for native Capacitor apps (APKs) for VOD
  useEffect(() => {
    if (Capacitor.isNativePlatform() && !source.isLive) {
      setFullscreen(true);
      forceLandscape();
    }
  }, [forceLandscape, source.isLive]);

  // Auto-fullscreen on web / iOS Safari / Capacitor: when a video opens (movie/series), enter native
  // fullscreen right away instead of playing inline.
  useEffect(() => {
    if (!autoFullscreen) return;

    if (Capacitor.isNativePlatform()) {
      setFullscreen(true);
      forceLandscape();
      return;
    }

    const enterFs = () => {
      const v = videoRef.current;
      if (v && typeof (v as any).webkitEnterFullscreen === "function" && isIOS) {
        try {
          (v as any).webkitEnterFullscreen();
          return;
        } catch (e) {}
      }
      const el = containerRef.current;
      if (!document.fullscreenElement) {
        safeRequestFullscreen(el, v);
      }
    };

    const video = videoRef.current;
    if (video) {
      video.addEventListener("play", enterFs);
      video.addEventListener("loadedmetadata", enterFs);
      video.addEventListener("canplay", enterFs);
    }
    const t = setTimeout(enterFs, 250);
    return () => {
      clearTimeout(t);
      if (video) {
        video.removeEventListener("play", enterFs);
        video.removeEventListener("loadedmetadata", enterFs);
        video.removeEventListener("canplay", enterFs);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Intercept webkitendfullscreen (native iOS Safari exit button pressed)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onWebkitEndFullscreen = () => {
      setFullscreen(false);
      // Se o usuário fechou o player nativo do iOS no 'OK'/'X', fecha a tela do player
      if (onExitFullscreenRef.current) {
        onExitFullscreenRef.current();
      }
    };
    video.addEventListener("webkitendfullscreen", onWebkitEndFullscreen);
    return () => video.removeEventListener("webkitendfullscreen", onWebkitEndFullscreen);
  }, []);

  // Intercept physical Back button on TV remote to close player
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key;
      if (
        key === "BrowserBack" ||
        key === "GoBack" ||
        key === "Escape" ||
        (e as KeyboardEvent & { keyCode?: number }).keyCode === 10009
      ) {
        e.preventDefault();
        e.stopPropagation();
        
        // Se os controles estiverem visíveis, o primeiro 'Voltar' apenas esconde a barra
        if (controlsVisible) {
          setControlsVisible(false);
          if (hideTimer.current) clearTimeout(hideTimer.current);
          if (menu) setMenu(null);
          return;
        }

        if (document.fullscreenElement) {
          safeExitFullscreen();
        }
        if (onExitFullscreenRef.current) onExitFullscreenRef.current();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onExitFullscreen, controlsVisible, menu]);

  // Sync refs whenever state changes (no deps needed — always runs)
  playingRef.current = playing;
  menuRef.current = menu;

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (playingRef.current) {
      hideTimer.current = setTimeout(() => {
        if (!menuRef.current) setControlsVisible(false);
      }, 3500);
    }
  }, []);

  // Keep controls visible whenever video is paused (web player only — no APK)
  useEffect(() => {
    if (Capacitor.isNativePlatform() && !source.isLive) return;
    if (!playing) {
      setControlsVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    }
  }, [playing, source.isLive]);

  const togglePlay = useCallback(() => {
    // No APK (player nativo), o play/pause é controlado pelo overlay nativo para VOD.
    if (Capacitor.isNativePlatform() && !source.isLive) return;
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      const p = v.play();
      if (p && p.then) {
        p.then(() => {
          if (isIOS && typeof (v as any).webkitEnterFullscreen === "function") {
            try { (v as any).webkitEnterFullscreen(); } catch (e) {}
          }
        }).catch(() => {});
      } else if (isIOS && typeof (v as any).webkitEnterFullscreen === "function") {
        try { (v as any).webkitEnterFullscreen(); } catch (e) {}
      }
    } else {
      v.pause();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, []);

  const increaseVolume = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.min(1, v.volume + 0.1);
    v.muted = false;
  }, []);

  const decreaseVolume = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.max(0, v.volume - 0.1);
    if (v.volume === 0) v.muted = true;
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (Capacitor.isNativePlatform()) {
      setFullscreen(prev => {
        const next = !prev;
        if (next) {
          forceLandscape();
        } else {
          restoreOrientation();
          if (onExitFullscreenRef.current) onExitFullscreenRef.current();
        }
        return next;
      });
      return;
    }
    const v = videoRef.current;
    if (isIOS && v && typeof (v as any).webkitEnterFullscreen === "function") {
      try {
        (v as any).webkitEnterFullscreen();
        return;
      } catch (e) {}
    }
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) safeExitFullscreen();
    else safeRequestFullscreen(el, v);
  }, [forceLandscape, restoreOrientation, onExitFullscreen]);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(t, v.duration || t));
  }, []);

  // keyboard / remote control
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // APENAS processar atalhos de teclado/controle se estiver em TELA CHEIA.
      if (!fullscreen) return;

      const v = videoRef.current;
      if (!v) return;

      // Atalho super útil: se pressionar Esquerda/Direita com os controles ocultos (assistindo),
      // ou com o foco na barra de progresso, nós adiantamos/voltamos 10s manualmente 
      // interceptando o evento ANTES do navegador (TV) bagunçar o `input range`.
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (!controlsVisible) {
          e.preventDefault();
          seek(v.currentTime + (e.key === "ArrowRight" ? 10 : -10));
          showControls();
          return;
        } else {
          const active = document.activeElement;
          const isProgress = active && active.tagName === "INPUT" && (active as HTMLInputElement).type === "range";
          if (isProgress) {
            e.preventDefault();
            seek(v.currentTime + (e.key === "ArrowRight" ? 10 : -10));
            return;
          }
        }
      }

      // Always show controls on any key press
      showControls();

      // Se os controles estão escondidos, bloqueia atalhos normais exceto Play/Pause/Midia
      if (!controlsVisible) {
        const isMediaKey = ["MediaPlayPause", "MediaPlay", "MediaPause", "Play", "Pause", "MediaTrackNext", "MediaTrackPrevious", "MediaFastForward", "MediaRewind", "AudioVolumeUp", "VolumeUp", "AudioVolumeDown", "VolumeDown", "AudioVolumeMute", "VolumeMute"].includes(e.key);
        
        if (!isMediaKey) {
          if (["ArrowUp", "ArrowDown", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            // Focar o botão de play automaticamente
            setTimeout(() => {
              const playBtn = containerRef.current?.querySelector('.btn-play-pause') as HTMLElement;
              if (playBtn) playBtn.focus();
            }, 50);
          }
          return;
        }
      }

      switch (e.key) {
        case " ":
        case "Enter":
          if ((e.target as HTMLElement).tagName !== "BUTTON" && (e.target as HTMLElement).tagName !== "INPUT") {
            e.preventDefault();
            togglePlay();
          }
          break;
        case "MediaPlayPause":
        case "MediaPlay":
        case "MediaPause":
        case "Play":
        case "Pause":
          e.preventDefault();
          togglePlay();
          break;
        case "MediaRewind":
        case "Rewind":
        case "MediaTrackPrevious":
          if (onPrev) onPrev();
          break;
        case "MediaFastForward":
        case "FastForward":
        case "MediaTrackNext":
          if (onNext) onNext();
          break;
        case "AudioVolumeUp":
        case "VolumeUp":
        case "+":
          increaseVolume();
          break;
        case "AudioVolumeDown":
        case "VolumeDown":
        case "-":
          decreaseVolume();
          break;
        case "AudioVolumeMute":
        case "VolumeMute":
          toggleMute();
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "m":
        case "M":
          toggleMute();
          break;
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [seek, showControls, togglePlay, toggleFullscreen, toggleMute, increaseVolume, decreaseVolume, source.isLive, fullscreen, controlsVisible]);

  const selectLevel = (id: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = id; // -1 = auto
      setCurrentLevel(id);
    }
    try {
      const height = id === -1 ? "auto" : String(levels.find((l) => l.id === id)?.height ?? "auto");
      localStorage.setItem(QUALITY_PREF_KEY, height);
    } catch {
      /* ignore */
    }
    setMenu(null);
  };

  const selectAudio = (id: number) => {
    if (hlsRef.current) hlsRef.current.audioTrack = id;
    setMenu(null);
  };
  const selectSub = (id: number) => {
    if (hlsRef.current) hlsRef.current.subtitleTrack = id; // -1 = off
    setCurrentSub(id);
    setMenu(null);
  };
  const selectSpeed = (s: number) => {
    if (videoRef.current) videoRef.current.playbackRate = s;
    setSpeed(s);
    setMenu(null);
  };

  const reload = () => {
    setError(null);
    setLoading(true);
    if (Capacitor.isNativePlatform()) {
      // Re-launch the native ExoPlayer overlay instead of the web player.
      startNativePlayRef.current?.();
      return;
    }
    if (hlsRef.current) {
      hlsRef.current.startLoad();
    } else if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  };

  const lastMousePos = useRef({ x: 0, y: 0 });
  const isRemoteMode = useRef(false);

  // Intercepta qualquer tecla globalmente para ativar o modo controle remoto
  useEffect(() => {
    const handleGlobalKey = () => { isRemoteMode.current = true; };
    const handleGlobalClick = () => { isRemoteMode.current = false; };
    window.addEventListener('keydown', handleGlobalKey, { capture: true });
    window.addEventListener('mousedown', handleGlobalClick, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleGlobalKey, { capture: true });
      window.removeEventListener('mousedown', handleGlobalClick, { capture: true });
    };
  }, []);

  return (
    <div
      ref={containerRef}
      data-fullscreen={fullscreen ? "true" : undefined}
      className={`relative w-full bg-black select-none ${
        fullscreen
          ? "fixed inset-0 z-50 h-screen w-screen aspect-auto"
          : "aspect-video"
      }`}
      style={{ transform: "translateZ(0)" }}
      onMouseMove={(e) => {
        if (isRemoteMode.current) return;
        
        // Ignora micro-movimentos falsos (muito comum em TV Boxes e controles Air Mouse)
        const dx = Math.abs(e.clientX - lastMousePos.current.x);
        const dy = Math.abs(e.clientY - lastMousePos.current.y);
        if (dx > 10 || dy > 10) {
          lastMousePos.current = { x: e.clientX, y: e.clientY };
          showControls();
        }
      }}
      onClick={() => {
        isRemoteMode.current = false;
        if (menu) setMenu(null);
        else showControls();
      }}
    >
      {/* Renderiza <video> no site e no APK para transmissões ao vivo (mini-player/tela cheia) */}
      {(!Capacitor.isNativePlatform() || source.isLive) && (
        <video
          ref={videoRef}
          poster={!playing ? poster : undefined}
          playsInline
          className={`absolute inset-0 block h-full w-full ${fitMode === "fill" ? "object-fill" : "object-contain"}`}
          style={{ zIndex: 0 }}
          onDoubleClick={toggleFullscreen}
        />
      )}

      {/* Loading / reconnect overlay */}
      {(loading || reconnecting) && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="flex flex-col items-center gap-2 text-foreground">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            {reconnecting && <span className="text-sm font-medium">Reconectando…</span>}
          </div>
        </div>
      )}

      {offline && (
        <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full bg-destructive/90 px-3 py-1.5 text-xs font-semibold text-destructive-foreground">
          <WifiOff className="h-3.5 w-3.5" /> Sem internet — aguardando conexão
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
          <WifiOff className="h-12 w-12 text-destructive" />
          <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
          <button
            onClick={reload}
            className="focusable inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <RotateCcw className="h-4 w-4" /> Tentar novamente
          </button>
        </div>
      )}

      {/* Center play button */}
      {(!Capacitor.isNativePlatform() || source.isLive) && !playing && !loading && !error && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          className="focusable absolute inset-0 z-10 flex items-center justify-center"
          aria-label="Reproduzir"
        >
          <span className="grid h-20 w-20 place-items-center rounded-full bg-primary/90 text-primary-foreground shadow-glow transition-transform hover:scale-105">
            <Play className="h-9 w-9 translate-x-0.5" fill="currentColor" />
          </span>
        </button>
      )}

      {/* Title bar with Back Button */}
      {(!Capacitor.isNativePlatform() || source.isLive) && (
        <div
          className={`absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-black/85 via-black/40 to-transparent p-4 transition-opacity ${
            controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {onExitFullscreen && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (document.fullscreenElement) {
                  safeExitFullscreen();
                }
                onExitFullscreenRef.current?.();
              }}
              className="focusable grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/60 text-foreground transition-all hover:scale-105 hover:bg-black/90"
              aria-label="Voltar"
              title="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            {title && <h2 className="line-clamp-1 font-display text-lg font-bold text-foreground drop-shadow">{title}</h2>}
            {subtitle && <p className="line-clamp-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      )}

      {/* Controls bar */}
      {(!Capacitor.isNativePlatform() || source.isLive) && (
        <div
          className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 to-transparent px-3 pb-3 pt-10 transition-opacity ${
            controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
        {/* Progress bar */}
        {!source.isLive ? (
          <div className="mb-2 flex items-center gap-3">
            <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{formatTime(current)}</span>
            <input
              type="range"
              min={0}
              max={effectiveDuration || 0}
              step={0.1}
              value={current}
              onChange={(e) => seek(Number(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  seek(current - 10);
                } else if (e.key === "ArrowRight") {
                  e.preventDefault();
                  seek(current + 10);
                }
              }}
              className="focusable h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-primary"
              aria-label="Progresso"
            />
            <span className="w-12 text-xs tabular-nums text-muted-foreground">{formatTime(effectiveDuration)}</span>
          </div>
        ) : (
          <div className="mb-2 flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-0.5 text-xs font-bold text-destructive-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> AO VIVO
            </span>
            <Wifi className="h-3.5 w-3.5 text-primary" />
            {levels.length > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-foreground">
                {currentLevel === -1 && (
                  <span className="rounded bg-primary px-1 text-[10px] font-bold text-primary-foreground">AUTO</span>
                )}
                {currentLevel === -1
                  ? shortQuality(activeHeight) || "Auto"
                  : levels.find((l) => l.id === currentLevel)?.label || "Auto"}
              </span>
            )}
          </div>
        )}


        <div className="flex items-center gap-1">
          <CtrlButton className="btn-play-pause" onClick={togglePlay} label={playing ? "Pausar" : "Reproduzir"}>
            {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5" fill="currentColor" />}
          </CtrlButton>

          <div className="group flex items-center">
            <CtrlButton onClick={toggleMute} label="Mudo">
              {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </CtrlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = videoRef.current;
                if (!v) return;
                v.volume = Number(e.target.value);
                v.muted = Number(e.target.value) === 0;
              }}
              className="h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/20 accent-primary transition-all duration-200 group-hover:w-20"
              aria-label="Volume"
            />
          </div>

          <div className="flex-1" />

          {onPrev && (
            <CtrlButton onClick={onPrev} label={prevLabel || "Anterior"}>
              <SkipBack className="h-5 w-5" />
            </CtrlButton>
          )}

          {onNext && (
            <CtrlButton onClick={onNext} label={nextLabel || "Próximo"}>
              <SkipForward className="h-5 w-5" />
            </CtrlButton>
          )}

          {/* Settings menu */}
          <div className="relative">
            <CtrlButton onClick={() => setMenu(menu ? null : "main")} label="Configurações">
              <Settings className={`h-5 w-5 transition-transform ${menu ? "rotate-45" : ""}`} />
            </CtrlButton>

            {menu && (
              <div className="absolute bottom-12 right-0 w-52 overflow-hidden rounded-xl border border-border bg-popover/95 text-sm shadow-card backdrop-blur">
                {menu === "main" && (
                  <ul>
                    <MenuRow label="Velocidade" value={`${speed}x`} onClick={() => setMenu("speed")} />
                    {levels.length > 0 && (
                      <MenuRow
                        label="Qualidade"
                        value={
                          currentLevel === -1
                            ? `Auto${shortQuality(activeHeight) ? ` · ${shortQuality(activeHeight)}` : ""}`
                            : levels.find((l) => l.id === currentLevel)?.label || "Auto"
                        }
                        onClick={() => setMenu("quality")}
                      />

                    )}
                    {audioTracks.length > 1 && (
                      <MenuRow
                        label="Áudio"
                        value={audioTracks.find((a) => a.id === currentAudio)?.label || "Padrão"}
                        onClick={() => setMenu("audio")}
                      />
                    )}
                    {subTracks.length > 0 && (
                      <MenuRow
                        label="Legendas"
                        value={currentSub === -1 ? "Desligadas" : subTracks.find((s) => s.id === currentSub)?.label || "—"}
                        onClick={() => setMenu("subs")}
                      />
                    )}
                  </ul>
                )}
                {menu === "speed" && (
                  <MenuList
                    title="Velocidade"
                    onBack={() => setMenu("main")}
                    options={SPEEDS.map((s) => ({ id: s, label: `${s}x`, active: s === speed }))}
                    onSelect={(id) => selectSpeed(id)}
                  />
                )}
                {menu === "quality" && (
                  <MenuList
                    title="Qualidade"
                    onBack={() => setMenu("main")}
                    options={[
                      { id: -1, label: "Automático (Recomendado)", active: currentLevel === -1 },
                      ...levels
                        .slice()
                        .sort((a, b) => (b.height || 0) - (a.height || 0))
                        .map((l) => ({ id: l.id, label: l.label, active: l.id === currentLevel })),
                    ]}

                    onSelect={(id) => selectLevel(id)}
                  />
                )}
                {menu === "audio" && (
                  <MenuList
                    title="Áudio"
                    onBack={() => setMenu("main")}
                    options={audioTracks.map((a) => ({ id: a.id, label: a.label, active: a.id === currentAudio }))}
                    onSelect={(id) => selectAudio(id)}
                  />
                )}
                {menu === "subs" && (
                  <MenuList
                    title="Legendas"
                    onBack={() => setMenu("main")}
                    options={[
                      { id: -1, label: "Desligadas", active: currentSub === -1 },
                      ...subTracks.map((s) => ({ id: s.id, label: s.label, active: s.id === currentSub })),
                    ]}
                    onSelect={(id) => selectSub(id)}
                  />
                )}
              </div>
            )}
          </div>

          <CtrlButton
            onClick={() => {
              const next = fitMode === "contain" ? "fill" : "contain";
              setFitMode(next);
              try {
                localStorage.setItem("flowtv:fit", next);
              } catch {}
            }}
            label={fitMode === "contain" ? "Esticar imagem (Tela Cheia)" : "Ajustar imagem (Original)"}
          >
            <span className="text-[9px] font-bold border border-foreground/50 rounded px-1 py-0.5 tracking-wider bg-white/5">
              {fitMode === "contain" ? "ESTICAR" : "AJUSTAR"}
            </span>
          </CtrlButton>

          <CtrlButton onClick={toggleFullscreen} label="Tela cheia">
            {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </CtrlButton>
        </div>
      </div>
      )}
    </div>
  );
});

function CtrlButton({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="focusable grid h-10 w-10 place-items-center rounded-lg text-foreground/90 transition-colors hover:bg-white/10 hover:text-foreground"
    >
      {children}
    </button>
  );
}

function MenuRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <li>
      <button
        onClick={onClick}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-foreground transition-colors hover:bg-white/10"
      >
        <span>{label}</span>
        <span className="text-xs text-muted-foreground">{value}</span>
      </button>
    </li>
  );
}

function MenuList({
  title,
  options,
  onSelect,
  onBack,
}: {
  title: string;
  options: { id: number; label: string; active: boolean }[];
  onSelect: (id: number) => void;
  onBack: () => void;
}) {
  return (
    <div>
      <button
        onClick={onBack}
        className="flex w-full items-center gap-2 border-b border-border px-4 py-2.5 text-left font-semibold text-foreground hover:bg-white/10"
      >
        ‹ {title}
      </button>
      <ul className="max-h-60 overflow-auto">
        {options.map((o) => (
          <li key={o.id}>
            <button
              onClick={() => onSelect(o.id)}
              className={`flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-white/10 ${
                o.active ? "text-primary" : "text-foreground"
              }`}
            >
              {o.label}
              {o.active && <span className="text-primary">●</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
